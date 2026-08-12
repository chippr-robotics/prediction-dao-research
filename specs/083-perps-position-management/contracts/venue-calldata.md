# Contract: venue calldata (spec 083)

Every call below is **member-direct**: the member's own wallet is `msg.sender`. FairWins builds
calldata and nothing else. Verified against live deployed code 2026-08-11.

> **THE INVARIANT.** No FairWins-controlled address may appear in any ownership field. On Gains
> there is no such field to fill — ownership is `_msgSender()`. On GMX the only FairWins address in
> calldata is `addresses.uiFeeReceiver`, and it is **never** `addresses.receiver` or
> `addresses.cancellationReceiver`. A test asserts this over constructed calldata (SC-005).

---

## Gains Network (gTrade v10)

**Call target and approval target are the same contract**: the `GNSMultiCollatDiamond`.

| Chain | Diamond |
|---|---|
| Arbitrum 42161 | `0xFF162c694eAA571f685030649814282eA457f169` |
| Base 8453 | `0x6cD5aC19a07518A8092eEFfDA4f1174C72704eeb` |
| Polygon 137 | resolve from docs.gains.trade before enabling; do not guess |

### Opening

```
openTrade(
  (address,uint32,uint16,uint24,bool,bool,uint8,uint8,uint120,uint64,uint64,uint64,bool,uint160,uint24),
  uint16 _maxSlippageP,
  address _referrer
)                                                                       // selector 0x5bfcc4f8
```

`ITradingStorage.Trade` in ABI field order:

| # | Field | Type | Scale / meaning |
|---|---|---|---|
| 0 | `user` | address | **OVERWRITTEN** to `_msgSender()` — pass the member, never FairWins |
| 1 | `index` | uint32 | **OVERWRITTEN** to 0 |
| 2 | `pairIndex` | uint16 | index into `pairs` |
| 3 | `leverage` | uint24 | **1e3** (10× = `10_000`) |
| 4 | `long` | bool | |
| 5 | `isOpen` | bool | |
| 6 | `collateralIndex` | uint8 | **1-based** |
| 7 | `tradeType` | uint8 | 0 = TRADE, 1 = LIMIT, 2 = STOP |
| 8 | `collateralAmount` | uint120 | **the collateral token's own decimals** (USDC = 1e6) |
| 9 | `openPrice` | uint64 | **1e10** |
| 10 | `tp` | uint64 | **1e10**, 0 = none |
| 11 | `sl` | uint64 | **1e10**, 0 = none |
| 12 | `isCounterTrade` | bool | |
| 13 | `positionSizeToken` | uint160 | **OVERWRITTEN** to 0 |
| 14 | `__placeholder` | uint24 | 0 |

> **SCALING TRAP.** `collateralAmount` is in the collateral token's decimals, **not 1e18**. The v9
> source comment said `1e18`; live v10 says "collateral precision". Resolve it from
> `getCollateral(uint8)` → `(address collateral, bool isActive, uint88, uint128 precision, uint128 precisionDelta)`.

> **STRUCT-SHAPE TRAP.** v9's trailing `uint192 __placeholder` was split in v10 into
> `bool isCounterTrade; uint160 positionSizeToken; uint24 __placeholder`. A v9 ABI mis-encodes.

`_maxSlippageP` is 1e3-scaled (1% = `1_000`). `_referrer` is FairWins' referrer address;
`registerPotentialReferrer` is idempotent and never reverts.

### Managing

```
closeTradeMarket(uint32 _index, uint64 _expectedPrice)                  // selector 0x36ce736b
decreasePositionSize(uint32 _index, uint120 _collateralDelta, uint24 _leverageDelta, uint64 _expectedPrice)
increasePositionSize(uint32 _index, uint120 _collateralDelta, uint24 _leverageDelta, uint64 _expectedPrice, uint16 _maxSlippageP)
updateTp(uint32 _index, uint64 _newTp)
updateSl(uint32 _index, uint64 _newSl)
updateLeverage(uint32 _index, uint24 _newLeverage)
updateMaxClosingSlippageP(uint32 _index, uint16 _maxSlippageP)
cancelOrderAfterTimeout(uint32 _orderIndex)
multicall(bytes[] data) returns (bytes[])
```

`closeTradeMarket` carries **no slippage parameter** — closing slippage is stored per-trade. To
close with an explicit tolerance, pair the two calls in one diamond `multicall`, as the venue's own
SDK does:

```
multicall([ updateMaxClosingSlippageP(index, maxSlippageP), closeTradeMarket(index, expectedPrice) ])
```

Default closing slippage in the venue SDK is `1 * 1e3` (1%).

> ### THE INDEX TRAP — the most dangerous confusion in this integration
>
> There are **two disjoint index spaces**:
>
> - **Pending-order index** — from `MarketOrderInitiated.orderId.index`. Consumed **only** by
>   `cancelOrderAfterTimeout`.
> - **Trade index** — from `MarketExecuted.index` / `getTrades`. Consumed by `closeTradeMarket`,
>   `updateTp`, `updateSl`, `updateLeverage`, `de/increasePositionSize`.
>
> Passing one where the other belongs acts on a **different object**. Implementation MUST use two
> distinct branded types that cannot be interchanged, and tests MUST assert the recovery builder
> rejects a trade index.

`cancelOrderAfterTimeout` reverts `WaitTimeout()` before
`createdBlock + getMarketOrdersTimeoutBlocks()` (measured: **200** Arbitrum, **30** Polygon, **30**
Base ≈ 60s), `NoOrder()` if already closed, `WrongOrderType()` for non-market orders. It refunds
only MARKET_OPEN, MARKET_PARTIAL_OPEN and UPDATE_LEVERAGE-decrease, emitting
`CollateralReturnedAfterTimeout(orderId, collateralIndex, trader, collateralAmount)`.

### Reading

`getTrades(address)`, `getTradeInfos(address)`, `getTrade(address,uint32)`,
`getPendingOrders(address)`, `getCollaterals()`, `getCollateral(uint8)`,
`getMarketOrdersTimeoutBlocks()` (`0xa4bdee80`), `getTradingActivated()` →
`ACTIVATED | CLOSE_ONLY | PAUSED`.

Opens revert `Paused()` unless ACTIVATED; closes are permitted unless PAUSED.

---

## GMX v2 (Arbitrum 42161 only)

| Role | Address | Note |
|---|---|---|
| ExchangeRouter | `0x7dE39FF2e232A2203196788d37e234cF8F1b83f1` | **docs + SDK**; the repo's `deployments/` disagrees — do not source from the repo |
| **Router (approve target)** | `0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6` | **approvals go here, NOT ExchangeRouter** |
| Reader | `0xfA26cBb46e2614609406de08CA1Dc7f70a684184` | |
| DataStore | `0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8` | stable |
| OrderVault | `0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5` | `sendTokens`/`sendWnt` recipient |
| EventEmitter | `0xC8ee91A54287DB53897056e12D9819156D3822Fb` | all order events |
| ReferralStorage | `0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d` | |

> **A RoleStore freshness check does not discriminate.** Both the docs/SDK router and the repo
> router currently hold CONTROLLER + ROUTER_PLUGIN. Four historical routers still have code but hold
> neither. Pin the docs/SDK address in config and re-verify on GMX releases.

### Opening (market increase)

One `multicall` of three encoded calls, `value` = execution fee:

```
sendWnt(address receiver = OrderVault, uint256 amount = executionFee)          // payable
sendTokens(address token, address receiver = OrderVault, uint256 amount)       // collateral
createOrder(CreateOrderParams params)                                          // payable, returns bytes32 key
```

```solidity
struct CreateOrderParams {
  CreateOrderParamsAddresses addresses;
  CreateOrderParamsNumbers   numbers;
  Order.OrderType            orderType;
  Order.DecreasePositionSwapType decreasePositionSwapType;
  bool isLong; bool shouldUnwrapNativeToken; bool autoCancel;
  bytes32 referralCode; bytes32[] dataList;
}
struct CreateOrderParamsAddresses {
  address receiver;             // MEMBER — payout target, NOT ownership
  address cancellationReceiver;  // MEMBER or 0 (defaults to account)
  address callbackContract;      // 0
  address uiFeeReceiver;         // ← the ONLY FairWins address in this calldata
  address market;
  address initialCollateralToken;
  address[] swapPath;            // []
}
struct CreateOrderParamsNumbers {
  uint256 sizeDeltaUsd;                 // 1e30 notional
  uint256 initialCollateralDeltaAmount; // token decimals
  uint256 triggerPrice;                 // 1e30, 0 for market
  uint256 acceptablePrice;              // 1e30 slippage bound
  uint256 executionFee;                 // wei, must equal the sendWnt amount
  uint256 callbackGasLimit;             // 0
  uint256 minOutputAmount;              // 0 for increase
  uint256 validFromTime;                // 0
}
```

`OrderType`: `2 = MarketIncrease`, `4 = MarketDecrease`, `5 = LimitDecrease` (take-profit),
`6 = StopLossDecrease` (stop-loss).

> **`receiver` is NOT ownership.** Ownership is `msg.sender` of `createOrder`
> (`ExchangeRouter.sol:246`, `address account = msg.sender;`) and is hashed into the position key
> `keccak256(account, market, collateralToken, isLong)`. `multicall` is `delegatecall`-to-self and
> **preserves the outer caller**, so batching cannot change this.

If `initialCollateralToken == WNT`, the execution fee is taken from the same transfer; otherwise a
separate `sendWnt` must cover it or `createOrder` reverts `InsufficientWntAmountForExecutionFee`.

Execution fee ≈ `ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1 + ESTIMATED_GAS_FEE_PER_ORACLE_PRICE ×
oraclePriceCount + applyFactor(estimatedGasLimit, ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR)`, with
`oraclePriceCount = 3 + swapPath.length`. **Overpaying is safe** — `payExecutionFee` refunds the
remainder and emits `ExecutionFeeRefund`.

### Closing / reducing

The same `createOrder` with `orderType = MarketDecrease (4)`. **No `sendTokens`** — only `sendWnt`
for the execution fee. `sizeDeltaUsd` is the notional to close (full close = `position.sizeInUsd`);
`initialCollateralDeltaAmount` is collateral to withdraw. Proceeds go to `addresses.receiver`.

### Protection

Take-profit = `LimitDecrease (5)` with `triggerPrice`; stop-loss = `StopLossDecrease (6)` with
`triggerPrice`. Set `autoCancel = true` so the order dies with the position rather than lingering
as stale exposure.

### Recovery

```
cancelOrder(bytes32 key)   payable   // owner-gated: reverts unless order.account() == msg.sender
updateOrder(bytes32 key, uint256 sizeDeltaUsd, uint256 acceptablePrice, uint256 triggerPrice,
            uint256 minOutputAmount, uint256 validFromTime, bool autoCancel)   payable
```

Market orders **cancel** on failed execution (collateral → `cancellationReceiver`, defaulting to
the account). Limit/trigger orders **freeze** and stay frozen — `REQUEST_EXPIRATION_TIME` (300s)
does not free them. Only `cancelOrder`/`updateOrder` resolve a frozen order, and only the owner may
call them.

### Reading

`Reader.getAccountPositions(DataStore, address account, uint256 start, uint256 end)` → `Position.Props[]`
(selector `0x77cfb162`; returns a clean empty array for an account with no positions — absence is
not an error). `Reader.getAccountPositionInfoList(...)` returns enriched info but **the caller must
supply market prices** — the Reader does not fetch them.

### Events

All order events come from the single `EventEmitter`:

```
EventLog2(address msgSender, string eventName, string indexed eventNameHash,
          bytes32 indexed topic1, bytes32 indexed topic2, EventLogData eventData)
```

`topic1` = order key, `topic2` = `Cast.toBytes32(account)` — filter by address-padded topic2.
Event names: `OrderCreated`, `OrderExecuted`, `OrderUpdated`, `OrderCancelled`, `OrderFrozen`,
`OrderSizeDeltaAutoUpdated`, `OrderCollateralDeltaAmountAutoUpdated`.

---

## Forbidden patterns (assert in tests)

1. Any FairWins address as Gains `Trade.user`, GMX `addresses.receiver`, or
   `addresses.cancellationReceiver`.
2. Any FairWins contract calling `openTrade` or `createOrder` — it would own the position.
3. Approving a FairWins address for perps collateral. Gains → the diamond; GMX → GMX's **Router**.
4. Using Hyperliquid's `CoreWriter` precompile (`0x3333…3333`) — its order action has no owner
   field and the contract owns the resulting position.
5. Sourcing GMX addresses from the `gmx-synthetics` repo `deployments/` directory.
6. Passing a trade index to `cancelOrderAfterTimeout`, or a pending-order index to any trade call.
