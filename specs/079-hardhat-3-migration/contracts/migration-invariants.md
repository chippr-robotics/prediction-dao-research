# Migration invariants

The properties every phase must preserve. This is the contract the migration is held to — if one of
these stops holding, the phase does not merge.

Each invariant states **how it is checked**, because several of the defects this migration exists to
fix were gates that reported success without having checked anything.

---

## I1 — Executable code does not change

For all 96 bytecode-producing contracts, the compiled bytes with the appended CBOR metadata block
removed are identical before and after.

**Checked by**: comparing stripped bytes per contract between artifacts built from the *same source
tree* on the old and new toolchain. Metadata length is self-describing (final two bytes), so the
split needs no heuristic.

**Fails closed**: any contract whose stripped code differs is reported by name and blocks the phase.
A contract missing from either side is a failure, not a skip.

**Why it is stated this way**: the whole safety argument is the distinction between *provenance
changed* and *behaviour changed*. Sampling two contracts does not establish it for 96.

---

## I2 — A gate never reports on inputs it did not examine

Any gate protecting deployed code must establish that the build output it read was produced by the
build under test, and fail when it cannot.

**Checked by**: mutation — break the compile, run the gate, confirm it fails.

**Why it exists**: measured, not hypothetical. `bytecode-digest.js --compare` printed
`OK: bytecode byte-identical to baseline` immediately after a compile that had **failed** (#1090).
The same class produced #1084, where the byte gate passed a compiler bump because the run never
reached the path that would have changed bytes.

---

## I3 — The upgrade-safety gate still rejects unsafe layouts

**Checked by**: inserting a field ahead of existing state and shrinking the trailing gap, then
confirming the gate fails and names both the contract and the live implementation.

**Not accepted as evidence**: the gate passing. A gate that has stopped examining anything also
passes.

**Coverage floor**: ≥26 implementations, ≥7 chains, with the 4 declared-undiffable entries still
reported and their reasons intact.

---

## I4 — Nothing is deployed

No transaction is broadcast to any live chain by this migration.

**Checked by**: no phase includes a deploy step against a non-disposable chain; disposable-chain
verification uses a local node only.

---

## I5 — An unmigrated file fails loudly

Partial migration is the expected intermediate state. Anything not yet converted must error when
invoked and must never be silently excluded from a run.

**Checked by**: comparing the count of test files collected against the count on disk, so a file that
stops being picked up fails the run rather than shrinking it quietly.

**Why**: a suite that silently runs 80 of 101 files still reports "all passing".

---

## I6 — Tests still detect regressions

**Checked by**: introducing a deliberate contract fault and confirming the suite fails.

Applied specifically to:
- the rewritten config guardrails (each property broken individually — an unpinned EVM target, an
  override naming a non-existent file — and confirmed to fail);
- a sample of the 27 `.reverted` → `.revert(ethers)` conversions, confirmed to still fail against a
  contract that does *not* revert.

**Why**: converting an assertion is exactly where a test quietly stops asserting. The conversion is
mechanical; the confirmation that it still bites is not.

---

## I7 — The connected chain is the intended chain

Scripts and tests connect to an explicitly configured chain id, never an inherited default.

**Checked by**: an assertion that the connected chain id equals the configured one.

**Why**: Hardhat 3's default network is chain id 31337 where this repository configures 1337, and
recorded deployment files are keyed by chain id. Nothing about this fails loudly on its own — a
script simply reads or writes the wrong record.

---

## I8 — Deterministic cross-chain addresses are not silently lost

The five contracts with genuine CREATE2 cross-chain parity (`safeProposalHub`,
`backupPointerRegistry`, `openERC20Impl`, `openERC721Impl`, `restrictedERC20Impl`) keep their
recorded status, and deploying any of them to a new chain requires explicit sign-off.

**Checked by**: the enumeration in `data-model.md`, which records the determinism *mechanism*
alongside each address — CREATE2 depends on bytecode, plain CREATE does not.

**Why the mechanism is recorded and not just the address**: without it, the apparent blast radius
included `accountFactory` on 8 chains, implying passkey account addresses would stop being
chain-independent. They will not. A future reader must be able to reach that conclusion without
re-deriving it.

---

## I9 — The admin key path is changed deliberately

The config's `require()` closure that must become `.cjs` includes the floppy-key admin-key loader.

**Checked by**: hand review of that closure, separately from any codemod. No key material is read,
logged, or moved by the migration.

---

## I10 — Each phase leaves the repository honest

Every merged change leaves `main` compiling, with the gates running and giving a truthful verdict,
whether or not the migration is complete (FR-019).

**Checked by**: the gates themselves, on every phase — not only at the end.
