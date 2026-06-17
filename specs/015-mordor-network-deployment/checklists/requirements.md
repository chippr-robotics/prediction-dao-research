# Specification Quality Checklist: Mordor Network Deployment

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-16
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

- All items pass. Re-validated 2026-06-16 against `origin/main` after PR #695
  (`feat(frontend): relocate network selector to My Account, simplify wallet menu`)
  landed. The "Network tab" is now concrete: `My Account → Network`
  (`frontend/src/components/wallet/NetworkSettings.jsx`) renders one card per
  `selectable: true` network in `networks.js`, with capability tags derived from
  deployed addresses via `frontend/src/config/networkCapabilities.js`.
- **Clarifications resolved (Session 2026-06-16)** — four high-impact decisions were
  locked via `/speckit-clarify` and integrated into the spec:
  1. **Contract scope** — core only (wager registry, membership manager, key registry,
     sanctions guard); oracle adapters NOT deployed on Mordor (FR-001).
  2. **Classic USD** — reuse the existing canonical Mordor token only; no mock; feature
     blocked if none exists (FR-003, Dependencies). The plan must still pin/verify the
     canonical address before deploy (fund-custody surface — highest risk per constitution).
  3. **Sanctions Guard** — deployed and enforced on Mordor, no relaxed testnet mode (FR-016).
  4. **Legacy v1** — v2 supersedes it; v1 read-only Mordor support retired (FR-017).
- Remaining plan-level verification (not spec gaps): confirm the canonical Classic USD
  address and ETCswap contracts/liquidity exist on Mordor; if ETCswap is absent, Token
  Swap disables cleanly while the rest of the feature still ships.
- Implementation note for the plan (not a spec gap): the existing card shows only the
  name, testnet/mainnet badge, switch button, and capability tags — it does **not** yet
  show explorer/faucet/stablecoin docs. FR-007 requires extending the card with that
  Mordor operational documentation. FR-008's capability tags are already data-driven, so
  they light up automatically once Mordor is registered selectable and its contracts are
  synced.
- Constitution touchpoints to carry into the plan: Security-First contracts (deploy/
  custody path), Honest State + network isolation (FR-009, FR-012), and config sourced
  from generated sync artifacts (FR-005).
