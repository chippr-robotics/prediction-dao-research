# Oracle-Settled Open Challenges (spec 041)

Open challenges (spec 024) with **Polymarket as the settlement source**: the creator
links a live Polymarket market at creation, picks a side, and shares the four-word
claim code; the taker gets the opposite side and the wager settles automatically via
`autoResolveFromPolymarket`. **No contract changes** — `createOpenWager` already
validates oracle linkage on-chain (`_checkOracleLinkage`: non-zero condition id,
adapter configured, condition *unresolved*), and the post-accept resolution path is
identical to named-opponent oracle wagers. The lifecycle proof lives in
`test/integration/oracle/WagerRegistry_PolymarketOpenChallenge.test.js`.

## Frontend pieces

| Piece | File | Notes |
|---|---|---|
| Create flow | `frontend/src/components/fairwins/OracleOpenChallengeModal.jsx` | Picker-first: `PolymarketBrowser` (inline) → side picker → stake → derived timeline. Gated on `capabilities.polymarketSidebets` + `isOracleModelExposed(Polymarket)`. |
| Claimant view | `frontend/src/components/fairwins/TakeChallengePanel.jsx` | Bet summary (stake/payout for all open challenges) + oracle block: question, taker's side, "Settled automatically by Polymarket" badge, live context, accept gate. |
| Shared result panel | `frontend/src/components/fairwins/ClaimCodeResultPanel.jsx` | Extracted from `OpenChallengeModal` — one code/QR/deep-link/vault-backup UX for both create flows. Don't fork it. |
| Timeline derivation | `frontend/src/lib/openChallenge/oracleTimeline.js` | Pure. `accept = min(marketEnd, now+30d−1h)`, `resolve = min(marketEnd+7d, now+180d−1h)`, 1h minimum lead. Derived values can never fail the contract's `_checkDeadlines`. |
| Live market fetch | `frontend/src/hooks/usePolymarketMarket.js` | One Gamma market by `condition_ids`; normalized via `normaliseGammaMarket`; errors degrade, never gate. |

## The sealed `oracle` terms block

`useOpenChallengeCreate` seals (code-keyed envelope, spec 024 format unchanged):

```json
{
  "description": "…human-readable, names market + side + Polymarket…",
  "createdAt": "<ISO>",
  "oracle": {
    "source": "polymarket", "conditionId": "0x…", "question": "…",
    "outcomes": ["Yes", "No"], "creatorSide": 0, "endDate": "<ISO>", "slug": "…"
  }
}
```

It exists so a code-holder can read the bet when the Gamma API is down (FR-014).
Never put the market reference in on-chain plaintext — it would break the spec-024
indistinguishability of code-gated challenges.

## Chain-authoritative display rule (Constitution III)

The on-chain wager fields — `resolutionType`, `polymarketConditionId`, `creatorIsYes`
— are the **only** authority for what is bet. The sealed `oracle` block is display
metadata: the claimant view cross-checks `terms.oracle.conditionId` against
`wager.polymarketConditionId` and, on mismatch, flags the stored description and
falls back to live data. Side labels index the adapter's outcome ordering:
**index 0 = YES = `creatorIsYes: true`**; the taker always holds the opposite.

Accept gating is app-level honesty (the contract cannot query the oracle at accept):
a closed market warns; only a *positively known* public outcome (closed + ~certain
price) disables accept. Unreachable live data discloses itself and never blocks.
