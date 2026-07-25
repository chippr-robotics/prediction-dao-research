# Specification Quality Checklist: Transfer — Cross-Chain Bridge & Earn — Pool Liquidity

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-25
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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.

### Validation record

**Iteration 1 — issues found and fixed:**

1. *No implementation details* — the draft named "FeeRouter" (a contract) in the narrative and in
   FR-026/FR-027. Rewritten as "the single platform-fee source of truth" / "platform-fee
   configuration"; the `bridge.transfer` / `liquidity.deposit` service identifiers and the 250 bps cap
   are retained deliberately because they are **product-level contract terms** the spec must bind (the
   cap is a member protection and the identifiers are how the fee is addressed across the platform),
   not a technology choice.
2. *No [NEEDS CLARIFICATION] markers* — three scope decisions (bridge liquidity model, Uniswap
   position model, asset/chain coverage) were resolved with the requester before drafting and are
   recorded as **decided** in Assumptions, so no markers were carried into the spec.
3. *Scope clearly bounded* — an explicit **Out of Scope** section was added, since a cross-chain
   feature invites unbounded reading (FairWins-operated bridges, non-EVM chains, cross-chain wagers).
4. *Vocabulary collision* — the member-facing name "Pool" collides with the existing Wager Pools
   feature (spec 034), which already owns the `pool` activity class and notification category.
   FR-039 was added to forbid reusing those identifiers, and the collision is called out in the
   narrative so it cannot be missed at planning time.

**Iteration 3 — post-planning revision (2026-07-25):** two requester decisions revised the spec after
`/speckit-plan`; re-validated, all items still pass.

1. *Earn area renamed* — the area is **Supply**, not "Pool". "Pool" stays with Wager Pools (spec 034),
   where it accurately names a shared-funds wager among a group. FR-003 and FR-039 updated; FR-039a
   added to require disambiguating the existing wager-pool feed label, which already reads "Pool".
2. *Coverage maximized* — FR-006a/b/c added: bridging on every supported network where the settlement
   protocol is deployed, which required **adding Arbitrum, Base, and Optimism** as first-class networks
   (five mainnets, 20 directed routes). FR-016a added: trading liquidity on every Uniswap network, and
   enabling it must not switch on unrelated capabilities — `capabilities.dex` currently gates in-app
   swapping and Ethereum deliberately ships without it. FR-016b added: per-chain address resolution,
   because Uniswap explicitly warns its addresses are not identical across chains (Base's differ).
   SC-017 – SC-019 added to make all three testable.

**Iteration 4 — post-planning revision (2026-07-25):** three further requester decisions; re-validated,
all items still pass.

1. *Ethereum gets the DEX* — FR-016a revised: in-app swapping ships on every network where Uniswap is
   deployed, Ethereum included. This **supersedes spec 048's** no-in-app-swap decision and is recorded
   as a deliberate product change in research R4a and the plan's Complexity Tracking, not an accident of
   configuration. The swap/liquidity capability split is kept (different prerequisites), but both flags
   are on for all five mainnets.
2. *No in-app chain switching* — FR-059 – FR-061 added: every asset choice lists holdings across all
   supported networks with the existing nested asset+network logo, reusing spec 064's
   `UniversalAssetSelect` rather than adding a second selector; any network switch happens at signing.
3. *Pair pinning, search* — FR-062 – FR-066 added. **FR-063 is the one to watch**: the Bridge surface is
   the deliberate inverse of the same-network pair rule, and applying FR-062 to it would silently reduce
   a bridge to a same-chain transfer that still quotes and still signs. Both predicates live in one
   helper so the inversion is visible at the point of use (research R11b), and quickstart 14f tests it
   directly. SC-020 – SC-022 added.

**Iteration 5 — `/speckit-analyze` remediation (2026-07-25):** analysis found 1 CRITICAL, 3 HIGH,
5 MEDIUM, 3 LOW across spec/plan/tasks. All CRITICAL, HIGH, and MEDIUM findings are resolved.

- **C1 (CRITICAL)** FR-061 had zero implementation tasks — the signing-time network switch the whole
  cross-network selector depends on. Added T151/T152 (Bridge) and T153 (Supply), and listed them among
  the non-waivable gates.
- **C2 (HIGH)** FR-033 restricted-account view/exit had zero tasks → T154/T155.
- **C3 (HIGH)** FR-044 pause-during-degradation had no verifying task → T156.
- **C4 (HIGH)** SC-005 was unverifiable as written and had survived two review passes without an owner.
  Re-cut: the build-gate half is now the automatically verifiable disclosure gate (T096); the moderated
  comprehension check remains as an explicit **launch** gate with an owner (T158).
- **C5 (MEDIUM)** FR-050 per-network control-state isolation → T157.
- **C6 (MEDIUM)** FR-065 empty-counterpart had a test but no implementation → folded into T055.
- **C7 (MEDIUM)** No task cited a Success Criterion; 12 SC ids are now cited on the tasks that satisfy
  them, so SC→task traceability is checkable rather than inferred.
- **A1 (MEDIUM)** `NN-` placeholders resolved against the live series: posts → **35**, knowledge → **21**.
- **I1 (MEDIUM)** Stale "Pool" naming removed from `contracts/admin-and-runtime.md` and
  `contracts/liquidity-router.md` after the Supply rename.
- **I2 (LOW)** SC-019 restored to numeric position. **U1 (LOW)** `PoolCard.jsx` → `LiquidityPoolCard.jsx`.
- **D1 (LOW)** FR-026/FR-027 overlap judged complementary; no change.

Post-remediation: 72 FRs, **100% with ≥1 task**; 158 tasks; 0 format violations; no constitution
violations.

**Iteration 2 — re-validation:** all items pass. Remaining watch-items for `/speckit-plan`:

- ~~SC-005's usability target requires a real usability test to verify~~ — **resolved in iteration 5**:
  re-cut into an automatically verifiable build gate plus an owned launch gate (T158).
- The spec deliberately does **not** name the bridge protocol(s) or the Uniswap deployment version.
  Both are plan-level research items constrained by the decided model (third-party LP, full-range
  positions, EVM-only).
