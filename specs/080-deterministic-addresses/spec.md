# Feature Specification: Deterministic, cohort-wide contract addresses

**Feature Branch**: `080-deterministic-addresses`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "All contracts should use the safe singleton. Any which are not should be
modified to use CREATE2 so we are able to deterministically deploy on many chains without additional
tracking. We want to avoid potentially having one network in a cohort be out of sync."

## Context

The estate has drifted. Across 8 live networks there are **51 distinct contracts, and 48 of them
exist on some chains but not all**. Every address is discovered after the fact and written into a
per-chain record, so keeping a cohort consistent is a bookkeeping exercise that has to be redone
every time anything is deployed anywhere.

Twenty addresses currently coincide across chains, which looks like a system but mostly is not: only
five of them are deterministic by design. The rest coincide because the same deployer happened to be
at the same transaction count, and they will diverge the first time that stops being true.

The goal is to stop tracking addresses and start *deciding* them: a contract's address is a function
of what the contract is, not of where or when it was deployed, so a cohort cannot silently fall out
of sync.

Three things stand in the way, and only the first is obvious:

1. **Most of the estate is not deployed deterministically at all.** The upgradeable contracts —
   which are most of what matters — get their addresses from the deployer's transaction count.
2. **The determinism that does exist is not durable.** A deterministic address is derived from the
   contract's compiled bytes, and those bytes currently embed a fingerprint of the *source file
   paths*. Moving a file, renaming a directory, or changing build tooling silently relocates every
   deterministic address. A scheme that reshuffles itself whenever the source tree is reorganised is
   not a foundation; it is deferred maintenance.
3. **Making an upgradeable contract deterministic requires separating deployment from
   configuration.** These contracts are configured at deployment with addresses that differ per
   chain, and that configuration currently forms part of what determines the address — so two
   chains configured differently get different addresses even when deployed deterministically.
   Separating the two opens a window in which a freshly deployed contract is unconfigured and
   anyone could configure it first. That window will be closed by making deployment and
   configuration a single, indivisible step rather than by accepting the risk.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A contract's address stops depending on where its source lives (Priority: P1)

A contributor reorganises the source tree — moves a file, renames a directory — and the addresses at
which contracts would deploy do not change.

**Why this priority**: Everything else in this specification is built on deterministic addresses, and
determinism that a refactor can silently break is worse than none, because it is trusted. This story
must land first or the rest is built on sand. It is also the story that makes the toolchain migration
(spec 079) cost nothing, so delivering it first removes work from that effort rather than adding to
it.

**Independent Test**: Record the address at which each contract would deploy; move source files;
confirm every address is unchanged. Delivers value on its own: deterministic addresses become stable
across refactors and tooling changes.

**Acceptance Scenarios**:

1. **Given** the contract set, **When** a source file is moved or a directory renamed, **Then** the
   compiled bytes of every affected contract are unchanged, and therefore so is every deterministic
   address derived from them.
2. **Given** the contract set, **When** the compiled bytes are inspected, **Then** they contain no
   reference to source file paths or contents.
3. **Given** the change is adopted, **When** the executable code of every contract is compared to
   before, **Then** it is identical — the change removes appended provenance, never behaviour.
4. **Given** the change is adopted, **When** the compiled-output record is updated, **Then** the
   record states how many contracts changed and that only the appended block was affected.

---

### User Story 2 - Every contract deploys to an address decided in advance (Priority: P2)

An operator deploying to a new chain knows every contract's address before deploying, and can
confirm afterwards that each landed where predicted — including the upgradeable contracts, which
today cannot be predicted at all.

**Why this priority**: This is the requested capability. It is second only because it produces
addresses that a refactor would move until Story 1 lands.

**Independent Test**: Compute the expected address for every contract, deploy the full set to a
disposable chain, and confirm each address matches the prediction. Deliverable on its own: a
predictable deployment.

**Acceptance Scenarios**:

1. **Given** the full contract set, **When** an operator asks where each will deploy, **Then** every
   address is produced without touching a chain.
2. **Given** a disposable chain, **When** the full set is deployed, **Then** every contract is at its
   predicted address.
3. **Given** two disposable chains with different histories, **When** the set is deployed to both,
   **Then** every contract that is configured identically has the same address on both.
4. **Given** a contract already deployed at its deterministic address, **When** a deploy is
   re-attempted, **Then** it is recognised as already present and not redeployed.
5. **Given** a contract whose configuration is necessarily chain-specific, **When** its address is
   computed, **Then** the address does not depend on that configuration.

---

### User Story 3 - A newly deployed contract cannot be configured by anyone else (Priority: P3)

A contract is deployed and configured in a single indivisible step, so there is never a moment at
which it exists unconfigured and open to being claimed.

**Why this priority**: The exposure is judged low at the project's current stage, so it does not
block Stories 1 and 2. It is nonetheless built rather than accepted, because the window is created by
this work — it does not exist today — and shipping a known window and relying on nobody noticing is
not a defensible position for contracts that will hold funds.

**Independent Test**: Attempt to configure a contract between its deployment and its configuration
and confirm it is impossible. Delivers value on its own: closes a window this work would otherwise
open.

**Acceptance Scenarios**:

1. **Given** a deployment, **When** it completes, **Then** the contract is fully configured, and no
   observable state exists in which it is deployed but unconfigured.
2. **Given** an attempt to configure a contract by any party other than the deployment step,
   **Then** it is rejected.
3. **Given** a deployment that fails during configuration, **Then** the whole step fails and leaves
   nothing partially configured.
4. **Given** the atomic step, **When** the resulting address is compared to the prediction, **Then**
   it matches — closing the window must not change where the contract lands.

---

### User Story 4 - The estate's consistency is visible (Priority: P4)

An operator can see, for a cohort, which contracts are present on which chains, which are at their
deterministic address, and which are recorded exceptions — without reading eight files by hand.

**Why this priority**: Reporting does not fix drift, but drift that nobody can see is drift nobody
acts on, and 48 of 51 contracts are currently inconsistent across chains. It ranks last because it
describes the problem rather than solving it.

**Independent Test**: Produce the report for the current estate and confirm it matches what the
per-chain records actually say, including the known exceptions.

**Acceptance Scenarios**:

1. **Given** the current estate, **When** the report is produced, **Then** it identifies every
   contract that is present on some chains but not all.
2. **Given** a contract that cannot move to its deterministic address, **When** the report is
   produced, **Then** it is shown as a recorded exception with the reason, never as a gap.
3. **Given** a contract at an address other than its deterministic one, **When** the report is
   produced, **Then** the discrepancy is stated rather than hidden.

---

### Edge Cases

- **A contract's executable code changes, not just its appended provenance.** This is the stop
  condition for Story 1. It must be reported per contract and block the change, because it means
  behaviour may have changed.
- **A contract already holds state at a non-deterministic address.** It cannot move — its state and
  the value it holds are at that address. These are permanent recorded exceptions, not work items,
  and the specification must not imply they will be cleaned up.
- **The deterministic address is already occupied on a target chain.** Deployment must detect this
  and stop, distinguishing "already deployed by us" (fine, skip) from "occupied by something else"
  (an incident).
- **The deployment facility is absent on a target chain.** Some chains may not have the shared
  deployment mechanism available. This must be detected before deployment, not discovered during it,
  and reported as unavailable rather than silently falling back to a non-deterministic deploy.
- **Two contracts are assigned the same identifier.** Identifiers determine addresses; a collision
  would send two contracts to one address. This must be impossible to introduce accidentally.
- **A contract's configuration must legitimately differ between chains.** This is normal — most
  configuration is chain-specific. The requirement is that configuration must not influence the
  address, not that configuration be identical.
- **The compiler version changes.** Addresses will move, because the compiler version is the one
  remaining input. This is expected and acceptable, but must be recognised as an address-moving event
  rather than discovered afterwards.
- **A chain is unreachable while checking the estate.** Reported as unreachable, never counted as
  "contract absent" — an absent contract and an unknown one call for opposite actions.

## Requirements *(mandatory)*

### Functional Requirements

**Durable determinism**

- **FR-001**: Compiled contract output MUST NOT depend on source file paths, names, or contents
  beyond the code itself, so that reorganising the source tree does not move any address.
- **FR-002**: Adopting this MUST leave the executable code of every contract identical. Any contract
  for which this does not hold MUST be reported by name and MUST block the change.
- **FR-003**: The change to compiled output MUST be recorded once, deliberately, stating how many
  contracts changed and that only the appended block was affected.
- **FR-004**: The remaining inputs that can move an address MUST be documented, and a change to any
  of them MUST be recognised as an address-moving event.

**Predictable addresses**

- **FR-005**: Every contract intended for multiple chains MUST deploy through the shared
  deterministic mechanism, including upgradeable ones, which today do not.
- **FR-006**: The address of every such contract MUST be computable without contacting any chain.
- **FR-007**: A contract's address MUST NOT depend on chain-specific configuration.
- **FR-008**: Deployment MUST verify the contract landed at its predicted address and MUST fail
  loudly otherwise.
- **FR-009**: Deployment MUST distinguish "already deployed by us at this address" from "this address
  is occupied by something else", and MUST treat the second as an incident.
- **FR-010**: Deployment MUST detect that the deployment facility is unavailable on a target chain
  before deploying, and MUST NOT silently fall back to a non-deterministic deployment.
- **FR-011**: Contract identifiers MUST be unique, and a collision MUST be impossible to introduce
  without detection.

**No window between deployment and configuration**

- **FR-012**: Deployment and configuration MUST occur in a single indivisible step, with no
  observable state in which a contract is deployed but unconfigured.
- **FR-013**: Configuration MUST be rejected from any party other than the deployment step.
- **FR-014**: A failure during configuration MUST fail the entire step and leave nothing partially
  configured.
- **FR-015**: Closing this window MUST NOT change the address a contract deploys to.

**Honest accounting**

- **FR-016**: Contracts that cannot move to their deterministic address MUST be recorded as
  exceptions with reasons, and MUST be reported as exceptions rather than as gaps or as compliant.
- **FR-017**: The system MUST report, per cohort, which contracts are present on which chains and
  which are at their deterministic address.
- **FR-018**: An unreachable chain MUST be reported as unreachable and MUST NOT be counted as a
  contract being absent.
- **FR-019**: The per-chain address records MUST remain the source of truth and MUST keep their
  existing format.

**Scope discipline**

- **FR-020**: This work MUST NOT deploy to any live chain. The scheme is established and proven on a
  disposable chain.
- **FR-021**: Changes affecting how contracts are configured MUST receive a security review before
  merge.

### Key Entities

- **Contract identifier**: The stable name that, with the contract's compiled bytes, determines its
  address. Must be unique and must not change once used.
- **Predicted address**: Where a contract will deploy, computed without contacting a chain.
- **Deployment record**: The existing per-chain record of which contract is at which address.
  Unchanged in format; gains the ability to be checked against predictions.
- **Recorded exception**: A contract that cannot occupy its deterministic address, with the reason.
  Permanent, not a work item.
- **Cohort**: The set of chains that must stay consistent with each other.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of contracts have identical executable code before and after the determinism
  change, with only the appended provenance block differing.
- **SC-002**: Moving or renaming any source file changes zero predicted addresses.
- **SC-003**: 100% of contracts intended for multiple chains have an address computable without
  contacting a chain.
- **SC-004**: Deploying the full set to two disposable chains with different histories yields
  identical addresses for every contract whose configuration does not differ.
- **SC-005**: Zero observable states exist in which a contract is deployed but unconfigured.
- **SC-006**: Zero contracts are deployed to any live chain by this work.
- **SC-007**: Every contract that cannot occupy its deterministic address is recorded as an exception
  with a stated reason; the count is reported rather than left implicit.
- **SC-008**: The consistency report accounts for all 51 distinct contracts across the estate, and
  each is classified as consistent, inconsistent, or a recorded exception — with none unclassified.

## Assumptions

- **The existing shared deployment mechanism is used, not replaced.** It is already the repository's
  approach for the contracts that are deterministic today, and is already present on the chains
  checked.
- **Value is realised on deployment, not on adoption.** Adopting the scheme does not move anything
  already deployed. A cohort becomes consistent when contracts are deployed under it — this
  specification establishes the scheme and proves it; bringing live chains into line is separate
  work, deliberately sequenced afterwards.
- **Existing stateful deployments are permanent exceptions.** Contracts holding live user state
  cannot move to a new address regardless of scheme. They are recorded, not migrated.
- **Weaker provenance is an accepted trade.** Removing the source fingerprint from compiled output
  means verifiers that compare provenance report a partial rather than exact match. Verifiers that
  recompile from declared settings are unaffected. This is accepted deliberately in exchange for
  addresses that survive refactoring.
- **The toolchain migration is sequenced after this.** That migration changes compiled output only
  because it renames source units; once output no longer depends on source names, it has nothing to
  change. Doing this first makes that migration cost nothing instead of paying the same change twice.
- **Configuration remains chain-specific.** The requirement is that configuration must not influence
  the address, not that chains be configured identically.
- **The exposure being closed in Story 3 is currently judged low**, and is being closed anyway
  because this work creates it.

## Dependencies

- None blocking. This specification is deliberately first: the toolchain migration (spec 079) is
  sequenced behind it and becomes substantially smaller as a result.
- The security review required by FR-021 must be scheduled before the configuration changes merge.
