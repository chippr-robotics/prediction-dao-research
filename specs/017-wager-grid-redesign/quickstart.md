# Quickstart & Validation: My Wagers — Card Grid Redesign

How to run and validate the redesigned My Wagers card grid. Implementation details
live in `tasks.md` / the components; this is a run + acceptance guide.

## Prerequisites

- Repo deps installed (`npm install` at root; frontend deps under `frontend/`).
- A wallet connected to a supported testnet (e.g. Polygon Amoy) with a few wagers
  across states (an incoming pending offer, an active wager you can resolve, a
  resolved wager you won and have not claimed, and a couple of history items).

## Run

```bash
npm run frontend          # start the Vite dev server
# open the app, connect wallet, open "My Wagers" (Dashboard → My Wagers)
```

## Automated checks (must pass)

```bash
npm run test:frontend                                   # Vitest unit/integration
npx vitest run frontend/src/test/MyMarketsModal.test.jsx \
              frontend/src/test/WagerCard.test.jsx      # focused
cd frontend && npm run lint                             # ESLint (blocking)
# Cypress My Wagers flows (fast lane), per existing scripts:
#   accept / decline / cancel, manual resolution, claim payouts
```

Accessibility: the existing axe/Lighthouse CI step must report **no new
violations**.

## Manual validation scenarios (map to spec)

1. **Cards render (US1 / FR-001..005, SC-001..002)** — Open My Wagers: each wager
   is a card showing stake + **real token symbol**, title, and a colored status
   pill. Resize from desktop to phone width: cards reflow from multiple columns to
   a single column. History cards show Won/Lost/Draw in the matching color.

2. **Expand & decrypt (US2 / FR-006..010a, SC-004)** — Click a card: it expands in
   place, chevron rotates, metadata grid + terms appear. Open a second card: the
   first collapses (single-open). For an encrypted wager, the expanded card shows
   "Decrypt Wager Details"; click it → terms reveal in place. Force a decrypt
   failure → "terms unavailable" + retry (FR-010 preserved). Click **View
   details** → the existing full detail view opens (dispute status, participants,
   block-explorer links).

3. **Actions (US3 / FR-011..015, SC-003/005)** — For each state, expand and confirm
   only the valid actions appear and run the existing flow:
   - incoming pending → **Accept / Decline**
   - active & you can resolve → **Settle/Resolve** (opens resolution modal)
   - resolved & you won, unpaid → **Claim winnings** → on success, Claim disappears
   - refundable → **Refund**; draw proposed → **Respond to Draw**
   - expired offer → **Reclaim & Clear**
   On success a confirmation toast appears and the card reflects the new state; a
   failure shows a clear message on the card; the in-flight button is disabled.

4. **Tabs / filter / sort / density (US4 / FR-016..020, SC-007)** — Tabs render as
   pills with count badges; Arbitrating shows only when applicable. Switch tabs →
   grid + counts update and any open card resets. Change Status filter and Sort →
   visible cards change. Toggle **Compact ↔ Comfortable** → collapsed cards
   show/hide the opponent/time preview line without losing tab/filter/sort/open
   card. Scroll → header (title, network pill, tabs, toolbar) stays pinned. Switch
   networks → only active-network wagers appear (no cross-network leak).

5. **Empty / disconnected (FR-021..022)** — Disconnect wallet → connect prompt.
   A tab with no wagers → its empty state (icon, title, hint).

## Definition of done

- All acceptance scenarios above pass manually.
- `npm run test:frontend` and `frontend` ESLint pass; updated `MyMarketsModal`
  tests + new `WagerCard` tests green; My Wagers Cypress flows green.
- No new accessibility violations in CI.
- No `contracts/`, ABI, or subgraph changes in the diff.
