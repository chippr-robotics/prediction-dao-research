# Phase 0 Research: Hardhat 3 toolchain migration

Every finding below was measured, not inferred. Where something was *not* measured, it says so —
those are the risks that carry into implementation.

---

## R1: How to stage an atomic module-system flip into reviewable changes

**This is the central design problem of the migration**, and the spec's own requirements collide
here: FR-018 forbids combining the test conversion with the script conversion, FR-019 requires every
delivered change to leave the gates giving an honest verdict — but the flip itself is atomic.

**Why it is atomic**: Hardhat 3 refuses to run unless the repository root declares ESM. The moment
that declaration flips, every file that reaches Hardhat must already be ESM. Measured: 274 files
`require("hardhat")` (97 test + 177 scripts). The obvious escape hatch — a nested
`{"type": "commonjs"}` in `scripts/` and `test/` — **fails for exactly the files that matter**:

```
Error [ERR_REQUIRE_ASYNC_MODULE]: require() cannot be used on an ESM graph
with top-level await.
```

It works only for files that never touch Hardhat, which makes it a trap rather than a strategy: it
appears to work until someone adds an import.

**Decision: stage via explicit `.cjs`, converting in reviewable batches, with the toolchain swap
last.**

1. Flip the root declaration to ESM and rename every currently-CommonJS root-scope file to `.cjs`,
   including `hardhat.config.js` → `hardhat.config.cjs`. **Hardhat 2 continues to work** — it
   supports a CommonJS config under an ESM root. This is mass churn but purely mechanical, changes
   no behaviour, and is verifiable by the full existing suite passing unchanged.
2. Convert `.cjs` → ESM in independently reviewable batches, still on Hardhat 2. ESM files can
   consume Hardhat 2 (CommonJS) through default-import interop, so each batch is testable the moment
   it lands.
3. Swap the toolchain last. By then the config is the only CommonJS file left, and the change is
   dependencies + config + the gate port — small enough to review closely, which is what it deserves.

**Rationale**: this is the only option that satisfies FR-018 and FR-019 against a genuinely atomic
constraint. Each step leaves `main` working with gates that run honestly, and the step that carries
the real risk is small and reviewed on its own rather than buried in a 21k-line diff.

**Alternatives considered**:

- *Big-bang single change* — rejected. A 21k-LOC test diff plus 177 unreviewable script conversions
  is not a reviewable change, and it puts the atomic flip and every mechanical rename in the same
  blast radius.
- *Long-lived integration branch, one merge to main* — rejected as the primary strategy. It
  satisfies reviewability but defeats FR-019 for `main`, and a branch carrying a module-system flip
  will conflict with every concurrent change to `scripts/` and `test/`. Held in reserve if step 2
  proves unstable.
- *Shim-first without renames* — rejected. Routing every file through one helper reduces the
  *surface* that knows about Hardhat, but the files remain CommonJS, so the flip still converts 274
  files at once. It solves the wrong axis.

### R1a: The staging assumption, measured

The strategy above rests on one assumption — that Hardhat 2 tolerates an ESM root with a `.cjs`
config. **Measured directly against this repository (Hardhat 2.29.0), and it holds:**

```
Compiled 4 Solidity files successfully (evm target: paris).
```

Getting there surfaced two constraints that materially change the work, and neither was obvious:

1. **The config's entire transitive `require()` closure must also become `.cjs`**, not just the
   config. The first attempt failed inside a helper the config pulls in:

   ```
   ReferenceError: require is not defined in ES module scope
     at scripts/operations/floppy-key/loader.js:5:12
   ```

   For this repository the closure is small and known: the floppy-key `loader` / `keystore` /
   `config`, and `scripts/deploy/lib/explorers`. Note this closure includes the **admin key**
   loading path, so it is a place to change carefully rather than mechanically.

2. **Every intra-repo `require()` specifier must gain an explicit extension.** Node's CommonJS
   resolver tries `.js`, `.json`, `.node` — **not** `.cjs` — so an extensionless
   `require('./loader')` fails after the rename:

   ```
   Error: Cannot find module './scripts/operations/floppy-key/loader'
   ```

   This is the hidden cost of the `.cjs` route: the rename is not just a rename, it is a rename plus
   a specifier rewrite across every file that requires a renamed sibling. It is still mechanical and
   still verifiable by the suite, but it is a larger diff than "rename N files" implies, and any
   estimate that treats it as a pure rename is wrong.

The experiment was reverted; `package.json` and the renamed files are back to their committed state
and compilation was re-verified afterwards.

---

## R2: Verifying FR-001 across all 96 contracts, not 2

**Finding**: the spike compared metadata-stripped runtime code on exactly **two** contracts
(`SanctionsGuard` 2,090 bytes, `FeeRouter` 6,612 bytes — both equal). The other 94 were compared by
digest only, which tells you they *changed* but not that the change was confined to metadata. FR-001
requires the stronger claim for every contract.

**Decision**: a comparison harness that, for each of the 96 bytecode-producing contracts, strips the
appended CBOR metadata from both the old and the new build and asserts equality of the remainder,
reporting per contract.

Metadata length is self-describing: the final two bytes hold the block's length, so the split needs
no heuristics.

```
strip(hex): len = int(hex[-4:], 16); return hex[: -(len + 2) * 2]
```

**Both builds must be produced from the same source tree**, differing only in toolchain — otherwise
the comparison measures source drift as well. That means capturing the pre-migration artifacts
before the toolchain swap and comparing against them, not against the recorded digest baseline
(which stores digests, not bytes, and so cannot support a stripped comparison).

**Rationale**: this is the migration's stop condition. A per-contract result is what distinguishes
"provenance changed" from "behaviour changed", and only the stripped comparison can tell them apart.

**Alternatives considered**: comparing full bytecode (useless — it is *expected* to differ);
trusting the two sampled contracts (rejected — 94 unverified contracts is not a safety argument);
comparing ABIs instead (weaker — identical ABI does not imply identical code, though the converse
holds and is used in R6).

---

## R3: Gate freshness (FR-005)

**Finding, measured**: `bytecode-digest.js --compare` reported

```
OK: bytecode byte-identical to baseline.
```

immediately after `npm run compile` had **failed**. It compared artifacts left over from the
previous successful build. Filed as issue #1090.

This is the same failure class as the compiler hazard behind #1084, where the byte gate passed a
compiler version bump because the run used the native binary and never exercised the fallback path
that would have changed bytes. Both are *a gate reporting on inputs the run did not actually reach*.

**Decision**: the digest tool must establish that the artifacts it reads were produced by the build
under test, and fail closed when it cannot. Preferred mechanism: a build stamp written by a
successful compile and checked by the gate; the tool invoking the compile itself is acceptable but
couples the gate to build time.

**This must land in Phase 1**, because Phase 1's entire safety claim rests on that gate.

**Rejected**: documenting "delete artifacts first". A gate whose correctness depends on remembering
a manual step is precisely the defect being fixed.

---

## R4: Contracts supplied by npm packages have no artifacts

**Finding**: Hardhat 3 emits no build output for contracts inside `node_modules`.
`artifacts/@openzeppelin`, `artifacts/@safe-global`, `artifacts/@chainlink` are empty directories.
`getContractFactory("@safe-global/…/SafeL2")` therefore fails — **26 call sites across 18 test
files**.

Three routes were tested:

| Route | Result |
|---|---|
| Add `node_modules` as a source root | **Refused** — `HHE900: The file is inside your node_modules directory` |
| The existing `SafeVendorImports.sol` re-import pattern | **Does not rescue it** — still 0 Safe artifacts |
| A project-source subclass | **Works** — verified: `TestERC1967Proxy` produced an artifact and `WagerRegistry.test.js` went 74/74 |

**Decision**: add test-only subclasses under the existing test-contract scope for each npm contract a
test instantiates by name.

**Production is unaffected** — measured: **0** scripts use `getContractFactory` with an npm path;
deployments go through `upgrades.deployProxy`, which uses the plugin's own bundled artifact.

**Constraint carried into the plan**: these wrappers are new contracts in the compilation unit, so
they appear in the compiled-output record as **additions**. Any of them appearing as a *modification*
to a shipped contract is a defect, and the record must distinguish the two.

---

## R5: The default network changed meaning

**Finding, measured**: two BridgeRouter tests failed with `expected 31337 to equal 1337`. Hardhat 3's
default network is `default` at chain id **31337**, not the `hardhat` entry in the config, which this
repository sets to **1337**.

This is the most dangerous single finding in the migration because **nothing fails loudly**: a test
or script simply runs against a different chain id than the author intended. Recorded deployment
files are keyed by chain id (`hardhat-chain1337-v2.json`), so a silent change here writes to, or
reads from, the wrong record.

**Decision**: set the chain id explicitly rather than relying on any default, and add a test that
asserts the connected chain id is the configured one — so a future default change fails loudly
instead of silently.

**Rejected**: renumbering the repository to 31337. It would invalidate the existing recorded
deployment file and every reference to 1337, to accommodate a default rather than a requirement.

---

## R6: Deterministic addresses derive from the bytes that changed (FR-006)

**Finding**: `scripts/deploy/` deploys several contracts through CREATE2 with
`generateSalt`/`SALT_PREFIXES` **specifically so the address matches across chains**. Their own
comments say so — one notes it uses "the SAME deterministic CREATE2 salt as deploy.js so the address
matches", another that a redeploy lands at the "same CREATE2 address … for testing".

A CREATE2 address is derived from the creation bytecode. The metadata change alters creation
bytecode. Therefore **a future deployment of one of these contracts lands at a different address than
its existing siblings on other chains** — breaking the exact property the determinism was chosen to
provide.

**Nothing already deployed moves.** The effect is entirely on future deployments, which is what makes
it easy to miss.

**Decision**: enumerate every deterministically-addressed contract, record for each whether it is
already deployed and on which chains, and treat "deploy an existing deterministic contract to a new
chain" as a decision requiring explicit sign-off rather than a routine operation. The enumeration
belongs in `data-model.md` and must be produced from the deploy scripts, not from memory.

**Alternatives considered**: pinning metadata off (`bytecodeHash: "none"`) to restore determinism —
rejected for now, because it *also* changes bytecode relative to what is deployed today and removes
the source-verification link entirely; it trades a known, bounded consequence for a broader one. It
is recorded here as the option to revisit if cross-chain address parity turns out to be load-bearing.

---

## R7: The config meta-tests are guardrails, not scaffolding

**Finding**: 6 of the 17 post-codemod failures are `CompilerTargets` and `CiGates` — tests that
assert the *shape of the Hardhat 2 configuration*, including that every compiler entry and every
per-file override declares an explicit EVM target, and that every override names a file that is
actually in the compile graph.

These exist because of a real incident: before spec 075, 116 of 120 contracts inherited an
unpinned EVM target, so the deployable target was decided by a compiler default rather than by this
repository.

**Decision**: rewrite them against Hardhat 3's build-profile shape, preserving both properties —
every profile declares its target explicitly, and every override names a live file. **Deleting or
relaxing them is out of the question**; they are the reason the EVM target is pinned at all.

**Risk carried**: rewriting a guardrail against a new config shape is exactly where a test quietly
stops asserting anything. Each rewritten test must be mutation-tested — break the property, confirm
the test fails — not merely observed to pass.

---

## R8: What the migration retires

Confirmed available as built-in capability in 3.12.0 (`hardhat --help`):

```
--coverage         Enables code coverage
--gas-stats        Collects and displays gas usage statistics …
--gas-stats-json   Write gas usage statistics to a JSON file …
```

| Removed | Replaced by | Note |
|---|---|---|
| `solidity-coverage` | built-in `--coverage` | migration guide directs removal |
| `hardhat-gas-reporter` | built-in `--gas-stats` | **not executed in the spike**, only seen in `--help` |
| `typechain` + 2 plugins | nothing | vestigial: zero consumers, not configured |
| npm `solc` | Hardhat's own WASM solc via `preferWasm` | retires the #1084 hazard entirely |

`preferWasm` is a first-class, zod-validated option settable per build profile
(`solidity/config.ts:100`), so the `FORCE_SOLCJS` subtask override — unrepairable anyway, since
Hardhat 3 removes subtask overriding and `builtin-tasks/task-names` — is deleted rather than ported.

**Not measured**: that WASM-compiled output is byte-identical to native for this repository. If the
two differ, `preferWasm` is not a drop-in and the affected profile must stay on native. This must be
checked in Phase 1 alongside R2, since both are metadata-stripped comparisons over the same build.

---

## R9: Dependency updates this unblocks

`@nomicfoundation/hardhat-chai-matchers` 3.0.0 releases the `chai` 4 → 6 hold (issue #1053), which
currently fails to install at all:

```
Found: chai@6.2.2
peer chai@"^4.2.0" from @nomicfoundation/hardhat-chai-matchers@2.1.2
```

Carried consequence, measured: under chai-matchers v3, bare `.reverted` is no longer valid — **27
occurrences across 20 test files** must become `.revert(ethers)`. Mechanical, but it is a change to
assertions, so a sample must be mutation-tested to confirm the converted form still fails on a
contract that does not revert.

Issue #1086 (ESLint toolchain) and #1051 (`@noble` v2) are **not** unblocked by this migration; they
were parked for unrelated reasons and stay parked.
