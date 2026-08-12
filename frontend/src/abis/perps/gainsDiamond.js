/**
 * Gains Network gTrade v10 — `GNSMultiCollatDiamond` ABI subset (spec 083).
 *
 * Hand-maintained human-readable fragments, ethers v6. There is no dependency on the Gains SDK
 * (research D13): the fragments below were transcribed from the v10 interfaces and every selector
 * and topic hash was checked against the deployed Arbitrum diamond
 * (`0xFF162c694eAA571f685030649814282eA457f169`) on 2026-08-11.
 *
 * Call target and approval target are the SAME contract — the diamond. There is no separate
 * spender, and no FairWins address belongs anywhere in this ABI: `Trade.user` is overwritten to
 * `_msgSender()` by the venue, so the member's own wallet always owns the position.
 *
 * FIVE SHAPES HERE ARE LOAD-BEARING. ethers decodes tuples positionally, so a reordered or
 * short struct silently mis-reads every trade rather than failing:
 *
 *   1. The `Trade` tuple is 15 fields, in the order below. v9 ended with a single
 *      `uint192 __placeholder`; v10 split that into `bool isCounterTrade; uint160
 *      positionSizeToken; uint24 __placeholder`. A v9 ABI mis-encodes an open.
 *   2. `Trade.collateralAmount` is in the COLLATERAL TOKEN'S OWN DECIMALS (USDC = 1e6), not 1e18.
 *      The v9 source comment said 1e18 and was wrong for v10 — resolve the scale from
 *      `getCollateral(uint8).precision`.
 *   3. `Trade.leverage` and every `_maxSlippageP` are 1e3-scaled (10x = 10_000; 1% = 1_000);
 *      prices (`openPrice`/`tp`/`sl`/`_expectedPrice`) are 1e10.
 *   4. `TradeInfo` is 9 fields and `PendingOrder` is `Trade` + 6 fields (21 words on the wire) —
 *      both verified by decoding a live trader's positions.
 *   5. `getCollateral` returns 5 fields including a `uint88` placeholder between `isActive` and
 *      `precision`. Dropping it shifts `precision` and `precisionDelta` by one slot.
 *
 * THE INDEX TRAP. Two disjoint index spaces share the type `uint32`:
 *   - `cancelOrderAfterTimeout(uint32 _orderIndex)` takes a PENDING-ORDER index
 *     (`MarketOrderInitiated.orderId.index` / `getPendingOrders[].index`).
 *   - every other management call takes a TRADE index (`getTrades[].index` /
 *     `MarketExecuted.index`).
 * Passing one where the other belongs acts on a different object. `lib/perps/venues/gains.js`
 * keeps them in distinct branded types; nothing may pass a raw number across that boundary.
 */
export const GAINS_DIAMOND_ABI = [
  // --- opening ---
  // `user` is OVERWRITTEN to _msgSender() and `index` / `positionSizeToken` to 0 by the venue.
  // Pass the member in `user` anyway (never a FairWins address) so the calldata is honest about
  // who it is for and the ownership assertion in the calldata tests has something to check.
  'function openTrade(tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder) _trade, uint16 _maxSlippageP, address _referrer)',

  // --- managing an existing trade (TRADE index) ---
  // closeTradeMarket carries NO slippage parameter — closing slippage is stored per trade, so an
  // explicit tolerance means pairing updateMaxClosingSlippageP + closeTradeMarket in one multicall.
  'function closeTradeMarket(uint32 _index, uint64 _expectedPrice)',
  'function decreasePositionSize(uint32 _index, uint120 _collateralDelta, uint24 _leverageDelta, uint64 _expectedPrice)',
  'function increasePositionSize(uint32 _index, uint120 _collateralDelta, uint24 _leverageDelta, uint64 _expectedPrice, uint16 _maxSlippageP)',
  'function updateTp(uint32 _index, uint64 _newTp)',
  'function updateSl(uint32 _index, uint64 _newSl)',
  'function updateLeverage(uint32 _index, uint24 _newLeverage)',
  'function updateMaxClosingSlippageP(uint32 _index, uint16 _maxSlippageP)',

  // --- recovery (PENDING-ORDER index — never a trade index) ---
  // Reverts WaitTimeout() before createdBlock + getMarketOrdersTimeoutBlocks(), NoOrder() if the
  // order already resolved, WrongOrderType() for anything that is not a market order.
  'function cancelOrderAfterTimeout(uint32 _orderIndex)',

  // Diamond-level batching (delegatecall to self — the outer caller is preserved).
  'function multicall(bytes[] data) returns (bytes[] results)',

  // --- reads ---
  'function getTrades(address _trader) view returns (tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder)[])',
  'function getTrade(address _trader, uint32 _index) view returns (tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder))',
  // `contractsVersion` is the ContractsVersion enum (0 = BEFORE_V9_2, 1 = V9_2, 2 = V10);
  // `collateralPriceUsd` is 1e8 at open; `maxSlippageP` is the trade's stored CLOSING slippage.
  'function getTradeInfos(address _trader) view returns (tuple(uint32 createdBlock, uint32 tpLastUpdatedBlock, uint32 slLastUpdatedBlock, uint16 maxSlippageP, uint48 lastOiUpdateTs, uint48 collateralPriceUsd, uint8 contractsVersion, uint32 lastPosIncreaseBlock, uint8 __placeholder)[])',
  // `index` here is the PENDING-ORDER index — the only value cancelOrderAfterTimeout accepts.
  'function getPendingOrders(address _user) view returns (tuple(tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder) trade, address user, uint32 index, bool isOpen, uint8 orderType, uint32 createdBlock, uint16 maxSlippageP)[])',
  // collateralIndex is 1-BASED; `precision` is 10**decimals and is the authority for the
  // collateralAmount scale (never assume 1e18).
  'function getCollaterals() view returns (tuple(address collateral, bool isActive, uint88 __placeholder, uint128 precision, uint128 precisionDelta)[])',
  'function getCollateral(uint8 _index) view returns (tuple(address collateral, bool isActive, uint88 __placeholder, uint128 precision, uint128 precisionDelta))',
  // Blocks a pending market order must age before cancelOrderAfterTimeout stops reverting.
  'function getMarketOrdersTimeoutBlocks() view returns (uint16)',
  // TradingActivated: 0 = ACTIVATED, 1 = CLOSE_ONLY, 2 = PAUSED. Opens revert Paused() unless
  // ACTIVATED; closes stay permitted unless PAUSED.
  'function getTradingActivated() view returns (uint8)',

  // --- events: the ONLY honest source of terminal order state ---
  // A transaction receipt means the instruction reached the keeper, never that it executed.
  'event MarketOrderInitiated(tuple(address user, uint32 index) orderId, address indexed trader, uint16 indexed pairIndex, bool open)',
  // The first moment fill price, actual size and liquidation price exist.
  'event MarketExecuted(tuple(address user, uint32 index) orderId, address indexed user, uint32 indexed index, tuple(address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, bool isCounterTrade, uint160 positionSizeToken, uint24 __placeholder) t, bool open, uint256 oraclePrice, uint256 marketPrice, uint256 liqPrice, tuple(uint256 positionSizeToken, int256 fixedSpreadP, int256 cumulVolPriceImpactP, int256 skewPriceImpactP, int256 totalPriceImpactP, uint64 priceAfterImpact) priceImpact, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd)',
  // cancelReason is the CancelReason enum — surface the venue's own reason, and render the raw
  // number rather than inventing text for a value we have no mapping for.
  'event MarketOpenCanceled(tuple(address user, uint32 index) orderId, address indexed trader, uint256 indexed pairIndex, uint8 cancelReason, uint256 collateralReturned)',
  // Emitted by cancelOrderAfterTimeout — proof the collateral came back to the member.
  'event CollateralReturnedAfterTimeout(tuple(address user, uint32 index) pendingOrderId, uint8 indexed collateralIndex, address indexed trader, uint256 collateralAmount)',
]

/**
 * `ITradingStorage.TradingActivated`. Opening is only allowed in ACTIVATED; CLOSE_ONLY still
 * permits exits, which is why venue state gates opens and never closes (FR-017).
 */
export const GAINS_TRADING_ACTIVATED = {
  ACTIVATED: 0,
  CLOSE_ONLY: 1,
  PAUSED: 2,
}

/** `ITradingStorage.TradeType` — the 8th field of the Trade tuple. */
export const GAINS_TRADE_TYPE = {
  TRADE: 0,
  LIMIT: 1,
  STOP: 2,
}

/**
 * `ITradingStorage.PendingOrderType`. Only MARKET_OPEN, MARKET_PARTIAL_OPEN and a
 * UPDATE_LEVERAGE decrease return collateral through `cancelOrderAfterTimeout`; the rest of the
 * list exists so a pending order can be NAMED honestly rather than rendered as a bare number.
 */
export const GAINS_PENDING_ORDER_TYPE = {
  MARKET_OPEN: 0,
  MARKET_CLOSE: 1,
  LIMIT_OPEN: 2,
  STOP_OPEN: 3,
  TP_CLOSE: 4,
  SL_CLOSE: 5,
  LIQ_CLOSE: 6,
  UPDATE_LEVERAGE: 7,
  MARKET_PARTIAL_OPEN: 8,
  MARKET_PARTIAL_CLOSE: 9,
  PARAM_UPDATE: 10, // deprecated by the venue
  PNL_WITHDRAWAL: 11,
  MANUAL_HOLDING_FEES_REALIZATION: 12,
  MANUAL_NEGATIVE_PNL_REALIZATION: 13,
}

/**
 * `ITradingCallbacks.CancelReason` — the numeric values `MarketOpenCanceled.cancelReason` carries.
 * The member-facing text lives in `lib/perps/perpsCopy.js`; this is only the value map, and an
 * unmapped value must render as its number rather than as invented text (FR-008).
 */
export const GAINS_CANCEL_REASON = {
  NONE: 0,
  PAUSED: 1, // deprecated by the venue
  MARKET_CLOSED: 2, // deprecated by the venue
  SLIPPAGE: 3,
  TP_REACHED: 4,
  SL_REACHED: 5,
  EXPOSURE_LIMITS: 6,
  PRICE_IMPACT: 7,
  MAX_LEVERAGE: 8,
  NO_TRADE: 9,
  WRONG_TRADE: 10,
  NOT_HIT: 11,
  LIQ_REACHED: 12,
  COUNTER_TRADE_CANCELED: 13,
}

/** Fixed-point scales the diamond uses. A single missing factor here is a 1000x order. */
export const GAINS_SCALES = {
  PRICE: 10n ** 10n, // openPrice, tp, sl, _expectedPrice
  LEVERAGE: 10n ** 3n, // Trade.leverage, _leverageDelta (10x = 10_000)
  SLIPPAGE: 10n ** 3n, // _maxSlippageP (1% = 1_000)
  COLLATERAL_PRICE_USD: 10n ** 8n, // TradeInfo.collateralPriceUsd
  // collateralAmount has NO constant here on purpose: it is the collateral token's own precision,
  // read from getCollateral(collateralIndex).precision.
}

export default GAINS_DIAMOND_ABI
