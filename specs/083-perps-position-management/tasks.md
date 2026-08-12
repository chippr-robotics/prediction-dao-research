# Tasks: Perps Position Management

**Input**: plan.md, research.md, contracts/{venue-calldata,order-state-machine,fee-rails}.md
**Format**: `[ID] [P?] [Story] Description` — [P] = parallelizable

## Phase 1 — Setup

- [x] T001 Spec artifacts (spec/plan/research/contracts/tasks)

## Phase 2 — Foundations (blocking, pure logic, no UI)

- [x] T010 [P] `abis/perps/{gainsDiamond,gmxExchangeRouter,gmxReader,gmxDataStore}.js` — hand-maintained
      fragments only, exactly the functions/events in contracts/venue-calldata.md
- [x] T011 [P] `config/perps.js` — venue addresses per chain (Gains diamond, GMX ExchangeRouter /
      **Router approval target** / Reader / DataStore / OrderVault / EventEmitter), `PERPS_MANAGE_*`
      capability flags (HL management OFF), attestation version
- [x] T012 `lib/perps/feeUnits.js` — bps ↔ GMX factor ↔ HL f ↔ HL maxFeeRate string + notional money
- [x] T013 `lib/perps/venues/gains.js` — Trade struct encode (collateral-precision + 1e10 + 1e3
      scales), open/close/reduce/updateTp/updateSl/multicall-with-slippage/cancelOrderAfterTimeout;
      **branded PendingOrderIndex vs TradeIndex types**; event decoders + CancelReason map
- [x] T014 `lib/perps/venues/gmx.js` — CreateOrderParams encode for MarketIncrease/MarketDecrease/
      LimitDecrease/StopLossDecrease, sendWnt+sendTokens+createOrder multicall, cancelOrder/
      updateOrder, Reader position decode, EventLog2 topic filtering, execution-fee estimate
- [x] T015 `lib/perps/orderState.js` — the state machine per contracts/order-state-machine.md
- [x] T016 [P] `lib/perps/validation.js` — refuse-before-prompt validators (balance, venue limits,
      leverage bounds, stop beyond liquidation, min size)
- [x] T017 [P] `lib/perps/defaults.js` — smart defaults (venue choice + reason, leverage, collateral
      from holdings, direction, slippage, suggested SL/TP)
- [x] T018 [P] `lib/perps/venueStatus.js` — live `getTradingActivated()` + GMX availability
- [x] T019 [P] `lib/perps/attestation.js` — versioned jurisdiction + leverage-risk record
- [x] T020 [P] Tests for T012–T019 incl. **calldata ownership assertions** and index-space rejection

## Phase 3 — US1/US4 Exit first (P1)

- [x] T030 `hooks/usePerpsTrade.js` — submit → pending → terminal, injectable deps
- [x] T031 `hooks/usePerpsOrders.js` — pending + stuck orders per venue
- [x] T032 `usePerpsPositions.js` [MODIFY] — carry venue refs; add GMX Reader reads on Arbitrum
- [x] T033 gateway `perps/normalize.js` + `routes.js` [MODIFY] — carry Gains trade/pending indices
- [x] T034 `components/perps/PositionSheet.jsx` — bottom sheet: close / reduce, cost breakdown,
      async state, venue reasons
- [x] T035 `components/perps/PerpsPendingOrders.jsx` — stuck-order recovery, never gated
- [x] T036 [P] Tests: sheet states, close/reduce calldata, recovery, exits-never-gated

## Phase 4 — US2 Protection (P1)

- [x] T040 Stop-loss / take-profit within PositionSheet (Gains updateTp/updateSl; GMX
      StopLossDecrease/LimitDecrease with `autoCancel`)
- [x] T041 [P] Tests: defaults, liquidation-bound refusal, venue-stored values reflected

## Phase 5 — US3 Entry (P2)

- [x] T050 `components/perps/OpenPositionSheet.jsx` — smart defaults, preview, fee disclosure
- [x] T051 `components/perps/PerpsAttestation.jsx` + screening gate on opens only
- [x] T052 Passkey disclosure (smart account owns the position)
- [x] T053 [P] Tests: defaults, validation-before-prompt, disclosure present/absent, attestation gate
- [x] T054 **Wiring** — `PerpsView` opens the sheet from a pair row, gated on
      `perpsManageFeatureEnabled() && perpsManageEnabled(venue, chainId)` (the same two halves
      `canManage` uses, so Hyperliquid never grows a dead control). The two sheets are mutually
      exclusive: both take the body scroll lock and both bind a capture-phase Escape handler, so a
      second one mounting over the first left the page unscrollable after both were dismissed.
      Flag OFF is asserted three ways — no control, no added markup in the trade cell, and **no
      network reads** (both entry reads are started by the tap, so a flag-off build performs none).
- [x] T055 **The open path's data producers.** The sheet was reachable but could never submit:
      the Gains pair feed published no `pairIndex`, neither venue published a collateral set, and
      nothing read the member's balances — so every venue refused by name and the control was dead.
      Gateway `normalizeGainsPairs` now emits `pairIndex` / `minLeverage` / `collaterals` (venue's
      own 1-based index + decimals + USD price, inactive and partly-described entries omitted) and
      `normalizeGmxPairs` emits `market` + the market's long/short `collaterals` priced from GMX's
      own tickers. `openPositionActions#openVenueOptionsFor` composes them with the live venue
      status; `defaultReadCollateralBalances` reads the member's balances (an unreadable balance is
      OMITTED, never reported as zero).

## Phase 6 — US5 Administration + ops (P3)

- [x] T060 `components/admin/PerpsFeesPanel.jsx` (+ `perpsFeeRails.js`, CSS, tests) — both rails,
      authority named, GMX rate AND its live `MAX_UI_FEE_FACTOR` ceiling read from GMX's own
      DataStore with a `setUiFeeFactor` control; HL read from the FeeRouter service and edited in
      the Fees tab (linked, never duplicated); Gains shown as a venue-paid rebate with no settable
      field. The `setUiFeeFactor` control REFUSES any wallet but the configured
      `PERPS_UI_FEE_RECEIVER` (the call credits `msg.sender`), never silently clamps to the
      ceiling, and the flag-off state ("configured, and charged to nobody") is stated on screen.
      Registered as the `perps-fees` admin view beside Fees, gated `isAdmin || isFeeAdmin` in both
      the nav and the render.
- [x] T061 ~~new registration script~~ — **not needed**: the existing generic
      `scripts/ops/register-fee-service.js` already covers it and `perps.hyperliquid.builder` is in
      the catalog. Verified report-only against Polygon: the service reads
      `NOT REGISTERED (quoteFee reverts ServiceUnknown) — expected cap 10 bps, ConfigOnly`, with
      every other service live at 50 bps. **Registered on Polygon 137 on 2026-08-11**, cap 10 bps /
      ConfigOnly / **rate 0** (tx `0x2ecf8d5f512fb9d43584366da22da1d9027c871d65e9453ad45fbb1c9c6eb747`).
      Nothing is charged on it — Hyperliquid trading is not enabled.
- [x] T062 `scripts/ops/set-gmx-ui-fee-factor.js` — GMX self-registration on Arbitrum. Verified live:
      reads `MAX_UI_FEE_FACTOR = 1e27` (10 bps) from GMX's DataStore, current factor 0, `BPS=5`
      dry-runs to `setUiFeeFactor(5e26)`, and `BPS=11` is refused against the live cap. Refuses to
      send when the signer is not the intended receiver (setUiFeeFactor credits `msg.sender`).
      **Sent on Arbitrum on 2026-08-11**: factor `5e26` = 5 bps of notional, receiver
      `0x52502d049571C7893447b86c4d8B38e6184bF6e1`
      (tx `0x2034f95a10e5ab040bc38f38d9bd393f85f00547ff9b5430b21955d264d772f0`). Configured, and
      **charged to nobody** until `VITE_PERPS_MANAGE_ENABLED` is on.
- [ ] T063 [P] Tests for the ops script's unit conversion and cap enforcement

## Phase 7 — Reporting, docs, polish

- [x] T070 [P] Activity/ledger: position + order events feed the activity source; disclose the
      no-tx-hash gap where a venue provides none. **The producer was missing**: the source drained
      `perpsActivityBuffer` every cycle and no shipped module ever wrote to it, so the whole action
      half of the feed reported silence while its own suite was green (the same defect class as the
      phase-4 `markPrice` one). `usePerpsTrade` now queues the machine's own state — one producer,
      because it is the one write path, so no surface can fail to report and none can report an
      action the machine did not run. The queue is wrapped in a try/catch: a full localStorage must
      never be able to fail a close. `perpsActivity.test.js` asserts the producer EXISTS (comments
      stripped first — an earlier version of that assertion matched the paragraph explaining the
      wiring and survived its own mutation).
- [ ] T071 [P] `frontend/src/legal/` — name leveraged derivatives / perpetual futures (FR-025 gate)
- [ ] T072 [P] Docs: `docs/developer-guide/perps.md` update + `docs/runbooks/perps-operations.md`
- [ ] T073 [P] Cypress: close path against a stubbed venue + honest absence when flag off
- [ ] T074 Actor-critic visual pass on the new sheets → `specs/083-.../screenshots/`
- [ ] T075 Full verification: scoped vitest, gateway tests, lint, `check:deps`; PR

## Dependencies

Phase 2 blocks 3–6. T033 blocks T032. T030 blocks T034/T035/T050. T012 blocks T060–T062.
T071 gates enabling the feature flag, not the merge.

## Notes

- **Exits ship before entries** — no member may hold a position this app created but cannot manage.
- Every venue call is member-direct; `contracts/` is untouched by this feature.

## Known gaps, named rather than left silent

- **GMX collateral depends on `longToken`/`shortToken` being present in `/markets/info`.** The
  normalizer emits a collateral only when the payload names the token AND the token list resolves
  its decimals; anything else yields `collaterals: []`, which makes GMX un-openable and is the
  honest outcome (an amount in unknown units is not an amount). This was NOT verified against the
  live GMX API — the fixture supplies the fields. If the live response omits them, GMX opening will
  be withheld with the venue named, exits are unaffected, and the fix is a normalizer change only.
- **`minNotional` and `venueFeeUsd` are always null in the composed options.** Neither venue
  publishes them on the pairs feed, so the preview shows '—' for the venue's own fee rather than a
  number, and the minimum-size check is not applied client-side (the venue still enforces it, and
  the refusal surfaces through the order state machine with the venue's own reason).
- **9 eslint `react-hooks/set-state-in-effect` warnings** across `components/admin` and the perps
  hooks. Eight pre-date this feature; the ninth is `PerpsFeesPanel.jsx`, which follows the same
  established pattern. Zero errors.
