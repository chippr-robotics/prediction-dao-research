# Quickstart: verifying the Hardhat 3 migration

How to check each phase actually did what it claims. Every scenario below maps to an invariant in
[contracts/migration-invariants.md](./contracts/migration-invariants.md) and a requirement in
[spec.md](./spec.md).

**Two standing rules for this repository**, both learned the hard way:

- **Never run the frontend suite unfiltered** — `vitest run` with no filter OOMs this environment.
  Nothing here needs it; the frontend is unaffected by the migration.
- **Never trust a gate that ran after a failed build.** Delete `artifacts/` and `cache/` before any
  byte comparison until I2 is fixed, and after it is fixed, confirm the gate refuses stale input.

---

## Prerequisites

`@uma/core` removal (PR #1089) must be merged. Hardhat 3's first compile fails without it: it
resolves per package, so `@uma/core`'s nested OpenZeppelin 4.9.6 collides with the root 5.4.0 and two
`IERC20` declarations conflict.

```bash
node -e "console.log('uma present:', !!require('./package.json').devDependencies['@uma/core'])"
# expected: uma present: false
```

---

## S1 — Staging works: Hardhat 2 still runs under an ESM root *(Phase 1)*

The assumption the whole staging strategy rests on. **Already measured once** (R1a) — re-run after
the real rename.

```bash
npm run compile
npx hardhat test $(ls test/*.test.js test/**/*.test.js | grep -v '^test/fork/')
```

**Expected**: compiles, and the suite passes at its pre-migration count. Phase 1 is mechanical by
construction; any behaviour change is a finding, not a fix-forward.

**Watch for**: `ReferenceError: require is not defined in ES module scope` — a file that still needs
renaming. `Cannot find module './x'` — a specifier that needs an explicit extension, because Node's
CommonJS resolver does not try `.cjs`.

---

## S2 — The digest gate refuses stale artifacts *(Phase 2, I2)*

Mutation test. This must fail *before* the fix and pass *after*.

```bash
# 1. produce good artifacts
npm run compile
# 2. break the source so the next compile fails
printf '\nthis is not solidity\n' >> contracts/access/SanctionsGuard.sol
npm run compile          # expected: FAILS
# 3. the gate must NOT report on the stale artifacts left from step 1
node scripts/codegen/bytecode-digest.js --compare specs/075-monorepo-workspaces/baseline-bytecode.json
# expected AFTER the fix: fails, citing stale/absent build output
# observed BEFORE the fix: "OK: bytecode byte-identical to baseline."   <-- the defect
git checkout -- contracts/access/SanctionsGuard.sol
```

---

## S3 — Executable code is unchanged for all 96 contracts *(Phase 4, I1 / FR-001 / SC-001)*

The migration's stop condition. Requires artifacts from **both** toolchains built from the **same
source tree** — capture the old ones before swapping.

```bash
# before the swap
npm run compile && cp -r artifacts /tmp/artifacts-hh2
# after the swap
npm run compile
node scripts/codegen/compare-stripped.js /tmp/artifacts-hh2 artifacts   # Phase 4 deliverable
```

**Expected**: a per-contract report, 96 of 96 identical after stripping the metadata block.

**Reference values** measured in the spike:

| Contract | Runtime bytes (both toolchains) | Metadata |
|---|---|---|
| `SanctionsGuard` | 2,090 | 53 B, differs |
| `FeeRouter` | 6,612 | 53 B, differs |

**If any contract's stripped code differs**: stop. That is behaviour change, not provenance change,
and the migration's safety argument does not cover it.

**Also check here** (R8): that WASM-compiled output matches native. Untested in the spike. If it
differs, `preferWasm` is not a drop-in.

---

## S4 — The upgrade-safety gate still protects live proxies *(Phase 4, I3 / SC-002, SC-003)*

Two halves. **The passing half alone is not evidence** — a gate that examines nothing also passes.

```bash
npm run check:storage-layout
```

**Expected**: `26 live implementation(s) diffed`, `4 declared unverifiable`,
`Coverage floors met on 7 chains`, exit 0.

Then prove it still bites:

```bash
# insert a slot above existing state and shrink the trailing gap
#   contracts/apps/MiniAppRegistry.sol:  uint256 private _spikeInjectedSlot;  above _apps
#   and reduce __gap by 1
npm run check:storage-layout
# expected: FAILS, naming MiniAppRegistry and the live impls on mordor-63 and polygon-137
git checkout -- contracts/apps/MiniAppRegistry.sol
```

---

## S5 — The suite still detects regressions *(Phase 3/4, I6 / FR-008)*

```bash
# break a contract invariant, not a test
npm test    # expected: FAILS
```

Apply the same treatment to each rewritten config guardrail individually — remove an explicit EVM
target from one build profile, point an override at a file that does not exist — and confirm each
fails. These guardrails exist because 116 of 120 contracts once inherited an unpinned EVM target;
rewriting them against a new config shape is precisely where they can quietly stop asserting.

And to a sample of the 27 converted `.reverted` assertions: confirm the converted form still fails
against a contract that does **not** revert.

---

## S6 — No file is silently skipped *(Phase 3, I5 / FR-009)*

```bash
ls test/*.test.js test/**/*.test.js | grep -v '^test/fork/' | wc -l   # files on disk
npm test 2>&1 | grep -E "passing|failing|[0-9]+ files"                 # files collected
```

**Expected**: the counts agree. A suite that runs 80 of 101 files and reports "all passing" is the
failure mode this guards.

---

## S7 — The connected chain is the intended chain *(Phase 4, I7 / R5)*

```bash
npx hardhat test test/config/*.test.js
```

**Expected**: an assertion that the connected chain id equals the configured one (1337), failing if a
default supplies 31337 instead. Recorded deployment files are keyed by chain id, so this is a silent
wrong-record hazard, not a loud one.

---

## S8 — The deploy path works, proven not assumed *(Phase 3, FR-011 / SC-005)*

**Compiling is not evidence.** The spike never ran a single one of the 177 scripts.

```bash
npx hardhat node &                     # disposable chain
npm run deploy:local
# then, for each script: run it, confirm its on-chain effect and its recorded output
```

**Expected per script**: the effect it claims, and `deployments/hardhat-chain1337-v2.json` written in
the existing format. An in-place proxy upgrade must leave the proxy address unchanged, change the
implementation address, and preserve stored state.

**Forking tests are out of scope here** — they need live RPC and are validated separately.

---

## S9 — The retired tooling is gone and its replacements work *(Phase 4, FR-014/015/016)*

```bash
npx hardhat test --coverage
npx hardhat test --gas-stats
node -e "const d=require('./package.json').devDependencies;
  for (const p of ['solidity-coverage','hardhat-gas-reporter','typechain','@typechain/hardhat','@typechain/ethers-v6','solc'])
    console.log(p, p in d ? 'STILL PRESENT <<<' : 'removed')"
grep -rn "FORCE_SOLCJS" hardhat.config.* || echo "FORCE_SOLCJS: gone"
```

**Expected**: reports produced with no separate tool installed; every package reported `removed`;
`FORCE_SOLCJS` absent. Note `--gas-stats` was only ever seen in `--help` during the spike — this is
its first real execution.

---

## S10 — Nothing was deployed *(I4 / SC-006)*

```bash
git diff --stat origin/main -- deployments/
```

**Expected**: empty. This migration touches no live chain.
