# Phase 0 Research: Polymarket-Only Oracle Selection

## R1. The single switch (FR-005, US3)

**Decision**: One build-time env flag → one derived constant. Add
`EXPOSED_ORACLE_RESOLUTION_TYPES` to `constants/wagerDefaults.js`, computed from a
`VITE_ORACLE_MODELS` env var: default (`polymarket-only` / unset) → `[Polymarket]`;
`all` → `[Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA]`.

**Rationale**: Matches the app's established config pattern (`VITE_NETWORK_ID`,
`VITE_PINATA_*`). A single exported array is the one source of truth every oracle-
selection surface reads, so re-enabling is a one-line flag flip (no UI archaeology,
no fragments). Placing it next to `ResolutionType`/`ORACLE_RESOLUTION_TYPES` keeps
the oracle taxonomy in one file.

**Alternatives considered**: a runtime/admin toggle (rejected — heavier; the request
is "for now" with a later feature; build-time flag is simplest and reversible); per-
component booleans (rejected — fragments, exactly what FR-005/US3 warns against).

## R2. Where to filter (FR-001, FR-002)

**Decision**: Derive `ORACLE_TAB_TYPES` (FriendMarketsModal L70–75) from
`EXPOSED_ORACLE_RESOLUTION_TYPES`. The existing tab logic
(`availableResolutionTypes`, L192–193; tab render ~L1045) then naturally offers only
the exposed models. When exactly one oracle model is exposed:
- default `formData.resolutionType` to Polymarket for the oracle category, and
- suppress the multi-tab oracle strip (render no chooser, or a static
  non-interactive label), so there is no dead single-tab/empty selector (FR-002).

**Rationale**: One filter point covers all selection paths (visible tabs, and —
because the unexposed types are never in the list — keyboard/programmatic
selection). The Chainlink/UMA condition-picker branches (L1192–1198,
`OracleConditionPicker`) become **unreachable**, so no edits are needed there.

**Alternatives**: hiding tabs via CSS (rejected — still selectable by keyboard/DOM,
violates FR-001 "by any means"); deleting the Chainlink/UMA code (rejected — we want
a flag flip to restore, not a re-add).

## R3. Preserve display + settlement of existing wagers (FR-006)

**Decision**: Filter only the **selectable** list. Keep `RESOLUTION_TYPE_LABELS`,
`RESOLUTION_TAB_LABELS`, and resolution-type descriptions **complete** (all four
oracle models), and leave read/settlement paths untouched.

**Rationale**: A wager already created with (or linked to) Chainlink/UMA must still
show its model name and resolve. Hiding is about *creation/selection*, not viewing.
Filtering the labels would break the display of those wagers.

**Edge case**: a deep link/saved draft pre-selecting a now-hidden model must fall
back to Polymarket (or a clear non-broken state) rather than render an empty/locked
selector — handled where the initial `resolutionType` is resolved.

## R4. Copy conditioning (FR-004)

**Decision**: Make the user-facing oracle copy conditional on the flag.
`Dashboard.jsx` ("Auto-settles from Polymarket, Chainlink or UMA") and
`OnboardingTutorial.jsx` (Chainlink + UMA explainer cards / "Polymarket, Chainlink
or UMA") render the reduced wording when the flag is Polymarket-only, and the full
wording when `all`.

**Rationale**: Copy that advertises models a user can't pick re-creates the
confusion the feature removes (US2). Tying copy to the same flag keeps it consistent
with the selector and reversible.

## R5. Out-of-scope surfaces

**Decision**: Leave `components/admin/OracleAdaptersTab.jsx` (operations) and all
on-chain adapters/contracts **unchanged** (spec decision 2026-06-06; FR-007).

**Rationale**: Ops keep full visibility/control of deployed adapters (to operate
Polymarket and keep Chainlink/UMA warm for the later re-enable); the contracts must
not change.

## Resolved unknowns

All Technical-Context items are resolved. The only new artifact is the exposure
constant + flag; everything else reads from it.
