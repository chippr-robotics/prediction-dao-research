# Specification Quality Checklist: Safe Receiver — counterparty-segregated receive addresses

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-27
**Updated**: 2026-07-27 (reframed from "Safe Request" after measurement — see [research.md](../research.md))
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — all four resolved in the 2026-07-27 session
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded (explicit Out of Scope section)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Honesty gate (feature-specific)

This feature exists because the originally-requested guarantee was not
deliverable. These items are checked explicitly because they are the ones most
likely to regress back into an overstated claim.

- [x] The spec never claims deposits are screened or blocked (FR-006, SC-015)
- [x] The impossible-as-asked premise is stated openly in the Overview, with
      evidence in `research.md` §R1
- [x] Native vs. token attribution asymmetry is stated rather than smoothed over
      (FR-014, US2 scenario 4)
- [x] Public linkability of receive addresses is disclosed, not implied away
      (FR-007)
- [x] Uncertainty withholds and never permits (FR-012, FR-013, FR-016)
- [x] Per-network capability differences are required to be stated
      (FR-031 … FR-034, SC-014)

## Notes

- Four clarifications were resolved with the repo owner on 2026-07-27:
  framing (segregation, not deposit screening), disposition of the earlier
  "Safe Request" draft (rewritten; pull design preserved in `research.md` §R2
  Design B), change addresses (dropped), and linkability (accepted + disclosed).
- The rejected designs and all gas measurements are preserved in
  `research.md` so the reasoning is not re-derived later.

### Post-review status (2026-07-27)

The **spec** passes this checklist. The **design** built on it does not —
adversarial review upheld 31 findings, 4 critical, recorded in
[review-findings.md](../review-findings.md).

Two of those findings reach back into the spec itself and must be resolved here
before the design is reworked:

- [ ] **Native coin has no exit path.** FR-023/SC-006 forbid sweeping withheld
      value, the clearance rule withholds 100% of native permanently, yet US1
      AS-2 invites native payments and an edge case claims native is "retained
      in full and is sweepable". Pick a disposition (member attestation,
      acknowledge-and-sweep, or tokens-only) and reconcile every artifact.
- [ ] **FR-021 overstates gas.** "Gas is paid once" holds only on the batching
      passkey rail; a classic wallet pays deploy + transfer per address on first
      sweep. SC-010 is already worded correctly — align FR-021 to it.

Also open, spec-level: FR-027 is internally contradictory (derivation is
scan-free, discovery is not); the "never word uncertainty as guilt" rule is
anchored to no FR; and portfolio aggregation is neither designed nor declared
out of scope.

**Not ready for implementation.** Re-run `/speckit-analyze` once the artifacts
agree again.
