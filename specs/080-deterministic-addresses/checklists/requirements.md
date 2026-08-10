# Specification Quality Checklist: Deterministic, cohort-wide contract addresses

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-09
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### On writing this without naming mechanisms

The request arrived in mechanism terms — a named factory, a named deployment opcode, a named
compiler setting. The specification deliberately states the *properties* instead: an address does not
depend on where source lives (FR-001), an address is computable without contacting a chain (FR-006),
configuration does not influence an address (FR-007), no observable state exists between deployment
and configuration (FR-012).

This is not pedantry. Two of the three mechanisms named in the request are already partly in place
and still do not deliver the goal — the shared deployment mechanism is already used by ten contracts,
yet 48 of 51 contracts remain inconsistent across chains. Writing the properties makes it testable
whether the goal was reached, rather than whether the mechanism was adopted. The concrete settings,
addresses, and measured byte counts belong in the plan.

### Validation notes

- **Zero [NEEDS CLARIFICATION] markers.** The measurements that would normally leave this open were
  taken before writing: the appended provenance block was confirmed to collapse to the compiler
  version alone with executable code unchanged, the deployment facility was confirmed present on the
  chains checked, and the configuration signatures that block address parity were read from the
  contracts. Those are recorded as Assumptions, not questions.

- **FR-002 and SC-001 are the stop condition**, stated as both a blocking requirement and a
  measurable outcome. The safety argument for touching every contract's compiled output rests
  entirely on the distinction between *provenance changed* and *behaviour changed*.

- **US3 is ranked P3 but is not optional.** The user judged the exposure low at this stage and it
  genuinely is — but the window does not exist today; this work creates it. A specification that
  introduced a hazard and relied on the project being small enough not to be targeted would be
  recording a decision it cannot defend later, so the window is closed rather than accepted. FR-015
  exists because the obvious way to close it would change the addresses the work exists to fix.

- **US4 was not requested and is deliberately last.** It reports rather than fixes, but 48 of 51
  contracts are currently inconsistent and nothing surfaces that today. Ranked P4 so it cannot
  displace the work that changes the situation.

- **The grandfathering assumption is stated as a permanent condition, not a backlog item.**
  Contracts holding live user state cannot move to a new address under any scheme. Writing this into
  Assumptions and FR-016 prevents a future reader from reading SC-008 as "everything will eventually
  be consistent" — it will not, and the exceptions are the honest part of the answer.

- **SC-006 ("zero contracts deployed to any live chain") repeats spec 079's boundary deliberately.**
  Both specifications establish capability; neither performs the estate-wide deployment that realises
  it. That deployment is separate work and both specs say so, so it cannot be assumed to have
  happened because a scheme exists.
