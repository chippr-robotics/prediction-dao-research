# Phase 0 Research: My Wagers — Card Grid Redesign

All Technical Context items resolved; no open `NEEDS CLARIFICATION`. The spec's
three high-impact ambiguities were resolved in `/speckit-clarify`
(Session 2026-06-18). The decisions below capture the remaining design choices.

## D1 — Component decomposition: extend `MarketsTable` vs. new grid component

- **Decision**: Add new `WagerCardGrid` (container) + `WagerCard` (item)
  components and replace `<MarketsTable/>` usages in `MyMarketsModal` with
  `<WagerCardGrid/>`, keeping the **same prop contract**. Remove `MarketsTable`
  once all four call sites are migrated.
- **Rationale**: `MyMarketsModal.jsx` is already ~2,600 lines; the table component
  passes ~20 props that the grid can accept unchanged, so call sites barely move.
  Isolated components are unit-testable and keep the diff reviewable. Matches the
  existing in-module sibling-component pattern (`MarketsTable`, `MarketDetailView`,
  `ResolutionModal`).
- **Alternatives considered**: (a) Mutate `MarketsTable` in place — rejected:
  conflates table/markup history and bloats the file. (b) A full standalone page —
  rejected by Clarification (stays a modal).

## D2 — Expand/collapse state ownership

- **Decision**: `WagerCardGrid` owns a single `openId` (the expanded card) in
  local React state; expanding one card collapses any other (`openId === id ?
  null : id`). Tab switches reset `openId` (the parent already resets selection on
  tab change; the grid remounts/derives from its `markets` prop).
- **Rationale**: Mirrors the mockup's `state.openId` and satisfies FR-007 (at most
  one open). Keeping it inside the grid avoids threading transient UI state through
  `MyMarketsModal`.
- **Alternatives considered**: Multiple simultaneously-open cards — rejected by
  FR-007. Lifting `openId` to the modal — unnecessary coupling.

## D3 — Decrypt-in-card flow

- **Decision**: Reuse the existing lazy decryption path. The card's "Decrypt
  Wager Details" button calls the already-wired `onDecrypt(marketId)` (→
  `handleDecryptMarket` → `fetchEnvelope` + `decryptMarket`), and the card reads
  `market.decryptedMetadata` / `isDecrypting(id)` to switch between locked,
  decrypting, revealed, and "terms unavailable" states.
- **Rationale**: No change to crypto/IPFS logic (honest state, smallest change).
  The existing FR-010 graceful-degradation tests already assert the
  "terms unavailable + retry" state; the card must preserve that contract.
- **Alternatives considered**: New per-card decryption hook — rejected (duplicates
  `useLazyMarketDecryption`).

## D4 — Action set & per-state visibility

- **Decision**: The card computes which action buttons to show from the same
  predicates the table uses today (`canResolve`, `canAccept`,
  `isCreatorOfPending`, `isWinnerUnpaid`, the activity watcher's
  `actionNeededByWagerId` → `accept/resolve/claim/refund/respondDraw`, and the
  expired/clear case). Buttons invoke the same callbacks
  (`onAccept/onResolve/onClaim/onRefund/onClearExpired`); resolve/accept open the
  existing modals. Busy/disabled state keyed by `claimingId`/`refundingId`; errors
  (`claimError`/`refundError`) render on the owning card.
- **Rationale**: Guarantees zero dropped actions (SC-003) and identical on-chain
  semantics (FR-012). Reuses spec-012 action-needed badges (FR-013).
- **Alternatives considered**: Re-deriving authorization in the card — rejected
  (risk of divergence from the table's rules).

## D5 — "View details" affordance (retain detail view)

- **Decision**: The expanded card includes a "View details" control that calls
  the existing `onSelect(market)` (already → `handleMarketSelect` →
  `setSelectedMarketId`, which renders `MarketDetailView`). No new navigation
  plumbing.
- **Rationale**: Implements Clarification "inline preview + keep detail view" with
  the path already present in `MyMarketsModal`.

## D6 — Density (compact / comfortable)

- **Decision**: Density is a toolbar toggle in the modal header; value held in
  `MyMarketsModal` state, defaulting to `compact`, mirrored to `sessionStorage`
  (`fairwins.myWagers.density`) and passed to `WagerCardGrid` as a `density` prop.
  Comfortable adds the avatar/opponent/time meta-line preview on collapsed cards
  (per mockup); compact omits it. Toggling never resets tab/filter/sort/openId.
- **Rationale**: Matches the mockup's compact/comfortable behavior and FR-019;
  session scope matches the Clarification's "remembered for the session".
- **Alternatives considered**: Persisting in `localStorage` across sessions —
  deferred (Clarification said session scope; avoid scope creep). Pure in-memory
  (lost on modal close) — weaker UX than `sessionStorage`.

## D7 — Pill tabs with count badges + sticky header

- **Decision**: Restyle existing `mm-tabs` buttons as pills with a count badge
  (`categorizedMarkets[tab].length`); Arbitrating pill shown only when its count
  > 0 (today's behavior). Keep header `position: sticky` (already present) and
  ensure tabs + toolbar live within the sticky region.
- **Rationale**: FR-016/FR-020; counts already computed in `categorizedMarkets`.

## D8 — Styling approach & theme mapping

- **Decision**: Extend `MyMarketsModal.css` (and optionally add `WagerCard.css`)
  using the existing `mm-`/new `wc-` class conventions; map the mockup's palette to
  the app's existing tokens/variables where they exist, falling back to the
  mockup's values (rounded 16px cards, status pill colors, accent for active
  state). Status color is always paired with a text label (a11y, not color-alone).
- **Rationale**: Consistency with the existing stylesheet; FR-024 / Principle V.
- **Alternatives considered**: Inline styles as in the `.dc.html` mockup —
  rejected (the codebase uses CSS classes; inline styles hurt theming/a11y review).

## D9 — Status pill coverage

- **Decision**: Pills cover the full status set the view supports today
  (`WagerStatus`): Pending Acceptance, Active, Pending Resolution,
  Challenged/Disputed, Resolved, Cancelled, Declined, Expired, Refunded, Draw,
  Oracle Timed Out — reusing `getStatusLabel`/`getStatusClass`. The mockup's
  5-color palette is extended to the existing classes.
- **Rationale**: FR-004; avoids regressions for states the mockup omitted.

## D10 — Test migration strategy

- **Decision**: Update `MyMarketsModal.test.jsx` assertions that target table
  semantics (`role="table"`, column headers, row cells) to the card DOM (e.g.
  cards as list/grid items with accessible names; status by text). Preserve all
  behavior assertions (tab switching, empty states, expired handling, FR-010
  graceful degradation). Add `WagerCard.test.jsx` for expand/collapse, single-open
  invariant, locked→decrypt→revealed, "View details" → onSelect, and per-state
  action visibility. Keep Cypress fast/full My Wagers flows green (update
  selectors as needed).
- **Rationale**: Principle II; the 40 existing tests are the regression net.

## Out of scope (confirmed)

- No contract/ABI/subgraph changes; no change to `useMyWagers`/`WagerRepository`
  data shape (only consumed).
- No new tabs or status semantics; no relabeling (tabs stay
  Participating/Created/Arbitrating/History).
- Wager creation, dashboard, oracle/resolution logic untouched.
