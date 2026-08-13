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
- [x] T063 [P] Tests for the ops script's unit conversion and cap enforcement —
      `test/perps/gmxUiFee.test.js` (29 cases, mocha/chai like the other script tests, discovered by
      plain `npm test`). The script's decision logic moved to `scripts/ops/lib/gmxUiFee.js` so it can
      be tested with no network, following the `scripts/deploy/lib/*` convention that
      `test/staking/feeServices.test.js` and `test/tenants/tenantDeployHelpers.test.js` already use.
      **The live reads deliberately stay in the script**: it reads `MAX_UI_FEE_FACTOR` from GMX
      rather than assuming 10 bps, and a test must not make that assumption on GMX's behalf — so
      what is tested is what the script DOES with whatever cap GMX reports, including a tightened
      cap (5 bps starts failing) and a loosened one (11 bps starts passing).
      Covered: the 1e30/1e26 conversion (round-trip, and the order-of-magnitude slip that would
      charge 10× too much or too little while sending successfully); the DataStore keys, pinned to
      their digests and asserted to be `abi.encode` not `encodePacked` (a wrong key reads 0, which
      looks exactly like "no fee configured"); Arbitrum-only chain scope (43114 Avalanche, where GMX
      also runs, is refused); BPS parsing; cap refusal that **never clamps**; the receiver check; and
      the post-send verification. Mutation-checked — a 1e25 precision fails 7, disabling the cap
      check fails 4, disabling the receiver check fails 1.
      **One behaviour change, deliberate**: a BLANK `BPS=` used to mean zero (`Number("")` is 0 in
      JavaScript), so a stale empty env var would have turned the fee OFF with no error. It is now
      refused with the same message any other non-integer gets. Every documented invocation is
      unchanged. Re-verified live against Arbitrum after the restructure: report-only prints
      `MAX_UI_FEE_FACTOR = 1e27` (10 bps) and the live factor `5e26` (5 bps) and sends nothing;
      `BPS=5 DRY_RUN=true` prints the same call as before; `BPS=11` is refused against the live cap.

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
- [x] T071 [P] `frontend/src/legal/` — name leveraged derivatives / perpetual futures (FR-025 gate).
      Landed in `risk-disclosure.md` (§6 "Leveraged-Derivatives (Perpetual Futures) Risk", plus the
      summary bullet) and `terms.md` (defined terms for *Perpetual Future* / *Leveraged Derivative* /
      *Notional*; §4.3 fee disclosure; §4.4 and §10 on third-party venues; §10.7 leverage risk;
      §10.8 eligibility; the Schedule A caveat). Verified 2026-08-12: 21 lines across the two
      documents name leverage / derivatives / perpetual futures. The fee is described in the same
      units the code sets it in — 5 bps of **notional**, both on open and on close, "about 50 basis
      points of your own margin at 10× leverage" — which is the number `set-gmx-ui-fee-factor.js`
      writes on-chain, and is why T063 asserts that conversion.
- [x] T072 [P] Docs: `docs/developer-guide/perps.md` update + `docs/runbooks/perps-operations.md`.
      Verified 2026-08-12 — both exist and cover 083, not just 082: the developer guide carries the
      member-direct calldata rule, the two venue modules, "sent is never executed", the two Gains
      index spaces, the GMX approval trap, exits-never-gated, and the four suites that are security
      tests; the runbook carries the live rail table, the `set-gmx-ui-fee-factor.js` procedure and
      its signer-is-the-receiver warning, GMX revenue claiming, the Hyperliquid rate, the Gains
      referral, and enabling/disabling the surface. Member guide `docs/user-guide/perps.md` and the
      release note `docs/blog/posts/36-perps-position-management/` shipped alongside.
- [x] T073 [P] Cypress: close path against a stubbed venue + honest absence when flag off
- [x] T074 Actor-critic visual pass on the new sheets → `specs/083-.../screenshots/`
- [x] T075 Full verification: scoped vitest, gateway tests, lint, `check:deps`; PR — **merged
      2026-08-12 as PR #1153** (merge commit `efcfef33`), 940 frontend perps tests and 275 gateway
      tests green. T063 was completed after the merge, on `claude/perps-083-completion`; its suite
      runs under plain `npm test` (hardhat discovers `test/perps/`). Note for anyone re-running the
      frontend suite later: `scripts/` and `test/` have **no eslint config** — only `frontend/` is
      linted — so an ops-script change has no lint gate of its own and its tests are the gate.

## Dependencies

Phase 2 blocks 3–6. T033 blocks T032. T030 blocks T034/T035/T050. T012 blocks T060–T062.
T071 gates enabling the feature flag, not the merge.

## Notes

- **Exits ship before entries** — no member may hold a position this app created but cannot manage.
- Every venue call is member-direct; `contracts/` is untouched by this feature.

## Known gaps, named rather than left silent

- **GMX collateral depends on `longToken`/`shortToken` being present in `/markets/info` — VERIFIED
  LIVE 2026-08-12.** `https://arbitrum-api.gmxinfra.io/markets/info` returned **132 markets, and all
  132 carry both `longToken` and `shortToken`** (0 missing either). The fixture matches the live
  shape, and the dependency this note previously flagged as unverified is now measured.
  The fallback is unchanged and remains the safety net, not a formality: the normalizer emits a
  collateral only when the payload names the token AND the token list resolves its decimals;
  anything else yields `collaterals: []`, which withholds GMX **opening** with the venue named, and
  is the honest outcome — an amount in unknown units is not an amount. **Exits are unaffected in
  every case** (closing needs no collateral list), and if GMX ever changes the payload the fix is a
  normalizer change only. Re-measure if GMX versions the endpoint; one API response is a fact about
  one day, not a guarantee.
- ~~**`minNotional` and `venueFeeUsd` are always null in the composed options.**~~ **CLOSED.** The
  pairs feed now publishes `venueFee` (a RATE, not an amount — the fee is a fraction of position
  size, so a per-pair dollar figure would be right for one size and wrong for every other) plus
  `minCollateralUsd`, and both sheets render the venue's own fee in money beside FairWins'.
  Two things the investigation changed about the gap as it was written:
  - **Gains has no minimum notional to publish.** `minPositionSizeUsd` is a **fee floor**, not a
    minimum size — gTrade v9 removed `BelowMinPositionSizeUsd` and replaced it with
    `InsufficientCollateral` (collateral ≥ 5× the pair's minimum fee). Emitting $285.72 as
    `minNotional` would have refused a $100 BTC position the venue fills happily. `minNotional`
    stays `null`; the bound that exists is `minCollateralUsd`, and it is what the sheet refuses on
    before the wallet prompt. The floor is *disclosed* instead: under it the member pays the fee of
    a floor-sized position (0.2% effective against a headline 0.035%), and the sheet says so.
  - **GMX still shows '—', and that is the honest answer.** Its position-fee factors and minimums
    are in the DataStore, not in `/markets/info` (verified live). The fields are emitted as `null`
    with the venue named, rather than filled from documentation the deployed contract may have
    moved. Closing it would take a client-side DataStore read beside `readExecutionFee`.
- **9 eslint `react-hooks/set-state-in-effect` warnings** across `components/admin` and the perps
  hooks. Eight pre-date this feature; the ninth is `PerpsFeesPanel.jsx`, which follows the same
  established pattern. Zero errors.
- **The perps sheets do not contain keyboard focus — and neither do eight other dialogs. This
  PREDATES the feature and is deliberately NOT fixed here.** `PositionSheet` and
  `OpenPositionSheet` render `role="dialog" aria-modal="true"` and let Tab walk out of the sheet
  into the page behind it. They were built to match the repo's detail-sheet family
  (`AssetDetailSheet`, `VaultSheet`, `SupplySheet`, `StakeSheet`, `StatementSheet`,
  `CollectibleDetailSheet`, `AppSheet`, `MarketDetailSheet`), which all behave the same way, so
  spec 083 inherited the gap rather than creating it. Note the repo is **not** uniform on this:
  `components/account/ActionSheet.jsx` — also a bottom sheet — does trap Tab, as do `EntryGate`,
  `ConnectModal`, `RequestQRModal` and `SetTimeModal`; those five contain focus but do not restore
  it on close, while the sheet family restores it but does not contain it. Fixing only the two
  perps sheets would deepen that split, and an inconsistency is not an improvement. The full
  survey, the success criteria it engages (**WCAG 2.4.3**, **4.1.2**, and **2.4.11** — not 2.1.2,
  which forbids the opposite), why the `*.axe.test.jsx` suites cannot catch it, and the shape of a
  single repo-wide fix are written up in
  [`docs/developer-guide/dialog-focus-management.md`](../../docs/developer-guide/dialog-focus-management.md).
  That document is the issue-ready version; it is linked from `docs/developer-guide/frontend.md`.
