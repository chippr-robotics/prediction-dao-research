# Specification Quality Checklist: Polygon as the membership reference chain, and all-chains reads across the operations console

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-27
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

**Validation iteration 1 — issues found and fixed:**

1. *No clarification markers were needed.* The one question with real scope impact — whether
   anchoring membership to Polygon strands members holding memberships elsewhere — was resolved
   by checking the deployment record rather than asking: Polygon is the only **mainnet** carrying
   a MembershipManager (the others are testnet/local). This is recorded in Assumptions, because a
   future deployment to a second mainnet would invalidate it and reopen the question.

2. *Constitution tension caught and encoded.* Constitution principle III requires network-scoped
   data to "never leak across testnet/mainnet boundaries", which is in direct tension with a
   naive reading of "read from all chains". FR-002 and the **environment cohort** entity bound
   "all chains" to the build's cohort, so the two rules coexist rather than conflict. SC-008
   makes it verifiable.

3. *Cross-unit summing rejected.* An early draft had a single aggregate accrued-fee figure. Fee
   balances on different networks are denominated in different tokens (e.g. the Polygon and
   Ethereum Classic payment tokens are not the same asset), so one sum would be a fabricated
   number. FR-021–FR-023 require per-unit subtotals and an explicit partial label; SC-004 pins it.

4. *"Unreadable" separated from "zero" and from "not deployed".* These were collapsed in the
   first draft. Three distinct states are now required by FR-014, because an operator auditing a
   control surface reads a silent zero as a fact. SC-007 makes the absence of that failure mode
   measurable.

5. *Entry vs. authority separated.* FR-009 (entry is estate-wide) and FR-019 (authority is
   per-contract, per-chain) were initially one requirement, which would have let a role held on
   one network imply the power to write on another. They are now separate, matching the
   least-privilege behaviour the existing operator surfaces already enforce.

**Deferred to `/speckit-plan`:** which existing module owns the reference-chain constant, how the
per-chain read helper generalizes from the existing bridge/liquidity surface, and the per-view
conversion order. All are implementation concerns and are deliberately absent here.
