# Module Contract: Claimant View — Oracle Bet Summary

**Component**: `TakeChallengePanel.jsx` (extended). Lookup plumbing
(`UnifiedLookupModal` → `useOpenChallengeAccept.lookup`) is reused unchanged — the
`getWager` struct already returns `resolutionType`, `polymarketConditionId`,
`creatorIsYes`, and stakes.

## Rendering contract (when `Number(wager.resolutionType) === ResolutionType.Polymarket`)

Between the decrypted terms and the deadlines block, render an **oracle bet summary**:

1. **Bet statement** (single view, no navigation — FR-012/SC-004):
   - Market question — from verified `terms.oracle.question`, else live market, else
     "market details unavailable" fallback with the on-chain condition id shortened.
   - "You take: **{takerSideLabel}**" and "Creator holds: {creatorSideLabel}" — labels
     from `terms.oracle.outcomes` (verified) or live market outcomes; side assignment
     ALWAYS from on-chain `creatorIsYes` (taker = opposite).
   - Stake and payout: "You stake {stake} — winner takes {2×stake}" from on-chain
     `opponentStake` + token decimals/symbol.
2. **Settlement source (FR-013 / SC-005)**: a distinct badge — glyph + text
   "Settled automatically by **Polymarket**" — plus one plain-language sentence:
   the linked public market's resolution decides the winner; neither participant (nor
   any arbitrator) judges the outcome. Link to the public market page when `slug` is
   known. Rendered in BOTH live and degraded states.
3. **Live market context (FR-014)**: via `usePolymarketMarket(wager.polymarketConditionId)` —
   current prices per outcome, open/closed status, end date. While loading: skeleton row
   (never blocks the bound terms). On error: "Live market info unavailable right now —
   the bet terms above are binding" notice; accept stays enabled.
4. **Integrity (Constitution III)**: if `terms.oracle` exists and
   `terms.oracle.conditionId !== wager.polymarketConditionId` (case-insensitive hex
   compare) → show a warning that the stored description does not match the on-chain
   market linkage, and prefer live-market data for display. Missing `terms.oracle`
   (legacy bundle) → `unverifiable`: fall back to live data without a warning.
5. **Accept gate (FR-015, D8)**:
   - Live market `closed === true` or past `endDate` (but no outcome known) → prominent
     warning above the accept button; accept remains possible.
   - Live data shows a resolved outcome → accept button disabled with explanation
     ("This market has already resolved — this challenge can no longer be taken
     fairly.").
   - Live data unreachable → no gate beyond the on-chain accept deadline (disclosed).
6. **Non-oracle challenges** (`Either`/`ThirdParty`): rendering unchanged from today,
   except the bet summary's stake/payout line is also added (small, uniform
   improvement; existing tests updated accordingly).

## Accessibility

Badge conveys meaning by text + glyph (not color alone); live-status updates use
`role="status"`; the disabled accept state has an explanatory adjacent text node, not
just `disabled`.

## Accept flow

`useOpenChallengeAccept.accept` is resolution-type agnostic and unchanged; the only new
behavior is the app-level gate above (a UI predicate, not a hook change).
