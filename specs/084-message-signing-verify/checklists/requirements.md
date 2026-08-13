# Specification Quality Checklist: Message Signing and Verification (Protect ▸ Verify)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-13
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

## Validation notes

Two iterations were needed.

**Iteration 1 — implementation detail leaked into the spec.** The first draft named the signature
standards (EIP-191, ERC-1271) and the shared component the forms sit in. Those are *how*, and they
also make the spec unreadable to the audience it is for. Rewritten as "accounts that sign through a
contract" and "a focused surface"; the standards now appear only in `plan.md`, where they belong.
The distinction survives the rewrite because it is genuinely a user-visible property — such an
account can only be checked on one network, and the member has to be told that.

**Iteration 2 — a success criterion was not measurable.** SC-003 originally read "undeterminable
results are never presented as contradictions", which is a property, not a measurement. Restated as
0% presented as contradictions plus an observable user check (a member shown the result can say
unprompted that nothing was established).

**No [NEEDS CLARIFICATION] markers were raised.** The three candidates and why each had a defensible
default:

- *Whether signatures should carry an expiry.* Default: no. A signature proves control at the moment
  it was made; imposing freshness is the asker's job via the challenge, and adding an expiry the
  product invents would silently alter a message the asker composed (FR-002). Recorded in
  Assumptions.
- *Whether a shared/multi-party account should be able to produce a proof.* Default: refuse and say
  why. Signing anyway would attribute the member's personal key to another account, which is the
  exact misattribution the feature exists to prevent. Recorded as FR-006 with its edge case.
- *Whether the record should be a file or text.* Default: text the member can copy. Both work; text
  travels through the channels members already use, and the choice does not change scope.

**Known deviation from process** (not a spec-quality defect, recorded for honesty): this
specification was written after the implementation. See the Implementation Status section of
`spec.md`.
