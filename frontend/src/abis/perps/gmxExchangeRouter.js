/**
 * GMX v2 `ExchangeRouter` ABI subset (spec 083) — Arbitrum 42161 only.
 *
 * Hand-maintained human-readable fragments, ethers v6 (no GMX SDK dependency — it is BUSL-1.1 and
 * would touch the lockfile and bundle, research D13). Every selector below was checked against the
 * deployed ExchangeRouter `0x7dE39FF2e232A2203196788d37e234cF8F1b83f1` on 2026-08-11.
 *
 * THE OWNERSHIP INVARIANT. Position ownership is `msg.sender` of `createOrder`
 * (`ExchangeRouter.sol`: `address account = msg.sender;`) and is hashed into the position key
 * `keccak256(account, market, collateralToken, isLong)`. `addresses.receiver` is a PAYOUT target,
 * not ownership, and `multicall` is delegatecall-to-self so batching cannot change the caller.
 * The ONLY FairWins address that may ever appear in this calldata is `addresses.uiFeeReceiver` —
 * never `receiver`, never `cancellationReceiver` (both are the member, or 0 for the latter, which
 * the venue defaults to the account).
 *
 * THE APPROVAL TRAP. Collateral is pulled by `Router.pluginTransfer`, so the ERC-20 approval goes
 * to the **Router**, NOT to this ExchangeRouter. The address lives in `config/perps.js` as
 * `gmx.router` with the same warning; approving the ExchangeRouter produces a `sendTokens` that
 * reverts on transfer.
 *
 * SCALES. `sizeDeltaUsd`, `triggerPrice` and `acceptablePrice` are 1e30;
 * `initialCollateralDeltaAmount` is in the collateral token's own decimals; `executionFee` is wei.
 */
export const GMX_EXCHANGE_ROUTER_ABI = [
  // --- opening / closing / protecting ---
  // One order type covers everything: 2 = MarketIncrease, 4 = MarketDecrease,
  // 5 = LimitDecrease (take-profit), 6 = StopLossDecrease (stop-loss). See GMX_ORDER_TYPE.
  'function createOrder(tuple(tuple(address receiver, address cancellationReceiver, address callbackContract, address uiFeeReceiver, address market, address initialCollateralToken, address[] swapPath) addresses, tuple(uint256 sizeDeltaUsd, uint256 initialCollateralDeltaAmount, uint256 triggerPrice, uint256 acceptablePrice, uint256 executionFee, uint256 callbackGasLimit, uint256 minOutputAmount, uint256 validFromTime) numbers, uint8 orderType, uint8 decreasePositionSwapType, bool isLong, bool shouldUnwrapNativeToken, bool autoCancel, bytes32 referralCode, bytes32[] dataList) params) payable returns (bytes32)',

  // --- recovery: the only way out of a frozen trigger order, and owner-gated ---
  // Both revert unless `order.account() == msg.sender`, so only the member can call them.
  'function cancelOrder(bytes32 key) payable',
  'function updateOrder(bytes32 key, uint256 sizeDeltaUsd, uint256 acceptablePrice, uint256 triggerPrice, uint256 minOutputAmount, uint256 validFromTime, bool autoCancel) payable',

  // --- funding an order (receiver is the ORDER VAULT, never a FairWins address) ---
  // sendWnt carries the execution fee as native value and wraps it; sendTokens pulls collateral
  // through Router.pluginTransfer, which is why the approval target is the Router.
  'function sendWnt(address receiver, uint256 amount) payable',
  'function sendTokens(address token, address receiver, uint256 amount) payable',
  // sendWnt + sendTokens + createOrder ride in ONE multicall with value = executionFee.
  'function multicall(bytes[] data) payable returns (bytes[] results)',

  // --- FairWins' own UI-fee rail (spec 083 fee-rails.md; NOT a member action) ---
  // Both are msg.sender-keyed: the sending address IS the uiFeeReceiver. That is why the receiver
  // recorded in config must be the address that sent setUiFeeFactor, and why the only value
  // FairWins can ever strand here is its own.
  'function setUiFeeFactor(uint256 uiFeeFactor) payable',
  'function claimUiFees(address[] markets, address[] tokens, address receiver) payable returns (uint256[])',
]

/**
 * GMX v2 emits every order event from the single `EventEmitter`, not from the ExchangeRouter, so
 * these fragments carry that contract's address — `gmxAddressesFor(chainId).eventEmitter` — not
 * the router's. They live in this module because they are the terminal half of the calls above and
 * must not drift from them.
 *
 * For order events `topic1` is the order key and `topic2` is `Cast.toBytes32(account)`, i.e. the
 * member's address left-padded to 32 bytes — filter on topic2 to get one member's orders.
 * `EventLog1` is included because position events (PositionIncrease/PositionDecrease) carry only
 * the account topic.
 *
 * The `EventLogData` shape is the full `EventUtils` key/value bag. It is verbose and it is
 * load-bearing: the topic hash is computed over the whole signature, so trimming a branch of the
 * struct produces a hash that matches nothing on chain. Both hashes below were checked against
 * live Arbitrum logs on 2026-08-11.
 */
const EVENT_LOG_DATA =
  'tuple(' +
  'tuple(tuple(string key, address value)[] items, tuple(string key, address[] value)[] arrayItems) addressItems, ' +
  'tuple(tuple(string key, uint256 value)[] items, tuple(string key, uint256[] value)[] arrayItems) uintItems, ' +
  'tuple(tuple(string key, int256 value)[] items, tuple(string key, int256[] value)[] arrayItems) intItems, ' +
  'tuple(tuple(string key, bool value)[] items, tuple(string key, bool[] value)[] arrayItems) boolItems, ' +
  'tuple(tuple(string key, bytes32 value)[] items, tuple(string key, bytes32[] value)[] arrayItems) bytes32Items, ' +
  'tuple(tuple(string key, bytes value)[] items, tuple(string key, bytes[] value)[] arrayItems) bytesItems, ' +
  'tuple(tuple(string key, string value)[] items, tuple(string key, string[] value)[] arrayItems) stringItems' +
  ') eventData'

export const GMX_EVENT_EMITTER_ABI = [
  `event EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, ${EVENT_LOG_DATA})`,
  `event EventLog2(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, bytes32 indexed topic2, ${EVENT_LOG_DATA})`,
]

/**
 * `Order.OrderType`. Only these four are reachable from this feature: markets to open and close,
 * and the two trigger types that carry protection.
 */
export const GMX_ORDER_TYPE = {
  MARKET_INCREASE: 2,
  MARKET_DECREASE: 4,
  LIMIT_DECREASE: 5, // take-profit
  STOP_LOSS_DECREASE: 6, // stop-loss
}

/** `Order.DecreasePositionSwapType` — 0 (no swap) for every order this feature builds. */
export const GMX_DECREASE_POSITION_SWAP_TYPE = {
  NO_SWAP: 0,
  SWAP_PNL_TOKEN_TO_COLLATERAL_TOKEN: 1,
  SWAP_COLLATERAL_TOKEN_TO_PNL_TOKEN: 2,
}

/**
 * The `eventName` strings whose keccak hash is `topic1` of an EventLog2 order event. Market orders
 * CANCEL on failed execution (collateral returns to `cancellationReceiver`, defaulting to the
 * account); limit/trigger orders FREEZE and stay frozen until the member cancels or updates them —
 * nothing auto-clears one, which is why `frozen` is a real state with its own recovery control.
 */
export const GMX_ORDER_EVENT_NAMES = [
  'OrderCreated',
  'OrderExecuted',
  'OrderUpdated',
  'OrderCancelled',
  'OrderFrozen',
  'OrderSizeDeltaAutoUpdated',
  'OrderCollateralDeltaAmountAutoUpdated',
]

/** Fixed-point scales GMX uses. `sizeDeltaUsd` at 1e30 is the base every fee is charged on. */
export const GMX_SCALES = {
  USD: 10n ** 30n, // sizeDeltaUsd, triggerPrice, acceptablePrice, position sizeInUsd
  UI_FEE_FACTOR_PER_BPS: 10n ** 26n, // 1 bp of uiFeeFactor; MAX_UI_FEE_FACTOR = 1e27 = 10 bps
}

export default GMX_EXCHANGE_ROUTER_ABI
