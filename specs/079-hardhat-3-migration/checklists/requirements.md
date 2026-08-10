# Specification Quality Checklist: Hardhat 3 toolchain migration

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

### On "no implementation details" for a toolchain migration

This specification names no product, version, flag, or file. The subject of the work is a build
toolchain, so the *category* of thing being changed is unavoidably technical — but every requirement
is written against an observable property (executable code is unchanged; the gate rejects a
corrupted layout; a script was executed and its effect confirmed) rather than against a mechanism.
A reviewer who does not know which toolchain is involved can still tell whether FR-001 or SC-003 is
satisfied. The concrete versions, flags, and file paths measured in the spike belong in the plan.

### Validation notes

- **Zero [NEEDS CLARIFICATION] markers.** A measurement spike ran before this specification, so the
  areas that would normally be open — whether the upgrade-safety gate survives, what the compiled
  output does, where the real cost sits — are settled facts recorded in Assumptions rather than
  questions. The one genuinely open decision, whether and when to absorb the change on-chain, has
  already been taken and is recorded as out of scope.

- **FR-001 and SC-001 are the stop condition**, deliberately stated twice — once as a requirement
  that blocks and once as a measurable outcome — because the entire safety argument for this
  migration rests on the distinction between *executable code* and *appended metadata*. If that
  distinction fails to hold for even one contract, the migration's risk profile changes completely.

- **SC-006 ("zero contracts deployed") is a success criterion, not an omission.** It exists to make
  the scope boundary falsifiable: this work is complete without touching any live chain.

- **FR-005 was added from a defect found during the spike**, where a gate protecting deployed code
  reported success after examining output from an earlier build. It is generalised here rather than
  written against the specific gate, because the failure mode is not unique to it.

- **FR-006 and its edge case were added from a repository property the spike did not surface**:
  several contracts are deployed to deterministic addresses specifically so they match across
  chains, and those addresses derive from the compiled bytes. The consequence lands on a *future*
  deployment rather than an existing one, which is exactly the kind of delayed effect that is cheap
  to record now and expensive to discover later.

- **US3 is deliberately ranked P3 despite being the largest risk.** The spike never converted or ran
  a single deploy script, so there is no evidence that path works. It ranks third because the two
  stories above it are prerequisites for evaluating it at all — not because it is less dangerous.
  FR-011 exists to prevent the specific failure of accepting "it compiles" as evidence.
