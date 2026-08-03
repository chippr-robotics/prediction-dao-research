# Quickstart: Validating the Monorepo Workspace Conversion

**Feature**: 074-monorepo-workspaces | **Phase 1 design artifact**

Runnable validation scenarios, one per phase. Each is the evidence that its phase is safe to merge.
Run from the repository root on branch `074-monorepo-workspaces`.

**Prerequisites**: Node ≥ 22 (measured: 24.9.0), npm ≥ 11 (measured: 11.6.0), a working
`npm install`, and network access for solc on a cold cache.

> **Local suite caveat**: never run the full frontend suite unfiltered — it OOMs in this
> environment. Scope it (`npx vitest run src/test/<file>`) or use the sharded projects introduced
> in Phase 6. CI runs the full suite.

---

## S0. Record the bytecode baseline (do this FIRST, on an unmodified tree)

Everything else compares against this. *(FR-005, SC-001)*

```bash
npm run compile
node -e '
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const out={}; const walk=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{
  const p=path.join(d,e.name);
  if(e.isDirectory()) return walk(p);
  if(!e.name.endsWith(".json")||d.includes("build-info")) return;
  const a=JSON.parse(fs.readFileSync(p,"utf8"));
  if(!a.bytecode) return;
  out[a.contractName+"@"+p]=crypto.createHash("sha256")
    .update(a.bytecode+"|"+(a.deployedBytecode||"")).digest("hex");
});
walk("artifacts/contracts");
fs.writeFileSync("/tmp/bytecode-baseline.json", JSON.stringify(out,null,1));
console.log("recorded", Object.keys(out).length, "contracts");
'
```

**Expected**: a contract count recorded and the file written. Keep it for S1 and S3.

---

## S1. Phase 1 — declaring the compiler target is byte-neutral

*(US1, FR-001, FR-005, SC-001, SC-002)*

```bash
# after adding evmVersion: "paris" to the 0.8.24 profile
npm run clean && npm run compile
# re-run the S0 snapshot into /tmp/bytecode-after.json, then:
node -e '
const a=require("/tmp/bytecode-baseline.json"), b=require("/tmp/bytecode-after.json");
const ka=Object.keys(a), kb=Object.keys(b);
const diff=ka.filter(k=>a[k]!==b[k]);
console.log("contracts:",ka.length,"->",kb.length);
console.log("DIFFERING:",diff.length);
diff.slice(0,20).forEach(k=>console.log("  !",k));
process.exit(diff.length||ka.length!==kb.length?1:0);
'
```

**Expected**: `DIFFERING: 0`, exit 0.

**If it exits non-zero — STOP.** Do not merge. The currently deployed bytecode was built to an
unknown EVM target, and that is an incident to resolve against the 33 live implementations before
anything ships. *(spec Edge Cases)*

Then confirm the new gates:

```bash
npx hardhat test test/config/CompilerTargets.test.js   # every profile + override declares a target
npm run check:storage-layout                            # must report compared > 0, and FAIL if 0
npm test
```

---

## S2. Phase 2 — the pipeline can fail again

*(US2, FR-007, FR-008, SC-004, SC-005, SC-006, SC-007)*

Static checks first:

```bash
grep -rn "continue-on-error" .github/workflows/ | grep -v "^.*#"   # expect: only justified aux steps
grep -rn "|| true" .github/workflows/                              # expect: no Slither hit
grep -c "concurrency:" .github/workflows/*.yml                     # expect: every PR-triggered workflow
```

Then prove the gate can fail — this is the whole point:

```bash
# temporarily break one spec, push to the branch, observe CI
sed -i 's/cy.visit(/cy.visit("DELIBERATE_FAILURE_"+(/' frontend/cypress/e2e/fast/<some>.cy.js
```

**Expected**: the e2e job reports **failure**. Revert immediately after observing.

**Expected on the real code**: red, with real accumulated failures (review reports ~63, dominated by
one `.entry-gate-overlay` click interception). **Fix them at the source — never re-weaken the
gate.** *(FR-011)*

Then confirm trigger hygiene:

```bash
gh run list --branch 074-monorepo-workspaces --limit 20
```

**Expected**: each workflow appears **once** per commit; a docs-only commit triggers only docs jobs;
pushing a second commit cancels the first run.

---

## S3. Phase 3 — workspaces without changing a single committed byte

*(US3, US7, FR-012–FR-023, SC-008–SC-011, SC-017)*

**Step 1 — baselines before touching anything** *(FR-019)*:

```bash
# 1a. mini-app content hashes from the chain, BOTH cohorts
node scripts/miniapps/record-baseline.js --chain 137 --chain 63 \
  --out specs/074-monorepo-workspaces/baseline-miniapps.json
# 1b. today's built bytes, same tree
node frontend/src/test/miniapps/fixtures/regenerate.mjs
git diff --exit-code frontend/src/test/miniapps/fixtures/   # expect clean BEFORE any change
```

The baseline file must record, per app per chain: `manifestHash`, `cid`, and **whether HEAD
reproduces it** — or `unreachable`. A missing value is never a pass. *(B1)*

**Step 2 — extend the fixture to import `ethers`** *(FR-021)*. The existing fixture deliberately
excludes it, so it is blind to the shim that actually matters. Add the fixture, regenerate, commit.

**Step 3 — prerequisite commit**: drop `@uniswap/v3-sdk`, `jsbi`, `@walletconnect/ethereum-provider`,
`@walletconnect/modal` (verified zero import sites). Own commit.

**Step 4 — convert**, then validate:

```bash
rm -rf node_modules */node_modules && npm install
test "$(find . -name package-lock.json -not -path '*/node_modules/*' | wc -l)" = "1" && echo "OK: one lockfile"
npm query ".workspace" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).map(w=>w.name).sort().join("\n")))'
```

**Expected members**: `@fairwins/abi`, `@fairwins/intent-types`, `@fairwins/miniapp-build`,
`@fairwins/miniapp-clearpath`, `@fairwins/miniapp-token-mint`, `fairwins-pool-relayer`,
`fairwins-relay-gateway`, `frontend`, `prediction-dao-research-subgraph`.

**Step 5 — the three blocking gates**:

```bash
# (a) bytecode unchanged vs S0
npm run clean && npm run compile   # re-run the S1 comparison; expect DIFFERING: 0

# (b) fixture bytes unchanged — now WITH the ethers fixture
node frontend/src/test/miniapps/fixtures/regenerate.mjs
git diff --exit-code frontend/src/test/miniapps/fixtures/

# (c) real packages byte-identical BEFORE vs AFTER on the same tree
npm run build --workspace @fairwins/miniapp-token-mint
npm run build --workspace @fairwins/miniapp-clearpath
sha256sum frontend/miniapps/*/dist/entry.js frontend/miniapps/*/dist/manifest.json
```

Compare (c) against the Step 1b digests. **Any difference blocks the merge** until explained; if
real, the package must be re-published and re-approved on-chain. *(FR-022)*

**Step 6 — the toolchain survival gate** *(R12.4)*:

```bash
npm run codegen --workspace prediction-dao-research-subgraph
npm run build   --workspace prediction-dao-research-subgraph
```

Must pass **before** `subgraph/package-lock.json` is deleted.

**Step 7 — scoped installs still work** *(FR-016)*:

```bash
time npm ci --workspace fairwins-relay-gateway --include-workspace-root=false
```

**Expected**: does not regress toward the ~2,100-package superset (~299 today).

**Step 8 — boundary enforcement, all three directions** *(SC-017)*:

```bash
# each of these must be REJECTED
echo "import x from '../../src/lib/wagerVm.js'"        >> frontend/miniapps/token-mint/src/entry.jsx
echo "import y from '@fairwins/miniapp-token-mint'"    >> frontend/src/App.jsx        # NEW leak direction
echo "import z from '../../../tools/miniapp-build/index.js'" >> frontend/src/test/miniapps/hostScope.test.js
npm run lint --workspace frontend && npx vitest run frontend/src/test/miniapps/packageBoundary.test.js
```

**Expected**: all three rejected. Revert after. If the third passes, the eslint `ignores` narrowing
was not applied.

---

## S4. Phase 4 — one EIP-712 source, machine-checked

*(US4, FR-024–FR-029, SC-012)*

```bash
npx hardhat test test/intent/TypehashParity.test.js
```

**Expected**: all 29 actions green, each asserting `keccak256(typeString)` equals the contract's
`*_TYPEHASH` literal — **except** EIP-3009 `ReceiveWithAuthorization`, which asserts against a
recorded fixed vector because its authoritative typehash lives in the deployed USDC contract, not
here. *(FR-027)*

```bash
# consumers read the package, not a local literal
grep -rn "@fairwins/intent-types" frontend/src/lib/relay/ frontend/src/lib/pools/ services/relay-gateway/src/intent/
# the gap is closed
node -e '
const g=await import("./services/relay-gateway/src/intent/intentTypes.js");
console.log("gateway actions:", Object.keys(g.ACTIONS).length);  // expect 29, was 28
' --input-type=module
```

Then a live round-trip: sign one intent per rail against a local hardhat deploy, confirm
`ecrecover` returns the expected signer, and confirm the **never-stranded self-submit fallback**
still works with the gateway unreachable.

---

## S5. Phase 5 — ABIs are generated and drift is caught

*(US5, FR-030–FR-034, SC-013, SC-014)*

```bash
npm run compile
node scripts/codegen/emit-abis.js
node scripts/codegen/emit-abis.js --check        # expect exit 0
```

Prove the gate can fail:

```bash
node -e 'const f="packages/abi/json/WagerRegistry.json";const a=require("./"+f);a.pop();require("fs").writeFileSync(f,JSON.stringify(a,null,2))'
node scripts/codegen/emit-abis.js --check        # expect NON-ZERO + names the disagreement
git checkout packages/abi/json/WagerRegistry.json
```

Two specific checks:

```bash
# WagerRegistry must be the MERGED two-facet ABI (FR-031)
node -e 'const a=require("./packages/abi/json/WagerRegistry.json");
console.log("WithSig entries:", a.filter(e=>/WithSig$/.test(e.name||"")).length)'   # expect > 0

# no traversals into frontend/src/abis remain, no vendored copies remain (FR-034)
grep -c "frontend/src/abis" subgraph/subgraph.yaml   # expect 0
ls subgraph/abis/ 2>/dev/null                        # expect absent/empty
```

Finally, `graph codegen && graph build`, the full frontend suite in CI, and a live read against
Polygon confirming event decoding is unchanged.

---

## S6. Phase 6 — the target graph, validated before it is trusted

*(US6, FR-036–FR-043, SC-015, SC-016)*

**First, with caching disabled** *(FR-041)*:

```bash
npx turbo run lint test build check --force
```

**Expected**: every target's pass/fail matches the pre-turbo pipeline — 100%, no exceptions.

Then enable local cache and verify invalidation:

```bash
touch contracts/wagers/WagerRegistry.sol && npx turbo run build --dry=json | \
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
  console.log(j.tasks.filter(t=>t.cache?.status!=="HIT").map(t=>t.taskId).join("\n"))})'
```

| Touch | Expected to re-run |
|---|---|
| a `.sol` file | `compile`, `test`, `coverage`, `abi#codegen`, and downstream |
| a `.md` file | **nothing** |
| `tenants/<id>/manifest.json` | `frontend#build`, `frontend#test` |
| `services/relay-gateway/src/paymaster/build.js` | `//:test` (the cross-layer AA34 guard) |
| `export AMOY_RPC_URL=…` | `//:test` cache key changes |

```bash
npx turbo run check-storage-layout --dry=json | grep -i cache   # expect: never cacheable
```

**Known-limitation check**: with an `AMOY_RPC_URL` line in an untracked `.env` (not exported),
confirm whether `//:test`'s key moves. If it does not, the limitation is real and must be
documented, not papered over. *(target-graph.md §Known limitations)*

---

## S7. Phase 7 — archive rule is mechanical

```bash
grep -rn "contracts-archive\|test-archive" --include="*.js" --include="*.sol" --include="*.yml" \
  . | grep -v "^./archive/" | grep -v node_modules | grep -v "^./specs/" | grep -v "^./docs/"
```

**Expected**: no hits outside `archive/`, `specs/`, `docs/`.

---

## Full-gauntlet regression (run before each phase merges)

```bash
npm run compile
npm test
npm run check:storage-layout
npm run test:coverage
npm run tenants:validate
npm run build --workspace frontend
npm test  --workspace fairwins-relay-gateway
npm run codegen --workspace prediction-dao-research-subgraph && npm run build --workspace prediction-dao-research-subgraph
# frontend suite: CI only, or scoped locally (OOM)
```
