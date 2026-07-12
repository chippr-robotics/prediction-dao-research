# Phase 0 Research: Create-a-Challenge Home Screen

Technical context was resolvable from the codebase and the resolved Clarifications (My Rewards →
My Wagers; Wagers → dedicated `/wagers` route + drawer item; home create = open-challenge only).
No open `NEEDS CLARIFICATION` remains. Decisions below shape Phase 1.

---

## D1 — Extract the consolidated create panel (embedded vs. modal)

**Decision**: Extract the consolidated `MakerPanel` from `OpenChallengeModal.jsx` into a standalone
`CreateChallengePanel.jsx` that renders in two modes: **embedded** (inline, for the home screen) and
**modal** (wrapped by `OpenChallengeModal` for the Wagers grid entry). The panel owns all create
state (amount, memo, resolution incl. oracle path + market step, deadlines, submit, result view).

**Rationale**: The home inline view and the Wagers "Open Challenge" modal must be the same create
experience (spec: reuse; SC-006 one create surface). One component = one place to test and maintain.
The WIP checkpoint already consolidated the oracle path into `MakerPanel`, so this is a lift-and-wrap.

**Shape**: `CreateChallengePanel({ embedded = false, onClose, onDone, initialResolutionType })`.
- `embedded` drops the modal-only affordances (no backdrop/close chrome; renders directly into home).
- On success it shows the existing `ClaimCodeResultPanel` inline (with a "create another"/done path).
- `OpenChallengeModal` becomes a thin shell: header + `CreateChallengePanel` (embedded=false).

**Alternatives considered**: Duplicate the panel for home — rejected (drift, double test surface).
Render the whole modal inline with its backdrop hidden — rejected (modal semantics/focus-trap fight
an inline surface).

---

## D2 — Home screen composition (`/app`)

**Decision**: Replace `Dashboard`'s quick-action grid with a **HomeScreen** that renders, top to
bottom: the embedded `CreateChallengePanel` as the hero/primary content, then an **Accept a
challenge** entry and a **My Rewards** entry as secondary actions beside/below it (mirroring how
Pool/Request flank Pay on the reference), and the existing `PolymarketTickerCrawler` (routing into
the panel's oracle path). The Polymarket ticker and header/nav chrome stay.

**Disconnected/gated (FR-013)**: HomeScreen always renders the create view; the create action is
gated by the existing connect/membership prompts (reuse the panel's current gating). The old
`WelcomeView` is absorbed — a light connect affordance can sit near the create action rather than
replacing the whole screen. (Assumption honored: no new pre-home blocking state.)

**Rationale**: Matches US1 (app opens on create) and FR-001/FR-013; reuses the ticker and gating
already in `Dashboard`.

**Alternatives considered**: Keep `WelcomeView` for disconnected users — rejected: FR-013 wants the
create view visible to everyone, gating only the action.

---

## D3 — Accept a challenge & My Rewards entries

**Decision**: **Accept a challenge** opens the existing `UnifiedLookupModal` (today's "Enter Words"
take-a-challenge flow). **My Rewards** opens the existing `MyMarketsModal` (My Wagers), which already
lists claimable payouts and the "Claim Winnings" action (resolved in Clarifications). Both are opened
from HomeScreen via the same local-state modal pattern `Dashboard` uses today.

**Rationale**: FR-009 + Clarifications — reuse the real flows, no new surfaces. Lowest risk.

**Alternatives considered**: A new dedicated winnings route — rejected per Clarification (reuse My
Wagers). A separate rewards computation — out of scope (FR-014).

---

## D4 — The `/wagers` route + nav-drawer item

**Decision**: Add a top-level **`/wagers`** route under `AppLayout` rendering a new `WagersPage`
that hosts the relocated `QuickActions` grid and its existing modals (`FriendMarketsModal`,
`GroupPoolModal`, `OpenChallengeModal`, `UnifiedLookupModal`, `MyMarketsModal`, `QRScanner`,
`AddressQRModal`) plus the `quickAccessPreference` visibility filtering — i.e. the current
`Dashboard` grid behavior, moved. Add a **"Wagers"** item to `appNav.js` as an absolute-route entry
(like `HOME_ITEM`), special-cased in `pathForNavItem` (→ `/wagers`), and render it in `AppNavDrawer`.

**Rationale**: Clarification chose a dedicated route + drawer entry. `pathForNavItem` currently maps
section ids to `/wallet?tab=<id>`; Wagers needs its own absolute route (it is a page, not a Wallet
tab), so it is modeled like Home. Keeps every create type/action reachable (FR-010/FR-012).

**Nav placement**: pin "Wagers" near Home at the top of the drawer (both are primary destinations),
or as the first item of a "Wager" group — final placement decided in tasks; the model/path work is
the same.

**Alternatives considered**: `/wallet?tab=wagers` (Clarification rejected — not a Wallet tab); a new
global bottom tab bar (Clarification rejected — larger change, app has none today).

---

## D5 — Dashboard split & route wiring

**Decision**: `/app`, `/main`, `/fairwins` render `HomeScreen`. `/wagers` renders `WagersPage`.
`Dashboard.jsx` is retired: its `QuickActions` + `WelcomeView` + `handleQuickAction` + all modal
state move into `WagersPage` (grid/actions) and `HomeScreen` (create/accept/rewards + ticker). If a
thin `Dashboard` is kept, it simply renders `HomeScreen` (or the routes point straight at
`HomeScreen`). The Polymarket ticker click routes into HomeScreen's oracle path (already repointed in
the WIP).

**Rationale**: Cleanest separation of the two surfaces; avoids a monolithic Dashboard doing both.

**Alternatives considered**: Keep everything in `Dashboard` and conditionally render home-vs-grid —
rejected: muddies the two routes and their tests.

---

## D6 — Deep links & existing routes (FR-016)

**Decision**: Preserve the `?oc=take&code=` deep-link handling (currently in `Dashboard`) by moving
it to whichever surface owns take-a-challenge on `/app` (HomeScreen) so a taker link still opens the
unified lookup. `/friend-market/accept`, `/pools/:address`, and other routes are unchanged.

**Rationale**: FR-016 — deep links must still route after the home surface changes.

**Alternatives considered**: Drop deep-link handling from home — rejected (regression).

---

## D7 — Finish the WIP oracle-consolidation test debt

**Decision**: This branch's WIP checkpoint consolidated oracle settlement into the create panel and
deleted the standalone oracle modal, leaving several tests mid-updated (OC caption/subtitle removals,
`Dashboard.test` oracle-entry, `accessibility.test` oracle block, migrated oracle coverage). Finish
them as part of this feature: the Dashboard split means those grid/oracle tests are re-homed to
`WagersPage`/`CreateChallengePanel` tests rather than patched in place.

**Rationale**: The consolidation and the home redesign are one continuous change on this branch; the
test rework belongs here, aligned to the new structure (not the interim Dashboard).

---

## D8 — Testing strategy

**Decision**: (a) `CreateChallengePanel` unit/integration tests: renders embedded + modal; all three
resolution paths incl. network-gated oracle + market step; submits via the mocked create hook. (b)
`HomeScreen` tests: renders the embedded create view as primary content, Accept opens the unified
lookup, My Rewards opens My Wagers, ticker routes to oracle, deep-link routes. (c) `WagersPage` tests:
every relocated card launches its flow; quick-access visibility still applies. (d) Nav test: the
Wagers drawer item routes to `/wagers`. Reuse the established mock-the-hook / stub-the-modal patterns.

**Rationale**: Principle II; covers SC-001..SC-007. Stubbing heavy modals (as `Dashboard.test` does)
keeps page tests fast and focused on wiring.
