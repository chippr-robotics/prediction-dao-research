# Research: Perps Position Management (Phase 0 decisions)

Decisions D1–D14. Venue facts verified against **live deployed code** (Arbitrum diamond/facet
bytecode, GMX DataStore reads) and the venues' own sources, 2026-08-11. On-chain FeeRouter state
measured directly against Polygon 137 and Arbitrum 42161 the same day.

## D1 — A PerpsRouter contract is FORBIDDEN, not deferred

Both EVM venues assign position ownership from `msg.sender` and expose **no owner parameter**:

- **Gains**: `_openTrade` runs `address sender = _msgSender(); _trade.user = sender;` — the
  caller-supplied `Trade.user` is *overwritten*, and collateral is pulled from `sender`
  (`TradingInteractionsUtils.sol` L657-667, L703-704; live on the Arbitrum diamond
  `0xFF162c69…f169`). Every management function — `closeTradeMarket`, `updateTp`, `updateSl`,
  `updateLeverage`, `increase/decreasePositionSize`, `cancelOrderAfterTimeout` — resolves the trade
  as `(_msgSender(), index)`.
- **GMX**: `ExchangeRouter.createOrder` line 246 is `address account = msg.sender;` followed by
  `order.setAccount(account)`. Ownership is hashed into the position key
  `keccak256(account, market, collateralToken, isLong)`. `multicall` is `delegatecall`-to-self and
  **preserves the outer caller**, so batching cannot launder `msg.sender`.

Therefore a fee-taking wrapper would become the position owner and the member could never exit —
the exact failure `LiquidityRouter`'s header forbids for Across bridge-LP. **This feature ships no
Solidity.**

**`CreateOrderParamsAddresses.receiver` is a trap.** It looks like an owner parameter; it only
directs payouts. Never treat it as ownership.

**Hyperliquid's analogue is worse.** The CoreWriter precompile (`0x3333…3333`) limit-order action
has no owner field and acts "on behalf of its own contract address on HyperCore" — a contract using
it owns the position. Forbidden.

## D2 — Fee rails are venue-native, venue-capped, and charged at execution

| Venue | Rail | Ceiling | Base | Charged when | Authority |
|---|---|---|---|---|---|
| GMX v2 | `uiFeeReceiver` + `setUiFeeFactor` | `MAX_UI_FEE_FACTOR = 1e27` = **10 bps** (measured in DataStore) | `sizeDeltaUsd` (notional), increase **and** decrease | inside `getPositionFees` at execution | GMX DataStore on Arbitrum |
| Hyperliquid | builder codes `{b, f}` | **10 bps** perps (`f ≤ 100` tenths of a bp) | order notional | per fill | member's `approveBuilderFee` ceiling |
| Gains | `_referrer` → `registerPotentialReferrer` | n/a — rebate from Gains' own fees | referred volume | venue-side | Gains gov whitelist |

Three properties make these strictly safer than a wrapper:
1. The venue computes the fee **at execution**, so a cancelled or unfilled order carries no fee.
2. The ceiling is enforced by the venue, not by us.
3. `uiFeeReceiver == address(0)` short-circuits to zero (`PositionPricingUtils.sol:516-528`) —
   byte-identical no-fee behaviour, satisfying the zero-rate rule structurally.

`setUiFeeFactor` sets `account = msg.sender` — **permissionless self-registration**, no GMX
approval needed. Gains' referral is idempotent and never reverts, but **earns nothing until Gains
whitelists the referrer and fails silently** (`!r.active` → early return) — so no revenue is
claimed anywhere in copy until confirmed on-chain.

## D3 — 5 bps of notional, and why 50 bps was the wrong unit

Perps fees are charged on **notional = margin × leverage**, not on capital committed. The
platform's other services charge 50 bps of the capital the member commits.

| Rate on notional | 1× | 5× | 10× | 25× | 50× |
|---|---|---|---|---|---|
| 5 bps (**chosen**) | 5 | 25 | **50** | 125 | 250 |
| 10 bps (venue cap) | 10 | 50 | 100 | 250 | 500 |
| 50 bps | 50 | 250 | 500 | 1250 | **2500 = 25% of margin** |

*(cells are bps of the member's margin; round trip doubles every cell — both venues charge on open
and close.)*

At 10× leverage, **5 bps of notional ≡ 50 bps of margin** — the platform standard expressed in the
unit perps actually uses. For scale, Hyperliquid's own tier-0 taker fee is 4.5 bps of notional, so
5 bps keeps FairWins at ~1.1× the venue's own fee rather than 2.2× (at 10 bps) or 11× (at 50 bps).

## D4 — Fee configuration: one FeeRouter service, one venue-owned rate

- **`perps.hyperliquid.builder`** — already in `scripts/deploy/lib/feeServices.js` (cap 10,
  ConfigOnly) and **registered on zero chains** (measured: `kind = 0` on Polygon, Arbitrum, Base).
  Register on **Polygon 137**, matching the gateway's `FEE_ROUTER_CHAIN_ID` default and the reader
  already wired in `services/relay-gateway/src/fees/onchain.js`. Registration is one-shot and also
  unblocks the admin handoff (`transfer-roles.js` refuses to renounce FeeRouter admin while a known
  service is unregistered).
- **No `perps.gmx.uifee` service.** GMX's rate lives in GMX's DataStore under
  `uiFeeFactorKey(FairWins)` and is applied by GMX. A FeeRouter entry would be a second config store
  for a rate we cannot enforce, and the admin control would silently do nothing — the failure mode
  `feeQuote.js` already documents. Disclosure **reads GMX's DataStore**; changing it is a
  `setUiFeeFactor` transaction on Arbitrum, offered from the admin surface with GMX named as the
  authority (spec-071: authority is read from the contract that enforces).
- **No Gains service.** A venue-paid rebate is not a member cost; registering it would render a fee
  line where none exists.

**Measured live FeeRouter state (2026-08-11):** Polygon 137 has `earn.lend`, `polymarket.taker`,
`stake.lido`, `stake.polygon`, `bridge.transfer`, `liquidity.deposit` all at **50 bps** under 250
bps caps with a treasury set — the "50 bps standard" is real. Arbitrum 42161 has the same seven
services registered at **0 bps** with a different treasury.

## D5 — Unit conversion is the highest-risk arithmetic in the feature

Four units, one module (`frontend/src/lib/perps/feeUnits.js`), unit-tested in both directions:

| From | To | Conversion | Guard |
|---|---|---|---|
| FeeRouter bps | Hyperliquid `f` | `bps × 10` (tenths of a bp) | cap 100 |
| FeeRouter bps | HL `maxFeeRate` string | `"<bps/100>%"` — **the `%` sign is required** | — |
| FeeRouter bps | GMX `uiFeeFactor` | `bps × 1e26` (10 bps = 1e27 against `FLOAT_PRECISION = 1e30`) | cap 1e27 |
| notional + bps | money | `notional × bps / 10_000` | floor, member's favour |

A single missing ×10 here is a 10× overcharge that the venue would happily enforce.

## D6 — There is no EIP-5792 batching in this app

`wallet_sendCalls` / `useSendCalls` / `useCapabilities` return **zero hits** across `frontend/src`
and `services/`. `WalletContext.sendCalls` is a **rail selector**: atomic on the passkey/4337 path,
and a sequential `signer.sendTransaction` loop for classic EOAs — `submitAsActiveAccount.js:51-56`
states it outright ("An EOA cannot atomically batch").

Consequences: a "charge a fee + call the venue" batch would be non-atomic for every EOA member, and
would charge at *submission* for an order the venue can cancel ~60s later. This is a second,
independent reason the venue-native rails (D2) are correct.

Approval legs still work — they are simply separate transactions on the EOA rail, exactly as Earn
does today.

## D7 — The honest async state machine

Inclusion is not execution on either venue, and **closing is async too**.

```
idle → validating → screening → [switching chain] → signing → submitted
     → venue_pending          (the venue has the order; nothing has changed yet)
     → executed | rejected(reason) | frozen | timed_out(recoverable) | unknown
```

**Gains.** Inclusion emits `MarketOrderInitiated(orderId{user,index}, trader, pairIndex, open)` →
"order sent". Terminal: `MarketExecuted` (the first point real fill price, size and liquidation
price exist) or `MarketOpenCanceled(…, cancelReason, collateralReturned)`. `CancelReason` decodes
to member-facing text: SLIPPAGE=3, EXPOSURE_LIMITS=6, PRICE_IMPACT=7, MAX_LEVERAGE=8, NOT_HIT=11,
LIQ_REACHED=12. After `marketOrdersTimeoutBlocks` (measured: 200 Arbitrum, 30 Polygon, 30 Base
≈ 60s) offer `cancelOrderAfterTimeout`.

> **Two index spaces.** `cancelOrderAfterTimeout` takes the **pending-order** index from
> `MarketOrderInitiated.orderId.index`. `closeTradeMarket` / `updateTp` / `updateSl` take the
> **trade** index from `MarketExecuted.index`. Passing one where the other belongs acts on the
> wrong object. This is the single most dangerous confusion in the Gains integration.

**GMX.** All events arrive from one `EventEmitter` as `EventLog2`, `topic1 = order key`,
`topic2 = Cast.toBytes32(account)`. `OrderCreated` → "order sent". Terminal: `OrderExecuted`,
`OrderCancelled`, or **`OrderFrozen`** — a state no existing sheet models and which nothing
auto-clears (`REQUEST_EXPIRATION_TIME = 300s`, measured, does not free it). Frozen renders as
"needs your attention" with `cancelOrder(key)` offered by name. Market orders cancel on failure
(collateral → `cancellationReceiver`, defaulting to the member); `ExchangeRouter.cancelOrder` is
owner-gated to `order.account() == msg.sender`, so **only the member can, and always can**.

**Approval targets differ from call targets.** Gains: approve the diamond. GMX: approve GMX's
`Router` (`0x7452c558…`), **not** ExchangeRouter — a classic integration error that fails only at
execution.

## D8 — What the UI must never claim

- "Position opened/closed" on transaction inclusion, on a 200 response, or on a UserOp hash.
- Success for a UserOp in `stalled` state (an existing sheet does this — do not copy it).
- A fill price, size, P&L or liquidation price before execution — pre-execution values are labelled
  requested/estimated.
- "Rejected" without the venue's reason when one exists.
- That a fee was charged on a cancelled order — under D2 it was not, and we say so.
- Silence about a timed-out order — the recovery control is named and offered.

## D9 — Restrictions: FairWins is the enforcement point

Predict's geoblock may fail **open** because Polymarket's CLOB enforces server-side as a backstop.
**No such backstop exists here** — measured: Hyperliquid's API and `app.gmx.io` both answer 200 from
restricted regions, and the Gains/GMX contracts are permissionless with no on-chain gate.

Four layers:

1. **Sanctions — fail-closed, opens only.** Re-screen at submit past the TTL (the Earn Supply
   precedent): `restricted` refuses, `uncertain` allows. `sanctionsGuard` is deployed on
   Polygon/Amoy/Mordor only — Arbitrum and Base have none, and Arbitrum's LiquidityRouter runs with
   `sanctionsGuard = 0x0` (measured). Screen against the **Polygon guard as the reference
   deployment**: it is an address list, not chain state.
2. **Jurisdiction + leverage risk — fail-closed, opens only, by attestation.** No geoblock endpoint
   exists for these venues, and IP geolocation would be the gateway's first region logic against
   the no-backend constraint. Use a versioned, un-pre-ticked attestation modelled on the existing
   entry-gate acknowledgement.
3. **Venue operational state — read live, degrade by name.** Gains `getTradingActivated()` →
   ACTIVATED / CLOSE_ONLY / PAUSED; close-only must read "you can close or reduce, not open".
4. **Account type — honest refusal, never a dead button.**

**Every one of these gates opening only.** Nothing may stand between a member and closing,
reducing, cancelling, or recovering — the Earn FR-033 rule ("standing between a member and money
that is already theirs") applies with more force to a leveraged position.

## D10 — Legal prerequisite

`frontend/src/legal/` contains **zero** occurrences of `leverage|derivativ|perpetual`. Terms and
Schedule A must name perpetual futures / leveraged derivatives before execution is enabled. This is
a gate, not a follow-up.

## D11 — Passkey members may open, with disclosure

On the ERC-4337 rail `msg.sender` is the smart account, so the smart account owns the position.
That is member-controlled, but FairWins is currently the only client that can drive it. Product
decision: **allow, and disclose plainly at confirm time.** Revisit when a member can drive their
account from another client.

## D12 — Hyperliquid is a fast-follow, and why it is all-or-nothing

HL L1 actions sign under a hardcoded `domain.chainId = 1337`, which injected wallets reject, so a
browser needs an **agent (API) wallet** — a client-side session key — *even to close a position*.
It also requires USDC already bridged to HL's own L1, and there is no documented ERC-1271 path, so
passkey members are likely excluded. There is no cheap "manage-only HL". It keeps spec-082's
read-only positions plus an honest "manage on the venue" link.

Open spikes before HL ships: ERC-1271 support for `approveAgent`; the agent-key custody model
(session-memory vs at-rest encryption); and the builder-eligibility prerequisites (≥100 USDC
account value and Standard/Manual account-abstraction mode — drift out of either and fees silently
stop accruing while orders keep succeeding).

## D13 — Address resolution and dependency posture

GMX's `ExchangeRouter` is redeployed across releases and two routers currently hold
CONTROLLER+ROUTER_PLUGIN, so a role check does not discriminate. Pin addresses in config, resolve
per chain, and re-verify on GMX releases. Build calldata against the ABI rather than taking a
dependency on the GMX SDK (which is BUSL-1.1 until its Change Date) — this also keeps the bundle
and the lockfile untouched.

## D14 — Testing strategy

- **Calldata tests are the security tests.** For every constructed venue call, assert no
  FairWins-controlled address appears in any ownership field, and that `uiFeeReceiver` is the only
  FairWins address in GMX calldata and is never `receiver`.
- **Unit conversion** tested in both directions with the venue ceilings as boundaries.
- **State machine** tested for every terminal transition including frozen and timed-out, and that
  no path reports success on inclusion.
- **Restriction tests** assert exits are reachable under screening failure, jurisdiction refusal,
  killswitch, and feature-flag-off.
- **Sheets** tested for states, validation-before-prompt, fee disclosure presence/absence, and axe
  in both themes.
- **E2E** covers the close path against a stubbed venue, and honest absence when the feature is off.
- **Visual** review via the existing capture harness, extended with the new sheets.
