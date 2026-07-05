# Module Contract: Oracle Open Challenge — Create Flow

**Components**: `OracleOpenChallengeModal.jsx` (new), `ClaimCodeResultPanel.jsx`
(extracted), `useOpenChallengeCreate.js` (extended)

## OracleOpenChallengeModal

```jsx
<OracleOpenChallengeModal isOpen={bool} onClose={fn} />
```

Behavior contract:

1. **Gating**: renders nothing useful on chains without `capabilities.polymarketSidebets`
   or when `!isOracleModelExposed(ResolutionType.Polymarket)`; Dashboard also hides/locks
   the entry card (see FR-004). `PolymarketBrowser` self-gates as a second layer.
2. **Discovery step**: `PolymarketBrowser variant="inline" showFilters limit={20}
   onSelectMarket={...} selectedConditionId={...}` — default feed with no input,
   category chips, debounced search, event grouping (all existing behavior).
   Markets failing `deriveOracleChallengeTimeline(...).eligible` (ends < 1h out,
   closed, unparseable end) are not selectable; the card shows the reason.
3. **Configure step** (market selected): shows question + image + endDate + live prices;
   side picker = two labelled buttons from `market.outcomes[].name` (fallback Yes/No)
   with prices, `aria-pressed`, keyboard operable; stake input identical to
   `OpenChallengeModal` (USDC, `> 0`, 2-dp normalize on blur); derived timeline rendered
   read-only ("Takeable until … · settles by …", sourced from the event; discloses when
   the 30-day cap shortened it). No editable date inputs.
4. **Create**: calls `createOpenChallenge` (below) with
   `resolutionType: ResolutionType.Polymarket`, `oracleConditionId: market.conditionId`,
   `creatorIsYes: side === 0`, derived deadlines (ms → hook converts), auto-composed
   `description`, and `oracleMeta` for the sealed block. Progress states mirror
   `OpenChallengeModal` (`onProgress` messages), errors surface translated reverts.
5. **Result**: renders `ClaimCodeResultPanel` (below) — behavior identical to the
   user-defined flow (code shown once, copy, QR, deep link, auto vault backup).

## ClaimCodeResultPanel (extraction — no behavior change)

```jsx
<ClaimCodeResultPanel result={{ code, wagerId, txHash }} onDone={fn} />
```

Extracted from `OpenChallengeModal`'s post-create UI. MUST preserve: one-time code
display, copy-with-confirmation, `WagerQRCode` + `buildTakeChallengeUrl` deep link,
`useOpenChallengeCodeVault` auto-backup with `idle|saving|saved|error` states.
`OpenChallengeModal` switches to this component; its existing tests stay green.

## useOpenChallengeCreate (extension)

Accepted form fields (existing + new semantics):

```js
createOpenChallenge({
  description,            // auto-composed by the oracle modal
  stake, token?,
  acceptDeadline, resolveDeadline,   // unix seconds (derived, not hand-picked)
  resolutionType,          // 4 (Polymarket) for this flow — already supported
  oracleConditionId,       // market.conditionId — already threaded to the contract
  creatorIsYes,            // side === 0 — already threaded to the contract
  oracleMeta?,             // NEW: { source, conditionId, question, outcomes,
                           //        creatorSide, endDate, slug } — sealed, never on-chain plaintext
}, onProgress)
```

Contract:

- When `oracleMeta` is present, the sealed plaintext becomes
  `{ description, createdAt: <ISO now>, oracle: oracleMeta }`; otherwise the payload is
  unchanged (`{ description, createdAt }`) — user-defined flow byte-compatible.
- `translateOpenCreateRevert` gains mappings: `PolymarketRequired` → "Pick a market to
  link…", `AdapterNotSet` → "Polymarket settlement isn't available on this network…",
  `ConditionAlreadyResolved` → "That market has already resolved — pick a live one.",
  `PolymarketDisallowed` → internal-consistency message. (FR-008 UX; the revert itself
  is the on-chain re-validation.)
- Return shape unchanged: `{ code, wagerId, txHash }`.

## Dashboard wiring

- `quickAccessCards.js`: add `{ id: 'oracle-open-challenge', label: 'Oracle Open
  Challenge', … }`.
- `Dashboard.jsx`: card in `createActions` (capability-aware like `create-1v1-oracle`),
  `handleQuickAction('oracle-open-challenge')` → open the new modal; modal instance
  alongside `OpenChallengeModal`. Existing cards/flows untouched.
