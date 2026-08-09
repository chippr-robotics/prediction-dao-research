# Feature Specification: Hardhat 3 toolchain migration

**Feature Branch**: `079-hardhat-3-migration`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Migrate the contract toolchain from Hardhat 2 to Hardhat 3."

## Context

The contract toolchain has been accumulating deferred work: a compiler version pinned by hand
because a hidden fallback path makes it decide bytecode, a test-assertion library held back because
a plugin peer-depends on the old major, a coverage tool that drags in a legacy dependency tree, and
a growing list of dependency updates parked behind "we cannot move until the framework moves".

The framework can now move. Every plugin this repository cannot do without has shipped a version
that accepts the new major — including the upgrade-safety plugin, which is the one that could have
vetoed the migration outright, because this repository operates upgradeable proxies at stable
addresses whose storage layout is checked against 26 live implementations across 7 chains.

A measurement spike established that the migration is feasible, that the upgrade-safety gate keeps
working (verified by deliberately corrupting a storage layout and confirming the gate rejected it),
and that the dominant cost is not the framework's API changes but a module-system change that
touches every script and test in the repository root.

The spike also established the one fact that governs everything else in this specification: **the
new toolchain changes the compiled output of every contract that produces bytecode.** The executable
code is unchanged — the difference is confined to an appended metadata block that records which
source files went into the build, and the new toolchain names those files differently. Nothing
on-chain behaves differently, but anything that assumed "the same source produces the same bytes"
must be re-established deliberately rather than assumed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The build and its safety gates still tell the truth (Priority: P1)

A contributor compiles the contracts on the new toolchain and runs the gates that protect deployed
code. The gates either pass honestly or fail loudly with an accurate reason. The change in compiled
output is recognised, explained, and accepted deliberately — never absorbed silently.

**Why this priority**: Every other story depends on the contracts compiling, and the upgrade-safety
gate is the only thing standing between a bad storage layout and a bricked proxy holding member
funds. If this story cannot be delivered, the migration must not proceed at all. It is also the only
story that carries an irreversible consequence, so it is the one that must be proven first.

**Independent Test**: Compile the full contract set on the new toolchain, then run the
upgrade-safety check against the live implementations and the compiled-output comparison against the
recorded baseline. Deliberately corrupt a storage layout and confirm the check rejects it. This
delivers value on its own: it establishes whether the migration is safe to continue.

**Acceptance Scenarios**:

1. **Given** the contract set on the new toolchain, **When** a contributor compiles, **Then** every
   contract compiles with the same compiler version and the same target as before.
2. **Given** a compiled contract set, **When** the executable code of every contract is compared to
   the old toolchain's output with the appended metadata block excluded, **Then** every contract is
   identical, and any contract that is not is reported by name and blocks the change.
3. **Given** the live estate, **When** the upgrade-safety check runs, **Then** it reaches the same
   number of live implementations as before, reports the same ones as undiffable for the same
   recorded reasons, and passes.
4. **Given** a storage layout deliberately corrupted by inserting a field ahead of existing state,
   **When** the upgrade-safety check runs, **Then** it fails and names the offending contract and
   the live implementation it is incompatible with.
5. **Given** the compiled-output baseline is re-recorded, **When** a reviewer reads the change,
   **Then** the record states which contracts changed, that only the metadata block moved, and what
   the consequence is for already-deployed contracts.

---

### User Story 2 - The contract test suite runs and passes (Priority: P2)

A contributor runs the contract test suite on the new toolchain and gets the same verdict they got
before: every test that passed still passes, and failures are real failures rather than artifacts of
the migration.

**Why this priority**: The test suite is the enforcement layer for contract correctness. Until it
runs, the migration cannot be evaluated for regressions, and no other change to the repository can
be reviewed with confidence. It ranks below the gates because a test suite that has not yet been
converted is an inconvenience, whereas a broken upgrade-safety gate is a hazard.

**Independent Test**: Run the full non-forking contract test suite on the new toolchain and compare
the pass count to the pre-migration baseline. Delivers value on its own: contributors regain the
ability to verify contract changes.

**Acceptance Scenarios**:

1. **Given** the migrated test suite, **When** a contributor runs it, **Then** the number of passing
   tests is at least the pre-migration count and there are no failures.
2. **Given** a test that relies on a contract supplied by an external package rather than by this
   repository, **When** the suite runs, **Then** it resolves that contract successfully or fails
   with a message naming the contract, never by silently skipping.
3. **Given** the migrated suite, **When** a contributor introduces a deliberate contract regression,
   **Then** the suite fails — proving the tests still exercise the contracts rather than passing
   vacuously.
4. **Given** a test file that has not been converted, **When** the suite runs, **Then** it fails
   loudly rather than being silently excluded from the run.

---

### User Story 3 - The deploy and operations path is proven, not assumed (Priority: P3)

An operator runs the deploy, upgrade, and operational scripts on the new toolchain against a
disposable chain and gets the same results as before: contracts deploy, proxies upgrade in place,
and recorded addresses are written correctly.

**Why this priority**: This is the largest unmeasured risk in the migration. The spike never
converted or executed a single one of these scripts, so there is currently no evidence the deploy
path works at all. It ranks below the test suite only because a broken deploy path is discovered
before it is used, whereas a broken test suite hides regressions continuously. It must not be
merged on the strength of "it compiles".

**Independent Test**: Execute every deploy and operational script against a disposable local chain
and confirm each produces its expected on-chain effect and its expected recorded output. Delivers
value on its own: it restores the ability to deploy and operate.

**Acceptance Scenarios**:

1. **Given** a disposable chain, **When** an operator runs the full deployment, **Then** every
   contract deploys and the recorded address file matches the shape produced before the migration.
2. **Given** a deployed proxy on a disposable chain, **When** an operator performs an in-place
   upgrade, **Then** the proxy address is unchanged, the implementation address changes, and stored
   state survives.
3. **Given** a script that reads or writes recorded deployment addresses, **When** it runs, **Then**
   it reads and writes the same file format as before the migration.
4. **Given** any script that has not been converted, **When** it is invoked, **Then** it fails
   immediately with a clear error rather than appearing to succeed while doing nothing.

---

### User Story 4 - The tools the new toolchain makes redundant are gone (Priority: P4)

A contributor measures coverage and gas usage using capabilities built into the toolchain, and the
separate tools that previously provided them — along with the hand-pinned compiler workaround they
required — are removed from the repository.

**Why this priority**: This is the payoff, not the point. It is real value — it removes a legacy
dependency tree, retires a compiler version that silently decides bytecode on a hidden path, and
clears a queue of parked dependency updates — but every item is a deletion that is safe to defer
until the first three stories hold.

**Independent Test**: Produce a coverage report and a gas report using only built-in capability, and
confirm the removed tools are absent from the dependency manifest. Delivers value on its own:
smaller dependency surface and one less way for bytecode to change unnoticed.

**Acceptance Scenarios**:

1. **Given** the migrated repository, **When** a contributor requests coverage, **Then** a coverage
   report is produced without the previously separate coverage tool being installed.
2. **Given** the migrated repository, **When** a contributor requests gas statistics, **Then** a gas
   report is produced without the previously separate gas tool being installed.
3. **Given** the migrated repository, **When** the dependency manifest is inspected, **Then** the
   hand-pinned compiler package, the separate coverage and gas tools, and the unused type-generation
   tooling are all absent.
4. **Given** the compiler workaround is removed, **When** contracts are compiled in an environment
   that previously required it, **Then** compilation succeeds and produces the same executable code.

---

### Edge Cases

- **A contract's executable code changes, not just its metadata.** This is the migration's stop
  condition. It must be reported per contract by name and must block the change until the cause is
  identified, because it means behaviour may have changed, not just provenance.
- **A contract is deployed to a deterministic address chosen so it matches across chains.** Several
  contracts are deployed this way specifically so the same contract has the same address on every
  chain. Because the deterministic address is derived from the compiled bytes, and the compiled
  bytes now differ, a future deployment of one of these contracts lands at a different address than
  its existing siblings. Deploying such a contract to a new chain after this migration therefore
  breaks the cross-chain address match that motivated determinism in the first place. This must be
  recorded and decided before any such deployment, not discovered during one.
- **An already-deployed contract can no longer be fully re-verified from this source.** Source
  verification compares compiled bytes including metadata, so verification from a post-migration
  checkout is a partial rather than exact match. Existing verifications are not revoked; the effect
  is on future re-verification.
- **A safety gate reports success without having examined the current build.** A gate that reads
  build output left over from a previous run reports on that older output. Any gate protecting
  deployed code must establish that the output it examined came from the build under test.
- **A test or script is silently excluded rather than migrated.** Partial migration is the expected
  intermediate state, so anything not yet converted must fail loudly when invoked, never appear to
  pass by not running.
- **The upgrade-safety check cannot reach a chain.** An unreachable chain must be reported as
  unreachable and must not be counted as "no incompatibility found".
- **A contract supplied by an external package is needed by a test.** The new toolchain does not
  produce build output for contracts that live in external packages, so any test that asks for one
  by name must be given a supported way to obtain it.

## Requirements *(mandatory)*

### Functional Requirements

**Safety of deployed code**

- **FR-001**: The executable code of every contract MUST be identical before and after the
  migration, compared with the appended metadata block excluded. Any contract for which this does
  not hold MUST be reported by name and MUST block the migration.
- **FR-002**: The system MUST record the changed compiled output deliberately, and the record MUST
  state which contracts changed, that the change is confined to the metadata block, and what the
  consequence is for already-deployed contracts.
- **FR-003**: The upgrade-safety check MUST examine at least as many live implementations as it did
  before the migration, and MUST continue to report the previously recorded undiffable
  implementations with their recorded reasons rather than silently dropping them.
- **FR-004**: The upgrade-safety check MUST reject a storage layout that is incompatible with the
  live implementation, and this MUST be demonstrated by a deliberate corruption rather than inferred
  from the check passing.
- **FR-005**: Any gate that protects deployed code MUST verify that the build output it examines was
  produced by the build under test, and MUST fail rather than report success when it cannot.
- **FR-006**: The contracts whose deployment addresses are derived deterministically from their
  compiled bytes MUST be identified, and the consequence for their cross-chain address match MUST be
  recorded before any of them is deployed to a new chain.

**Continuity of verification**

- **FR-007**: The contract test suite MUST pass with at least the pre-migration number of passing
  tests and zero failures.
- **FR-008**: The migrated test suite MUST be shown to still detect contract regressions, by
  demonstrating that a deliberately introduced fault fails the suite.
- **FR-009**: Any test or script not yet migrated MUST fail loudly when invoked and MUST NOT be
  silently excluded from a run.
- **FR-010**: Tests that require a contract supplied by an external package MUST have a supported
  way to obtain it, and MUST fail with that contract named when it cannot be obtained.

**Continuity of operations**

- **FR-011**: Every deploy and operational script MUST be executed against a disposable chain and
  demonstrated to produce its expected effect. Compiling successfully MUST NOT be accepted as
  evidence that a script works.
- **FR-012**: In-place proxy upgrades MUST continue to preserve the proxy address and stored state.
- **FR-013**: Scripts that read or write recorded deployment addresses MUST continue to use the
  existing file format.

**Reduction of surface**

- **FR-014**: Coverage and gas reporting MUST be available using capability built into the
  toolchain, and the separate tools previously providing them MUST be removed.
- **FR-015**: The hand-pinned compiler package MUST be removed, along with the environment-dependent
  compilation path that made its version decide compiled output.
- **FR-016**: Tooling that is present but unused MUST be removed rather than migrated.
- **FR-017**: Dependency updates that were parked solely because the framework could not move MUST
  be unblocked or, where they remain blocked for a different reason, that reason MUST be recorded.

**Reviewability**

- **FR-018**: The migration MUST be delivered in independently reviewable changes. The test-suite
  conversion and the script conversion MUST NOT be combined into a single change.
- **FR-019**: Each delivered change MUST leave the repository in a state where the safety gates run
  and give an honest verdict, whether or not the migration is complete.

### Key Entities

- **Compiled output record**: The recorded fingerprint of every contract's compiled bytes, used to
  detect unintended changes. Distinguishes executable code from appended metadata.
- **Upgrade-safety record**: The per-contract storage layout recorded at deployment time, compared
  against a candidate to establish that an upgrade is append-only and therefore safe.
- **Recorded deployment addresses**: The per-chain record of which contract lives at which address,
  and for proxies, which implementation is current. Source of truth for operations.
- **Live implementation**: A deployed contract whose storage layout constrains what future upgrades
  are permitted.
- **Deterministically addressed contract**: A contract whose deployment address is derived from its
  compiled bytes, chosen so the same contract has the same address on multiple chains.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of contracts that produce bytecode have identical executable code before and
  after the migration when the appended metadata block is excluded.
- **SC-002**: The upgrade-safety check reaches at least 26 live implementations across at least 7
  chains and passes, matching its pre-migration reach.
- **SC-003**: A deliberately corrupted storage layout is rejected by the upgrade-safety check in
  100% of attempts.
- **SC-004**: The contract test suite reports zero failures and at least as many passing tests as
  the pre-migration baseline.
- **SC-005**: 100% of deploy and operational scripts have been executed against a disposable chain
  with their effects confirmed, before the migration is considered complete.
- **SC-006**: Zero contracts are deployed to any live chain as part of this migration.
- **SC-007**: The dependency count is reduced relative to the pre-migration baseline, and the
  packages removed include the separate coverage tool, the separate gas tool, the unused
  type-generation tooling, and the hand-pinned compiler.
- **SC-008**: Coverage and gas reports are produced using only built-in capability.
- **SC-009**: No change in the migration is merged while any safety gate is failing for an
  unexplained reason.

## Assumptions

- **The on-chain refresh is out of scope and happens afterwards.** This migration deploys nothing.
  The decision to absorb the metadata change on-chain, and the funding and sequencing of that work,
  is separate and deliberately follows this migration so the change is absorbed once rather than
  twice.
- **The live estate is currently consistent.** All live implementations are storage-compatible with
  current source, so this migration is not fixing an on-chain defect and can be judged purely on
  whether it preserves the status quo.
- **Existing source verifications remain valid.** The consequence of the metadata change is limited
  to future re-verification producing a partial rather than exact match; already-verified contracts
  are not revoked.
- **The contract set remains one compilation unit.** It cannot be partitioned, so the migration
  cannot be staged by splitting the contracts.
- **A conflicting external package version is removed separately.** A version collision between two
  packages supplying the same dependency blocks the first compile on the new toolchain; that removal
  is already in flight as its own change and is a prerequisite rather than part of this work.
- **Wrapper contracts added to obtain external package contracts are test-only.** They live with the
  existing test-only contracts and are expected to appear in the compiled-output record as additions,
  never as modifications to shipped contracts.
- **Forking tests are validated separately.** They require live network access and are not part of
  the disposable-chain verification.
- **The module-system change is confined to the repository root scope.** The frontend and services
  have their own module configuration and are unaffected.

## Dependencies

- Removal of the conflicting external package version (in flight separately) must land first, as it
  blocks the first compile on the new toolchain.
- The parked dependency updates that this migration unblocks are tracked separately and are
  consequences of this work rather than part of it.
