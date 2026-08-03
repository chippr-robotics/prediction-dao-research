# Feature Specification: Monorepo Workspaces, Packages, and a Declared Build-Target Graph

**Feature Branch**: `075-monorepo-workspaces`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "our repository has grown in scope from its original intent and has become a monorepo. we should use a monorepo framework like bazel to ensure we have adequate version control in our mono. review the code base and implement the core concepts such as workspaces, packages, and targets to ensure we are following best practices and ensuring we have a maintainable codebase that is sound"

## Problem Statement

The repository began as a single Hardhat project and now contains six independently-installed
code units, four separate dependency lockfiles, two units with no lockfile at all, and no
definition anywhere of how those units relate. Nothing declares which unit depends on which,
which files feed which build, or what a given build is allowed to read.

The consequence is not untidiness. It is that **the repository's build inputs are not fully
declared, so its outputs are not reproducible** — and this repository's outputs are deployed
bytecode for upgradeable contracts that custody escrowed funds at stable addresses across seven
chains, plus third-party code packages whose bytes are cryptographically committed on-chain.

Four instances were measured directly and are live today:

1. The EVM target of 116 of 120 contracts is not set by this repository. It is inherited from a
   build tool's internal default, which the repository depends on through a floating version
   range. If that default changes, every contract becomes undeployable on two live networks and
   every deterministic address changes — with nothing in the repository detecting it. (Measured:
   all 30 compilation records currently report the safe target, so declaring it is byte-neutral
   *today* — which is exactly why it is cheap to fix and dangerous to leave.)
2. The merge gate that protects storage layout on fund-holding upgradeable contracts runs on a
   dependency that no manifest declares. It resolves today only by accident of installation
   layout.
3. Contract interface definitions consumed by the application and the indexer are maintained by
   hand with no generator and no check against the compiled contracts. One has already diverged
   (81 entries against the authoritative 88, missing three live members and retaining two removed
   ones). Because these contracts are upgraded *in place at stable addresses*, the ordinary
   shipping path is precisely the path that desynchronises them.
4. A merge gate covering end-to-end behaviour is structurally incapable of failing: it both
   suppresses its own exit status and checks for a word its report never emits. It has reported
   success on every run while real failures accumulated.

Separately, invariants that the project has written down as prose — that certain
signature-payload definitions stay identical across three locations, and that third-party code
packages never import from the host application — are enforced today only by human discipline.
Discipline has held for 26 of 27 payload definitions; the 27th has already drifted.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A maintainer can prove the build is reproducible (Priority: P1)

A maintainer preparing a contract upgrade needs to know that the bytecode produced today is the
bytecode the repository describes, and that nothing outside the repository decides it. Today they
cannot know this, because the compiler's target setting is inherited from a floating dependency
and one merge gate depends on an undeclared package.

**Why this priority**: This is the only item on the list where the failure mode is loss of user
funds or a permanently undeployable contract, and it is also the cheapest to fix. Every later
story is verified by comparing build outputs before and after a change, so this story establishes
the measurement that all the others depend on.

**Independent Test**: Compile the contracts, record a digest of every contract's bytecode, apply
the declaration changes, compile again, and confirm the digests are unchanged. Deliverable on its
own with no structural change to the repository.

**Acceptance Scenarios**:

1. **Given** the compiler target is currently inherited from a dependency's internal default,
   **When** the repository declares that target explicitly, **Then** a byte-for-byte comparison of
   all compiled contract bytecode before and after shows no change.
2. **Given** a contributor adds a new compiler configuration without declaring a target,
   **When** the test suite runs, **Then** the suite fails and names the undeclared configuration.
3. **Given** a merge gate depends on a package no manifest declares, **When** that dependency is
   declared explicitly, **Then** the gate continues to pass and the dependency appears in the
   dependency record.
4. **Given** the storage-layout gate finds nothing to compare against, **When** it completes,
   **Then** it fails rather than reporting success — because it has previously reported success
   while checking nothing.

---

### User Story 2 - A maintainer can trust what the pipeline reports (Priority: P1)

A maintainer merging a change needs the pipeline's verdict to mean something. Today one gate
cannot fail, and the pipeline runs itself multiple times per commit because entry points overlap.

**Why this priority**: Equal-highest, because every subsequent story in this specification is
verified *by* the pipeline. Restructuring a repository while its verification signal is known to
be false is not a sequence any of this work can safely follow.

**Independent Test**: Introduce a deliberate end-to-end failure and confirm the pipeline reports
red. Count the jobs triggered by a single commit before and after.

**Acceptance Scenarios**:

1. **Given** a deliberately broken end-to-end test, **When** the pipeline runs, **Then** the
   relevant job reports failure.
2. **Given** the end-to-end gate is repaired, **When** it runs against the current code, **Then**
   it reports the real accumulated failures rather than success.
3. **Given** a single commit is pushed, **When** the pipeline triggers, **Then** each workflow
   runs exactly once.
4. **Given** a change touching only documentation, **When** the pipeline triggers, **Then** only
   documentation-related jobs run.
5. **Given** a second commit is pushed while the first is still running, **When** the pipeline
   triggers, **Then** the superseded run is cancelled.
6. **Given** any quality gate encounters an error, **When** it completes, **Then** it fails the
   pipeline rather than suppressing the result.

---

### User Story 3 - The repository has one dependency graph (Priority: P2)

A maintainer adding or upgrading a dependency needs one place where versions are decided and one
record of what actually got installed. Today there are four such records, two code units with
none, and a dependency version that disagrees across units.

**Why this priority**: This is the structural change the request names, and it unblocks Stories 4
and 5 — shared code cannot become a package until there is a workspace for it to live in. It
ranks below Stories 1 and 2 because it carries genuine risk (see Edge Cases) and needs their
verification in place first.

**Independent Test**: Install from a clean checkout and confirm a single dependency record covers
every unit, every unit's build and test still pass, and disagreeing version declarations are
resolved to one installed version.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** dependencies are installed once from the repository root,
   **Then** every code unit is usable without a further per-unit install.
2. **Given** the installation completes, **When** the repository is inspected, **Then** exactly
   one dependency record exists and it covers all units.
3. **Given** two units declare disagreeing version ranges for the same dependency, **When**
   installed, **Then** one version is installed and the disagreement is visible in one file.
4. **Given** the two units that ship with no dependency record today, **When** this story
   completes, **Then** both are covered by the single record or are removed from the repository
   with their removal stated.
5. **Given** a third-party code package is rebuilt after the change, **When** its output bytes are
   compared to the same package built before the change, **Then** the bytes are identical — or,
   if they differ, the change is blocked until the difference is explained and the affected
   package is re-published and re-approved.
6. **Given** the setup instructions in the documentation, **When** a new contributor follows them,
   **Then** they succeed — instructions invalidated by this change are updated in the same change.

---

### User Story 4 - Shared definitions have one source and a machine checks them (Priority: P2)

A maintainer changing a signature-payload definition needs the change to reach every consumer, or
to fail loudly. Today the definition exists in three places kept aligned by hand, and a fourth
related table exists in two more.

**Why this priority**: These payload definitions govern what a member's signature authorises. A
mismatch does not produce a visible error — it produces a signature that verifies against
something other than what was displayed. The drift has already begun.

**Independent Test**: Change one field in the shared definition and confirm every consumer sees
it and that a mismatch against the contract's own definition fails the test suite.

**Acceptance Scenarios**:

1. **Given** the payload definitions currently duplicated across units, **When** this story
   completes, **Then** exactly one copy exists outside the contracts and every consumer reads it.
2. **Given** the shared definitions, **When** the contract test suite runs, **Then** every
   definition is checked against the contract's own committed value and any mismatch fails.
3. **Given** one payload definition is currently absent from one consumer, **When** this story
   completes, **Then** it is present and covered by the check.
4. **Given** a payload definition whose authoritative value lives in an external contract rather
   than this repository, **When** it is checked, **Then** it is checked against a recorded fixed
   value, and this case is distinguished from the contract-derived case.
5. **Given** a contributor edits one consumer's copy directly, **When** the test suite runs,
   **Then** the edit fails the suite.

---

### User Story 5 - Contract interfaces are generated, not hand-written (Priority: P2)

A maintainer shipping a contract upgrade needs the application and the indexer to describe the
contract as it now is. Today they describe it as someone last typed it.

**Why this priority**: Highest-severity live defect after Stories 1 and 2, and already realised in
one indexer file. Ranked below Story 3 only because it needs the workspace to publish into.

**Independent Test**: Change a contract's interface, rebuild, and confirm the consumers reflect
the change and that a stale hand-written copy fails a check.

**Acceptance Scenarios**:

1. **Given** compiled contracts, **When** interface definitions are produced, **Then** they are
   derived from the compilation output rather than maintained by hand.
2. **Given** a contract whose behaviour is split across two implementations behind one address,
   **When** its interface is produced, **Then** the result covers both.
3. **Given** a generated interface and a committed one that disagree, **When** the pipeline runs,
   **Then** it fails and names the disagreement.
4. **Given** an existing hand-written interface differs from the generated one, **When** it is
   migrated, **Then** each difference is individually reviewed and its resolution recorded,
   because some hand edits are corrections and some are staleness.
5. **Given** the indexer's own duplicated copies, **When** this story completes, **Then** they
   read the generated definitions and the duplicates are removed.

---

### User Story 6 - Every buildable unit has a declared target (Priority: P3)

A maintainer needs work to be skipped when its inputs have not changed, and needs each unit's
inputs and outputs written down. Today every job runs on every change and the contracts are
compiled repeatedly per commit with no sharing.

**Why this priority**: The efficiency benefit is real but smaller than the correctness stories,
and it carries a specific hazard: a target whose declared inputs are incomplete produces a wrong
result from cache rather than an error. It ships last so it can be validated against the honest
pipeline established in Story 2.

**Independent Test**: Change one file and confirm exactly the affected targets re-run. Run with
caching disabled and confirm outcomes match the pipeline it replaces.

**Acceptance Scenarios**:

1. **Given** the target graph, **When** a contract source file changes, **Then** compilation and
   everything downstream re-runs.
2. **Given** the target graph, **When** only documentation changes, **Then** no build or test
   target re-runs.
3. **Given** caching is disabled, **When** the graph runs, **Then** every target's outcome matches
   the pipeline it replaces.
4. **Given** a target depends on a value from the environment rather than a file, **When** that
   value changes, **Then** the target re-runs.
5. **Given** a gate that reads state which cannot be reproduced from source, **When** the graph
   runs, **Then** that gate always executes and is never served from cache.
6. **Given** any part of the toolchain that the graph cannot model, **When** the graph is
   documented, **Then** those parts are named explicitly rather than implied to be covered.

---

### User Story 7 - Cross-unit boundaries are enforced by a machine (Priority: P3)

A maintainer needs the rule that third-party code packages and the host application never import
each other to be checked automatically, everywhere, including in test code.

**Why this priority**: The rule is a security boundary — packages are untrusted third-party code
— but it is currently enforced by a single test file whose own documentation notes it can be
bypassed, and the relevant lint configuration excludes the directory where most existing
violations live.

**Independent Test**: Add an import that crosses the boundary in each direction, including from
test code, and confirm each is rejected.

**Acceptance Scenarios**:

1. **Given** an import from a package into the host application, **When** checks run, **Then** it
   is rejected.
2. **Given** an import from the host application into a package, **When** checks run, **Then** it
   is rejected.
3. **Given** a boundary-crossing import inside test code, **When** checks run, **Then** it is
   rejected — the current configuration would not catch it.
4. **Given** the workspace change makes packages resolvable by name from the host, **When** such
   an import is added, **Then** it is rejected; declaring a package is not the same as permitting
   it to be imported.

---

### Edge Cases

- **A restructuring changes bytes that are committed on-chain.** Third-party code packages have
  their content hashes recorded on-chain. Their build inspects installed dependencies and embeds
  what it finds into the output. Any change to installation layout can therefore change the
  output bytes and invalidate the on-chain commitment, with no error raised. What happens?
- **No baseline exists to compare against.** The published content hashes live only on-chain, and
  the current source tree has never been confirmed to reproduce them. If a rebuild disagrees, how
  is "this change broke it" distinguished from "it was never reproducible"?
- **The existing byte-reproducibility fixture does not cover the risky case.** It deliberately
  excludes the largest and most version-sensitive dependency. What covers that?
- **A gate is repaired and the pipeline goes red.** Story 2 reveals accumulated real failures.
  Is that treated as a regression to revert, or as the gate working?
- **Declaring the compiler target changes the bytecode.** If the before/after comparison in Story
  1 shows a difference, the currently deployed bytecode was built to an unknown target. What then?
- **A generated interface disagrees with the hand-written one.** Some hand edits are fixes and
  some are rot. Who adjudicates, and what is recorded?
- **A build target's declared inputs are incomplete.** The result is a wrong answer served from
  cache, not a failure. How is that detected before it is trusted?
- **The contracts cannot be split into packages.** Three independent constraints force a single
  compilation unit. How is the request's "packages and targets" goal met for this code?
- **A routine local setup command modifies files that are declared build inputs.** The standard
  local development flow writes into tracked state. What does that do to the target graph?
- **Installing everything at once makes a small unit's install much larger.** A unit that installs
  a few hundred packages today would install the full set. How is that avoided?
- **Two units disagree on a dependency version and a blunt resolution breaks a third.** Several
  older major versions of one library are required by unrelated dependencies. How is the
  disagreement resolved without forcing an incompatible version onto them?

## Requirements *(mandatory)*

### Functional Requirements

#### Declared build inputs

- **FR-001**: The repository MUST declare the compiler target for every compiler configuration it
  defines, rather than inheriting it from a dependency's default.
- **FR-002**: A test MUST fail if any compiler configuration or override omits an explicit target.
- **FR-003**: Every package required at runtime or by a merge gate MUST be declared in the
  manifest of the unit that requires it.
- **FR-004**: The storage-layout merge gate MUST fail when it has nothing to compare against,
  rather than reporting success.
- **FR-005**: Adopting FR-001 MUST NOT change any compiled contract's bytecode; the change MUST be
  gated on a byte-for-byte comparison, and a difference MUST block the change.
- **FR-006**: The repository MUST declare its supported runtime version in one place.

#### Honest verification

- **FR-007**: No build, lint, test, or security gate may suppress its own failure status.
- **FR-008**: Every gate MUST fail on the condition it claims to check; a gate that cannot fail
  MUST be repaired or removed.
- **FR-009**: Each workflow MUST run at most once per triggering event.
- **FR-010**: A superseded run MUST be cancelled when a newer commit arrives.
- **FR-011**: Failures revealed by repairing a gate MUST be resolved by fixing the underlying
  problem, never by weakening the gate.

#### One dependency graph

- **FR-012**: The repository MUST define its code units as members of a single workspace.
- **FR-013**: Exactly one dependency record MUST exist and MUST cover every unit.
- **FR-014**: Every unit MUST be covered by that record, or be removed with its removal stated.
- **FR-015**: Version disagreements between units MUST resolve to a single installed version
  without forcing an incompatible version onto unrelated dependencies.
- **FR-016**: A per-unit install MUST remain possible so that a small unit's build does not
  install the full dependency set.
- **FR-017**: Documentation and scripts invalidated by the workspace change MUST be corrected in
  the same change.
- **FR-018**: Tooling that locates executables by assuming a per-unit installation layout MUST be
  corrected in the same change.

#### Byte reproducibility of on-chain-committed packages

- **FR-019**: Before any change to installation layout, the current content hashes of every
  on-chain-committed package MUST be read from the chain and recorded in the repository as a
  baseline, together with whether the current source reproduces them.
- **FR-020**: A change to installation layout MUST be gated on rebuilding every on-chain-committed
  package and confirming its output bytes are unchanged relative to the same source tree before
  the change.
- **FR-021**: The byte-reproducibility fixture MUST cover the dependencies actually used by the
  real packages, including the largest and most version-sensitive one.
- **FR-022**: If a package's output bytes change, the change MUST be blocked until the difference
  is explained, and the package re-published and re-approved on-chain.
- **FR-023**: Each on-chain-committed package MUST carry a declared version, and a check MUST fail
  when its content hash changes without a version change.

#### Shared definitions

- **FR-024**: Signature-payload definitions duplicated across units MUST have exactly one source
  outside the contracts, read by every consumer.
- **FR-025**: FR-024 MUST cover every duplicated payload table, including the external-token
  authorisation table, not only those in the primary file.
- **FR-026**: A test MUST verify every shared definition against the contract's own committed
  value, and fail on mismatch.
- **FR-027**: Definitions whose authoritative value lives in an external contract MUST be verified
  against a recorded fixed value, and MUST be distinguished from contract-derived definitions.
- **FR-028**: The payload definition currently missing from one consumer MUST be added.
- **FR-029**: Service-identifier and fee-cap values independently restated across units MUST be
  covered by an equivalent check.

#### Generated contract interfaces

- **FR-030**: Contract interface definitions consumed by any unit MUST be generated from
  compilation output.
- **FR-031**: Generation MUST produce a combined interface for contracts whose behaviour spans
  multiple implementations behind one address.
- **FR-032**: A gate MUST fail when a committed interface disagrees with the generated one.
- **FR-033**: Migration MUST review each difference between hand-written and generated interfaces
  individually and record the resolution.
- **FR-034**: The indexer MUST read generated definitions; its duplicated copies MUST be removed.
- **FR-035**: The plan MUST state whether generated interfaces are committed, and the consequence
  for a contributor without a contract toolchain MUST be stated either way.

#### Declared targets

- **FR-036**: Every buildable unit MUST have a declared target naming its inputs and outputs.
- **FR-037**: A target MUST re-run when any declared input changes, and MUST NOT re-run when none
  has.
- **FR-038**: Values read from the environment that affect a target's result MUST be declared as
  inputs.
- **FR-039**: Gates reading state that cannot be reproduced from source MUST always execute and
  MUST never be served from cache.
- **FR-040**: Targets whose settings prevent sharing outputs with another target MUST be modelled
  as independent.
- **FR-041**: The target graph MUST be validated with caching disabled against the pipeline it
  replaces before caching is relied upon.
- **FR-042**: Parts of the toolchain the graph cannot model MUST be named explicitly in the
  documentation.
- **FR-043**: The graph MUST NOT become the sole merge gate while deployment paths run outside it.

#### Enforced boundaries

- **FR-044**: Imports crossing the package/host boundary MUST be rejected automatically, in both
  directions.
- **FR-045**: Enforcement MUST cover test code; excluded directories MUST be narrowed to cover the
  locations where violations exist today.
- **FR-046**: Enforcement MUST cover imports by package name as well as by relative path.
- **FR-047**: No artefact of this feature may claim that declaring a package's dependencies
  enforces the boundary; enforcement is a separate, explicit check.

#### Scope boundary for contracts

- **FR-048**: The contracts MUST remain a single compilation unit; no requirement here may be read
  as splitting them.
- **FR-049**: The reasons for FR-048 MUST be recorded so the constraint is not revisited by
  assumption.

### Key Entities

- **Workspace**: The repository as one dependency graph — the set of code units, their declared
  relationships, and the single record of what is installed.
- **Package**: A code unit with a declared identity, declared dependencies, and a declared
  boundary. Some are internal shared code; some are third-party-facing and content-committed
  on-chain.
- **Target**: A named unit of work with declared inputs and outputs, enabling it to be skipped
  when its inputs are unchanged.
- **Shared definition**: Data that must be identical across units — signature payloads, contract
  interfaces, service identifiers — currently duplicated and hand-aligned.
- **Baseline**: A recorded measurement (bytecode digests, package content hashes) taken before a
  structural change, against which the change is proven neutral.
- **Gate**: A check that blocks a merge. A gate that cannot fail is worse than no gate, because it
  is trusted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Compiling the contracts before and after the declaration changes produces
  byte-identical bytecode for 100% of contracts.
- **SC-002**: 100% of compiler configurations declare an explicit target, verified by a test that
  fails otherwise.
- **SC-003**: Zero packages required at runtime or by a merge gate are undeclared in their unit's
  manifest.
- **SC-004**: A deliberately failing end-to-end test causes the pipeline to report failure —
  measured by introducing one.
- **SC-005**: The number of workflow runs triggered by a single commit equals the number of
  distinct workflows that apply to it.
- **SC-006**: A documentation-only change triggers zero build or test jobs.
- **SC-007**: Zero gates suppress their own failure status.
- **SC-008**: Exactly one dependency record exists and covers 100% of code units.
- **SC-009**: A clean checkout reaches a working state for every unit with one install command.
- **SC-010**: Rebuilding every on-chain-committed package after the workspace change produces
  byte-identical output to the same source built before it.
- **SC-011**: Every on-chain-committed package has a recorded baseline content hash and a stated
  answer to whether the current source reproduces the published one.
- **SC-012**: Signature-payload definitions exist in exactly one place outside the contracts, and
  100% are verified against the contracts' committed values by an automated test.
- **SC-013**: Zero contract interface definitions consumed by any unit are hand-maintained.
- **SC-014**: A contract interface change that is not propagated causes a gate to fail — measured
  by introducing one.
- **SC-015**: Changing a single contract source file re-runs only the targets that declare it,
  directly or transitively.
- **SC-016**: With caching disabled, the target graph reproduces the prior pipeline's pass/fail
  outcome for 100% of targets.
- **SC-017**: An import crossing the package/host boundary is rejected in 100% of tested cases,
  including from test code and by package name.
- **SC-018**: Every part of the toolchain outside the target graph is named in the documentation.

## Assumptions

- **Tooling choice is out of scope for this specification.** The requirements are stated so they
  can be satisfied by more than one tool. The decision — and the explicit rejection of a
  heavyweight hermetic build system after evaluation — is recorded in `plan.md`, which must
  justify it against the constitution's requirement that a new core technology earn its place.
- **The contracts stay one compilation unit.** Established by three independent constraints in the
  existing configuration; treated as fixed, not as a problem to solve.
- **The repository has no external consumers.** No unit is published; nothing outside the
  repository resolves any of them by name. Requirements therefore optimise for internal
  correctness, not for release surface.
- **Nothing in the running product changes.** No requirement here alters on-chain behaviour,
  member-facing behaviour, or deployed addresses. Any change that would is out of scope and
  blocking.
- **Repairing gates will turn the pipeline red before it turns green.** Expected and correct;
  budgeted as work, not treated as regression.
- **Interface generation may be adopted incrementally**, contract by contract, provided each
  migrated contract is covered by the parity gate on completion.
- **Existing archived directories stay excluded** from every build and remain reference-only, per
  the constitution.
- **Prior work is not re-litigated.** Where an existing invariant is written down as prose, this
  feature mechanises it; it does not change what the invariant says.

## Dependencies

- Requires the on-chain package registry to be readable on both its deployment chains to establish
  the FR-019 baseline. If a chain is unreachable, the baseline records that fact rather than a
  value, and the affected package's gate is blocked rather than assumed to pass.
- Requires access to pipeline run history to quantify the failures that Story 2 reveals.
- User Story 3 depends on Stories 1 and 2 for its verification method.
- User Stories 4 and 5 depend on Story 3 for a workspace to publish shared packages into.
- User Story 6 depends on Story 2 for a trustworthy comparison baseline.

## Out of Scope

- Adopting a hermetic build system. Evaluated and rejected; conditions for revisiting are recorded
  in `plan.md`.
- Splitting the contracts into multiple compilation units (FR-048).
- Changing any on-chain behaviour, deployed address, or member-facing behaviour.
- Publishing any unit to a public registry.
- Rewriting the deploy scripts so they no longer write into tracked state. Noted as a real
  constraint on the target graph; addressing it is separate work.
- Migrating end-to-end tests, static analysis, fuzzing, indexer tests, or documentation builds into
  the target graph. These stay outside it and FR-042 requires saying so.
- Release identity and image pinning (version tags, digest-pinned production images, automated
  dependency updates). Real gaps, adjacent to "version control", but a policy change rather than a
  structural one; they warrant their own feature.
- Consolidating the duplicated keystore-decryption implementations. A genuine and serious
  duplication found during review, but it touches key handling for live administrative keys and
  must not ride along with a build-system change.
