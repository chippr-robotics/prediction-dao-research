# Specification Quality Checklist: ZK-Wager Pools

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-27
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

- Both open clarifications are now **resolved** (answered by the user 2026-06-27):
  - **FR-020** — payout-proposal model: **creator proposes a single outcome,
    members approve to an m-of-n threshold** (no competing member proposals).
  - **FR-021** — compliance: **full parity with one-to-one wagers** — sanctions
    screening + membership gating are paramount and enforced on the real wallet at
    join/creation; anonymity covers the governance footprint, not compliance.
- `/speckit-clarify` session (2026-06-27) resolved four further mechanics, now
  recorded in the spec's `## Clarifications` section:
  - Resolution threshold = **fraction of joined members** (denominator frozen when
    resolution opens), not an absolute count.
  - Joining closes (denominator freezes) on **full / creator-close / join-deadline**,
    whichever first; late joins rejected.
  - Protocol cap of **~1,000 members per pool** (fixed anonymity set, constant
    per-proof cost).
  - Payout matrix assigns shares to **anonymous in-pool identities**; winners claim
    to **any address**, preserving anonymity through payout.
- All quality items pass (16/16). Spec is ready for `/speckit-plan`.
- `/speckit-analyze` remediation session (2026-06-27) resolved the findings it surfaced,
  recorded in `## Clarifications`:
  - **Nickname privacy (I1)**: nicknames derive from the **public commitment**, are
    **client-side display only / never on-chain**; FR-010 now scopes on-chain unlinkability to
    **votes**, with full nickname/payout unlinkability a **relayed-path** property.
  - **Sanctions (I2)**: guard **required** on value-bearing networks (no silent bypass);
    disable only on local/dev/test.
  - **Membership (U2)**: dedicated **`POOL_PARTICIPANT_ROLE`**.
  - **Terminology (A1)**: canonical "fraction-of-joined approval threshold" ("m-of-n" colloquial).
  - **Vote choice (V1)**: choices are public; only the voter is anonymous.
  - **Claim anonymity (U1)**: v1 may reveal the winning in-pool identity (never the wallet);
    exact proof construction is a planned spike (T024).
  - ETC sequencing (S1) and FR-033 scoping test (C1) addressed; apiVersion (T1) already
    consistent at 0.0.7.
