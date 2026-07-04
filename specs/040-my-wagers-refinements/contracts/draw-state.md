# Contract: Draw State & Submission (US2)

## Market enrichment (modal data path)

`MyMarketsModal` MUST attach the draw proposer to each market before building the card view model,
reusing the existing scan:

```
fetchDrawProposals({ chainId, wagerIds }) -> { proposals: {wagerId, proposer}[], ok: boolean }
```

- Map `proposer` (lowercased) onto each market as `market.drawProposedBy` (null when not proposed).
- On `ok:false`, retain prior draw state (never fabricate a revoke — honest state, Constitution III).
- This mirrors what `data/notifications/sources/wagerSource.js` already does for notifications.

## `wagerVm.js` — draw submission fields

The card view model gains a derived draw descriptor:

```
draw: {
  phase: 'proposed' | 'settled' | 'none',
  proposer: string | null,
  mySubmitted: boolean,
  opponentSubmitted: boolean,
  label: string,          // human summary of who has submitted
} | null
```

**Derivation**
- `phase`: `computedStatus==='draw_proposed'` → `'proposed'`; `==='draw'` → `'settled'`; else `'none'`.
- `mySubmitted`: `phase==='settled'` OR (`phase==='proposed'` AND `proposer===me`).
- `opponentSubmitted`: `phase==='settled'` OR (`phase==='proposed'` AND `proposer===opponent`).
- `label` examples: "You proposed · awaiting opponent", "Opponent proposed · your turn",
  "Both agreed · stakes returned".

## `WagerCard.jsx` / `WagerTable.jsx` — rendering

- A `draw_proposed` or `draw` wager MUST show a distinct draw status treatment (text + icon), not only
  the "Respond to Draw" action button (FR-005).
- MUST render a per-party submission chip pair reflecting `draw.mySubmitted` / `draw.opponentSubmitted`
  (FR-006).
- Terminal `draw` copy MUST state both stakes are returned (FR-008).

## Notification (FR-007)

- Draw proposals already flow `drawProposalScan → diffWagers → activityEngine`. Requirement: a
  `null → proposer` transition MUST produce a user-facing notification labeled clearly as a pending
  draw ("Draw proposed — respond"). Verified by a `diffEngine`/`wagerSource` regression test; the
  detection is added only if it is not already emitted.
