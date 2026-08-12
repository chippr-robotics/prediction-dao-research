# Tasks: Perps Position Management

**Input**: plan.md, research.md, contracts/{venue-calldata,order-state-machine,fee-rails}.md
**Format**: `[ID] [P?] [Story] Description` — [P] = parallelizable

## Phase 1 — Setup

- [x] T001 Spec artifacts (spec/plan/research/contracts/tasks)

## Phase 2 — Foundations (blocking, pure logic, no UI)

- [ ] T010 [P] `abis/perps/{gainsDiamond,gmxExchangeRouter,gmxReader,gmxDataStore}.js` — hand-maintained
      fragments only, exactly the functions/events in contracts/venue-calldata.md
- [ ] T011 [P] `config/perps.js` — venue addresses per chain (Gains diamond, GMX ExchangeRouter /
      **Router approval target** / Reader / DataStore / OrderVault / EventEmitter), `PERPS_MANAGE_*`
      capability flags (HL management OFF), attestation version
- [ ] T012 `lib/perps/feeUnits.js` — bps ↔ GMX factor ↔ HL f ↔ HL maxFeeRate string + notional money
- [ ] T013 `lib/perps/venues/gains.js` — Trade struct encode (collateral-precision + 1e10 + 1e3
      scales), open/close/reduce/updateTp/updateSl/multicall-with-slippage/cancelOrderAfterTimeout;
      **branded PendingOrderIndex vs TradeIndex types**; event decoders + CancelReason map
- [ ] T014 `lib/perps/venues/gmx.js` — CreateOrderParams encode for MarketIncrease/MarketDecrease/
      LimitDecrease/StopLossDecrease, sendWnt+sendTokens+createOrder multicall, cancelOrder/
      updateOrder, Reader position decode, EventLog2 topic filtering, execution-fee estimate
- [ ] T015 `lib/perps/orderState.js` — the state machine per contracts/order-state-machine.md
- [ ] T016 [P] `lib/perps/validation.js` — refuse-before-prompt validators (balance, venue limits,
      leverage bounds, stop beyond liquidation, min size)
- [ ] T017 [P] `lib/perps/defaults.js` — smart defaults (venue choice + reason, leverage, collateral
      from holdings, direction, slippage, suggested SL/TP)
- [ ] T018 [P] `lib/perps/venueStatus.js` — live `getTradingActivated()` + GMX availability
- [ ] T019 [P] `lib/perps/attestation.js` — versioned jurisdiction + leverage-risk record
- [ ] T020 [P] Tests for T012–T019 incl. **calldata ownership assertions** and index-space rejection

## Phase 3 — US1/US4 Exit first (P1)

- [ ] T030 `hooks/usePerpsTrade.js` — submit → pending → terminal, injectable deps
- [ ] T031 `hooks/usePerpsOrders.js` — pending + stuck orders per venue
- [ ] T032 `usePerpsPositions.js` [MODIFY] — carry venue refs; add GMX Reader reads on Arbitrum
- [ ] T033 gateway `perps/normalize.js` + `routes.js` [MODIFY] — carry Gains trade/pending indices
- [ ] T034 `components/perps/PositionSheet.jsx` — bottom sheet: close / reduce, cost breakdown,
      async state, venue reasons
- [ ] T035 `components/perps/PerpsPendingOrders.jsx` — stuck-order recovery, never gated
- [ ] T036 [P] Tests: sheet states, close/reduce calldata, recovery, exits-never-gated

## Phase 4 — US2 Protection (P1)

- [ ] T040 Stop-loss / take-profit within PositionSheet (Gains updateTp/updateSl; GMX
      StopLossDecrease/LimitDecrease with `autoCancel`)
- [ ] T041 [P] Tests: defaults, liquidation-bound refusal, venue-stored values reflected

## Phase 5 — US3 Entry (P2)

- [ ] T050 `components/perps/OpenPositionSheet.jsx` — smart defaults, preview, fee disclosure
- [ ] T051 `components/perps/PerpsAttestation.jsx` + screening gate on opens only
- [ ] T052 Passkey disclosure (smart account owns the position)
- [ ] T053 [P] Tests: defaults, validation-before-prompt, disclosure present/absent, attestation gate

## Phase 6 — US5 Administration + ops (P3)

- [ ] T060 `components/admin/PerpsFeesPanel.jsx` — both rails, authority named, GMX rate read from
      DataStore with a `setUiFeeFactor` control; HL from FeeRouter
- [ ] T061 `scripts/ops/register-perps-fee-service.js` — one-shot Polygon registration (DRY_RUN)
- [ ] T062 `scripts/ops/set-gmx-ui-fee-factor.js` — GMX self-registration on Arbitrum (DRY_RUN)
- [ ] T063 [P] Tests for the ops scripts' dry-run output and cap enforcement

## Phase 7 — Reporting, docs, polish

- [ ] T070 [P] Activity/ledger: position + order events feed the activity source; disclose the
      no-tx-hash gap where a venue provides none
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
