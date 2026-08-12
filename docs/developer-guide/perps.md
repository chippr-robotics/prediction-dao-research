# Perps — cross-venue perpetual futures (specs 082 + 083)

The **Perps** view inside **Trade** (`/wallet?tab=trade&view=perps`) merges perpetual-futures
market data from three external venues — **Gains Network** (Arbitrum/Base/Polygon), **GMX v2**
(Arbitrum), and **Hyperliquid** (its own L1) — into one searchable insight surface: live price,
hourly funding, open interest, max leverage, plus the connected member's open positions.

- **Phase 0 (spec 082, shipped)** — market data and **read-only** positions; trading happened on
  the venue via **attributed link-outs**.
- **Phase 1 (spec 083, this release)** — **open, close, reduce, protect** (stop-loss /
  take-profit) and **recover stuck orders** on **Gains and GMX**, through bottom sheets.
  Hyperliquid stays read-only. Still **no custody and no contract change**: `contracts/` is
  untouched, and every venue call is **member-direct**.

> **Status — Phase 1 lands in stages, all of it behind `VITE_PERPS_MANAGE_ENABLED` (default off),
> so nothing here is reachable by a member yet and no member is paying the GMX rate.** The two
> on-chain fee-rail transactions are done (below); the foundation modules land before the hooks,
> which land before the sheets, because **exits ship before entries**. **The tables below map the
> whole feature — a row is a design location, not a claim that the file exists yet.**
> `specs/083-perps-position-management/tasks.md` is the record of what has actually landed.

Perpetual futures are **leveraged products on third-party venues**. A position can be liquidated
and lose the entire stake during normal market moves. Nothing in this module makes that safer —
what it does is make the state honest.

## Architecture

| Concern | Where |
|---|---|
| Trade view switcher (Swap \| Perps) | `frontend/src/components/fairwins/TradeSection.jsx` (`?view=` idiom; Swap untouched + default) |
| Venue registry / availability / deep link | `frontend/src/config/perps.js` (`PERP_VENUES`, `perpsAvailable()`, `perpsPath()`) |
| Venue addresses + management capability | `frontend/src/config/perps.js` (`gainsDiamondFor`, `gmxAddressesFor`, `perpsManageVenues`, `perpsManageEnabled`, `perpsManageFeatureEnabled`, `PERPS_UI_FEE_RECEIVER`) |
| Gateway read proxy | `services/relay-gateway/src/perps/` (client / normalize / routes) — `/v1/perps/{pairs,positions,config}`, carrying the venue references a member needs to act on a position |
| SPA client | `frontend/src/lib/perps/perpsClient.js` (soft-fail, `PerpsUnavailable`) |
| Venue calldata | `frontend/src/lib/perps/venues/gains.js`, `venues/gmx.js` against fragment-only ABIs in `frontend/src/abis/perps/` |
| Order state machine | `frontend/src/lib/perps/orderState.js` (one tested module, not per-component logic) |
| Fee units | `frontend/src/lib/perps/feeUnits.js` (bps ↔ GMX factor ↔ HL `f`/percent string) |
| Validation / defaults / venue status / attestation | `frontend/src/lib/perps/{validation,defaults,venueStatus,attestation}.js` |
| Hooks | `usePerpsMarkets` (3-state + per-venue sources), `usePerpsPositions` (60s poll, account hard-reset), `usePerpsTrade` (submit → pending → terminal), `usePerpsOrders` (pending + stuck orders) |
| View + sheets | `frontend/src/components/perps/` (`PerpsView`, `PerpsPairTable`, `PerpsPositions`, `PerpsVenueBadge`, `PositionSheet`, `OpenPositionSheet`, `PerpsPendingOrders`, `PerpsAttestation`, `Perps.css`) |
| Link-outs + attribution | `frontend/src/lib/perps/linkouts.js` (plain-link fallback — attribution never blocks) |
| Fee governance | Two rails, two authorities: FeeRouter `ConfigOnly` **`perps.hyperliquid.builder`** (cap **10 bps**, rate **0**, Polygon) read by the gateway via `fees/onchain.js`; **GMX's own DataStore on Arbitrum** for the UI fee. Admin surface: `frontend/src/components/admin/PerpsFeesPanel.jsx` |
| Activity feed | `frontend/src/data/notifications/sources/perpsSource.js` (snapshot-diff of position sets; outage ≠ change) |
| Ops | `scripts/ops/register-fee-service.js` (HL service), `scripts/ops/set-gmx-ui-fee-factor.js` (GMX rate) |
| Visual harness | `scripts/ui/capture-perps.mjs` (actor-critic loop; shots in `specs/082-perps-trade-view/screenshots/`) |

## The rules that matter

- **Per-venue isolation (FR-004).** Each venue independently resolves `read | degraded`. A
  degraded venue is named in a banner and its pairs are omitted — never rendered as zeros or
  stale-as-live. Bounded serve-stale: a cached value older than 10× TTL degrades instead.
- **Honest numbers (FR-005).** Normalizers preserve `null` for anything a venue did not report;
  formatters are total functions rendering `—`. Scale provenance is documented in
  `services/relay-gateway/src/perps/normalize.js` (verified against the venues' own SDK/APIs).
- **Hyperliquid is non-EVM (FR-012).** String venue id, `chainId: null`, never passed to
  `getContractAddressForChain`/wagmi/`NETWORKS`. Guard: `isEvmPerpVenue()`.
- **Three venue rails, two authorities, none hardcoded.** *Gains* pays a referral rebate out of
  its own fee — the member's price is unchanged — but it **earns nothing until Gains whitelists
  the FairWins referrer and fails silently until then, so claim no Gains revenue anywhere**.
  *GMX* pays a referral share that also **discounts the trader**, and separately collects a **UI
  fee that the member really pays**: 5 bps of notional on **open and close**, whose rate and cap
  live in **GMX's own DataStore**, not our FeeRouter — configured, and **not charged while the
  management flag is off**. *Hyperliquid*'s builder fee is the one platform-priced rate —
  FeeRouter `ConfigOnly`, cap 10 bps, currently **0 and not charged**.
  Disclosed as a named line when non-zero, **no line at zero**, "could not be confirmed" when
  unreadable. Details: [`platform-fees.md`](platform-fees.md#perps-when-the-rate-is-not-ours-to-set).
- **Never stranded (FR-011).** Missing attribution config ⇒ plain venue links. Gateway down ⇒ one
  honest unavailable state. Testnet cohort ⇒ mainnet-only notice (FR-017), no cross-cohort data.
- **Execution surface, member-direct only (supersedes spec-082 FR-018).** Gains and GMX positions
  are managed in-app through sheets; **Hyperliquid stays read-only** with "Manage on venue ↗" and
  a stated reason, never a disabled control (083 FR-021). GMX positions, which spec 082 could not
  read over REST, are now read on-chain via `Reader.getAccountPositions` — absence is still an
  empty array, never a fabricated zero.
- **Value-path independence (FR-016).** The module is optional (`PERPS_ENABLED`, default off ⇒
  503 `perps_unconfigured`); a total outage leaves wagers/pools/transfers untouched.

## Position management (spec 083)

### Member-direct calldata — and why no FairWins contract exists in this path

Both EVM venues assign position ownership from `msg.sender` and expose **no owner parameter**:

- **Gains.** `_openTrade` runs `address sender = _msgSender(); _trade.user = sender;` — the
  caller-supplied `Trade.user` is **overwritten**, collateral is pulled from the caller, and every
  management function resolves the trade as `(_msgSender(), index)`.
- **GMX.** `ExchangeRouter.createOrder` sets `address account = msg.sender` and hashes it into the
  position key `keccak256(account, market, collateralToken, isLong)`. `multicall` is
  `delegatecall`-to-self and **preserves the outer caller**, so batching cannot launder it.

A fee-taking FairWins wrapper would therefore become the **owner of the member's position**, and
the member could never exit. That is why this feature ships **no Solidity**: the router this sprint
was expected to add is a *forbidden pattern*, not a deferred one (research D1). FairWins builds
calldata; the member's wallet signs and **is** the sender.

What follows is structural, not a promise:

- FairWins **never holds member funds on any perps venue, never owns a position, and holds no
  token approval.** Approvals go to the venue — Gains' diamond, GMX's `Router`. The member's wallet
  is the owner and can always exit **directly on the venue**, even if FairWins disappears.
- **`CreateOrderParamsAddresses.receiver` is not ownership** — it only directs payouts. The single
  FairWins address permitted anywhere in venue calldata is `addresses.uiFeeReceiver`; it is never
  `receiver` and never `cancellationReceiver`. A test asserts this over constructed calldata
  (SC-005).
- Hyperliquid's `CoreWriter` precompile is forbidden for the same reason: its order action has no
  owner field, so the calling contract would own the position.
- **Passkey members may open** (FR-020) — on the 4337 rail `msg.sender` is the smart account, so
  the *smart account* owns the position. That is member-controlled, and the confirm step says so.

### The two venue calldata modules

`frontend/src/lib/perps/venues/gains.js` and `venues/gmx.js` encode every call against fragment-only
ABIs in `frontend/src/abis/perps/`. **Exact signatures, struct field order, scales, order types and
addresses live in
[`specs/083-perps-position-management/contracts/venue-calldata.md`](../../specs/083-perps-position-management/contracts/venue-calldata.md)**
— read there rather than duplicating them here, because the scales are where this integration
bites (Gains leverage is 1e3 and prices 1e10, while `collateralAmount` is in the **collateral
token's own decimals**, not 1e18; GMX notional is 1e30). GMX addresses are pinned per chain in
config from the **docs/SDK** set — never from the `gmx-synthetics` repo's `deployments/`, which
disagrees — and re-verified on GMX releases.

### "Sent" is never "executed"

Both venues are asynchronous, **including on the way out**. `frontend/src/lib/perps/orderState.js`
owns the state machine as one tested module, precisely because "report success on inclusion" is the
failure a well-meaning copy-paste reintroduces:

```
idle → validating → screening → [switching chain] → signing → submitted
     → venue_pending
     → executed | rejected(reason) | frozen | timed_out | unknown
```

`submitted` (transaction included / call accepted) and `venue_pending` (the venue has the order)
are **both pending** — "Sent to <venue>", never "opened" or "closed". Only `executed` may change
what the member is told they hold, and it is the first moment a fill price, actual size or
liquidation price exists; everything before it is labelled *requested* or *estimated*. A stalled
UserOp is not success. `frozen` (GMX — nothing auto-clears it) and `timed_out` (Gains — the keeper
never executed) always render with their named recovery control, and `unknown` is a real state,
disclosed with a venue link rather than guessed either way. Venue rejection reasons are surfaced
verbatim; unmapped Gains `CancelReason` values render the numeric reason rather than inventing
text. Because the fee is computed by the venue at execution, a cancelled order carries **no
FairWins fee** — and the sheet says so instead of staying silent. Full table:
[`contracts/order-state-machine.md`](../../specs/083-perps-position-management/contracts/order-state-machine.md).

### Gains has two disjoint index spaces

This is the single most dangerous confusion in the integration:

| Index | Comes from | Consumed by |
|---|---|---|
| **Pending-order index** | `MarketOrderInitiated.orderId.index` | `cancelOrderAfterTimeout` — **only** |
| **Trade index** | `MarketExecuted.index` / `getTrades` | `closeTradeMarket`, `updateTp`, `updateSl`, `updateLeverage`, `de/increasePositionSize` |

Passing one where the other belongs acts on a **different object**. The two must be distinct
branded types that cannot be interchanged, and a test asserts the recovery builder rejects a trade
index.

### The GMX approval trap

**The call target and the approval target are different contracts.** Collateral approvals go to
GMX's **`Router`** (`0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6`), *not* the `ExchangeRouter` you
call. Approving the ExchangeRouter is a classic GMX integration error that succeeds at approval
time and fails only at execution. The approval target is pinned in config with a comment and
asserted in the calldata tests. (Gains is the easy case: call target and approval target are both
the diamond.)

### Restrictions gate entry, never exit

Predict's geoblock can fail open because Polymarket enforces server-side as a backstop. **No such
backstop exists here** — Hyperliquid's API and `app.gmx.io` both answer from restricted regions,
and the Gains/GMX contracts are permissionless. FairWins is the enforcement point, in four layers:

1. **Sanctions** — fail closed, re-screened at submit past the TTL. Arbitrum and Base have no
   `sanctionsGuard` deployment, so screening reads the **Polygon guard as the reference
   deployment**: it is an address list, not chain state.
2. **Jurisdiction + leveraged-derivatives risk** — a versioned, un-pre-ticked attestation
   (`lib/perps/attestation.js`). No geoblock endpoint exists for these venues, and IP geolocation
   would put region logic in the gateway against the no-backend constraint.
3. **Venue operational state** — read live and named. Gains `getTradingActivated()` →
   `ACTIVATED | CLOSE_ONLY | PAUSED`; close-only must read as *"you can close or reduce, not
   open"*.
4. **Account type** — an honest per-account reason, never a disabled or dead control.

**Every one of these gates opening only.** Nothing may stand between a member and closing,
reducing, cancelling or recovering — the Earn rule about standing between a member and money that
is already theirs, applied to a leveraged position. SC-004 makes it testable: **zero** code paths
gate a close, reduce, cancel or recovery on screening, jurisdiction, the killswitch, or the feature
flag.

### Hyperliquid stays read-only

Positions remain visible; management happens on the venue, stated plainly with a link and **no
dead in-app control** (FR-021). Three reasons, and they make "manage-only HL" impossible rather
than merely expensive:

- HL L1 actions sign under a hardcoded `domain.chainId = 1337`, which injected wallets reject — so
  a browser needs an **agent (session) key even to close a position**.
- It requires USDC already bridged to Hyperliquid's own L1.
- There is no documented ERC-1271 path, so passkey members are likely excluded.

Open spikes before HL ships: ERC-1271 for `approveAgent`, the agent-key custody model, and the
builder-eligibility prerequisites (≥100 USDC account value and Standard/Manual account-abstraction
mode — drift out of either and fees silently stop accruing while orders keep succeeding).

### Fees

Perps fees bill on **notional (margin × leverage), not on the amount the member puts in** — at 10×
leverage, 5 bps of notional is about **50 bps of the member's own margin**, and GMX charges on
**open and close**, so a round trip is twice that. Say this plainly wherever a rate appears; it is
the most misunderstandable number in the product.

The GMX rate is read from **GMX's DataStore** (its authority) and the Hyperliquid rate from the
FeeRouter; neither is ever hardcoded, and unit conversion lives in the single module
`lib/perps/feeUnits.js`. The venue computes the fee **at execution**, so a cancelled or frozen
order pays nothing, and GMX early-returns a zero UI fee when `uiFeeReceiver == address(0)` — an
unset receiver is fee-free by construction. An unreadable rate blocks **opening** and never blocks
an exit. With `VITE_PERPS_MANAGE_ENABLED` off, the configured GMX rate is live on-chain but **no
member is being charged it**.

Both venues also charge their **own** fees — spread, opening/closing fees, funding and borrowing.
The FairWins fee is on top of, and separate from, those; never present one as the other. The rails,
the live values, the caps and the disclosure rules are in
[`platform-fees.md`](platform-fees.md#perps-when-the-rate-is-not-ours-to-set) and
[`contracts/fee-rails.md`](../../specs/083-perps-position-management/contracts/fee-rails.md).

### Enabling

`perpsManageFeatureEnabled()` reads `VITE_PERPS_MANAGE_ENABLED` at call time and is **default
off** — so the configured GMX rate is live on-chain while **no member is being charged it**.
FR-025 required the terms and risk disclosures to name leveraged derivatives / perpetual futures
before enablement; that text has now landed (Terms §3 definitions + §4.4 + §10, Risk Disclosure
§6). Re-check it rather than assuming:

```bash
grep -rniE 'leverage|derivativ|perpetual' frontend/src/legal/ | head
```

`perpsManageVenues(chainId)` is a separate **capability** statement (Gains on 42161/8453/137, GMX
on 42161): it says the calldata path exists, not that a member may use it. The remaining
prerequisites before the flag goes on for members are in
[`docs/runbooks/perps-operations.md`](../runbooks/perps-operations.md) §5.

## Configuration (gateway)

See `services/relay-gateway/.env.example` — `PERPS_ENABLED`, per-venue URLs
(`PERPS_GAINS_URL_*` / `PERPS_GMX_URL` / `PERPS_HL_URL`, empty string disables one Gains chain),
cache/quota/killswitch knobs, and PUBLIC attribution ids (`PERPS_GAINS_REFERRER`,
`PERPS_GMX_REF_CODE`, `PERPS_HL_BUILDER_ADDRESS`). `PERPS_HL_BUILDER_FEE_BPS` is the env
FALLBACK for the FeeRouter rate; boot fails loudly above the 10 bps cap. `GET /status` exposes a
`perps` block. No secrets exist in this module.

Phase 1 adds no gateway secrets and no new dependency: venue calldata is built client-side against
ABI fragments with ethers v6 `Interface` (the GMX SDK is BUSL-1.1 and would touch both the lockfile
and the bundle), chain reads go through the existing `getReadProvider` / spec-069 endpoint
resolution, and writes go through the existing `WalletContext.sendCalls` rail selector. The gateway
change is a passthrough: `normalize.js` and `routes.js` carry the venue references (Gains indices,
GMX order keys) the client needs in order to act on a position.

## Tests

- Gateway: `services/relay-gateway/test/perps.test.js` (fixture normalization, merge,
  degradation, quotas, killswitch, boot caps, config source).
- Frontend: `frontend/src/test/perps/` (formatters, client, hooks, view states, link-outs,
  activity source, axe light+dark).
- E2E: `frontend/cypress/e2e/fast/24-perps.cy.js` — default CI world asserts honest absence
  (no gateway ⇒ no tab, deep link falls back to Swap); the full stubbed-gateway flow runs with
  `VITE_RELAYER_URL=… CYPRESS_PERPS_GATEWAY=1`. Phase 1 adds the close path against a stubbed
  venue, plus honest absence with the management flag off.

Four spec-083 suites are **security tests, not unit tests**, and must not be weakened:

1. **Calldata ownership** — no FairWins-controlled address in any ownership field, and
   `uiFeeReceiver` is the only FairWins address in GMX calldata and is never `receiver` (SC-005).
2. **Unit conversion** — both directions, at the venue ceilings (`1e27`, `f = 100`).
3. **State machine** — every terminal transition including `frozen` and `timed_out`, and that **no
   path maps inclusion to `executed`** (SC-002).
4. **Exit reachability** — close, reduce, cancel and recover stay reachable under screening
   failure, jurisdiction refusal, killswitch and feature-flag-off (SC-004).

## Related

- Fees: [`platform-fees.md`](platform-fees.md#perps-when-the-rate-is-not-ours-to-set)
- Operations: [`docs/runbooks/perps-operations.md`](../runbooks/perps-operations.md)
- Member-facing: `docs/user-guide/perps.md`
- Specs: `specs/082-perps-trade-view/` (read-only phase — venue scales, revenue rails, visual
  record) and `specs/083-perps-position-management/`, whose `contracts/` directory holds the exact
  venue calldata, the order state machine, and the fee rails.
