/**
 * GMX v2 calldata (spec 083, T014) — Arbitrum only.
 *
 * Every builder returns a `{ target, data, value }` call object, the shape `WalletContext.sendCalls`
 * consumes (the `lib/earn/vaultActions.js` convention that `venues/gains.js` also follows): a passkey
 * session authorizes approve + open with one ceremony, a classic wallet signs them in order.
 *
 * THE OWNERSHIP INVARIANT — and the one misreading that would create custody. GMX's
 * `CreateOrderParams.addresses.receiver` LOOKS like an owner field. It is not. Ownership is
 * `msg.sender` of `createOrder` (`ExchangeRouter.sol`: `address account = msg.sender;`), hashed into
 * the position key `keccak256(account, market, collateralToken, isLong)` — which is why
 * `positionKey()` below takes an account and not a receiver. `receiver` is a PAYOUT target and
 * `cancellationReceiver` is a REFUND target; both are the MEMBER here. `multicall` is
 * delegatecall-to-self, so batching cannot move the caller either. The ONLY FairWins address that
 * may appear anywhere in this calldata is `addresses.uiFeeReceiver`. Anyone tempted to put a
 * FairWins address in `receiver` "so the app can route proceeds" would be handing FairWins the
 * member's position; there is no version of that which is safe.
 *
 * An absent `uiFeeReceiver` is `address(0)` and NOT an error: GMX early-returns a zero UI fee for
 * the zero address, so an unconfigured receiver is structurally fee-free (fee-rails.md).
 *
 * THE APPROVAL TRAP. Collateral is pulled by `Router.pluginTransfer`, so the ERC-20 approval goes to
 * GMX's **Router**, never to the ExchangeRouter this module calls. Two different addresses, both
 * named "router" — see `buildApprovalCall`.
 *
 * SCALES. `sizeDeltaUsd`, `triggerPrice` and `acceptablePrice` are 1e30; collateral amounts are in
 * the collateral token's OWN decimals; `executionFee` is wei. Token amounts and fees are strictly
 * `bigint` — a JS number there is the tell of a human-unit value that would encode as dust.
 *
 * Builders THROW on malformed input rather than returning a sentinel: they run when a member is
 * about to sign, never during render, and a silently-wrong call object would reach the wallet with
 * the member's collateral attached. The decoders and the fee estimate are the opposite — they run
 * over venue data inside effects and render, so they are total and return null / [].
 */
import {
  AbiCoder,
  Interface,
  ZeroAddress,
  ZeroHash,
  formatUnits,
  getAddress,
  id,
  isAddress,
  isHexString,
  keccak256,
  parseUnits,
  zeroPadValue,
} from 'ethers'
import {
  GMX_DECREASE_POSITION_SWAP_TYPE,
  GMX_EVENT_EMITTER_ABI,
  GMX_EXCHANGE_ROUTER_ABI,
  GMX_ORDER_EVENT_NAMES,
  GMX_ORDER_TYPE,
} from '../../../abis/perps/gmxExchangeRouter'
import { GMX_READER_ABI } from '../../../abis/perps/gmxReader'
import { gmxAddressesFor } from '../../../config/perps'

const EXCHANGE_ROUTER = new Interface(GMX_EXCHANGE_ROUTER_ABI)
const EVENT_EMITTER = new Interface(GMX_EVENT_EMITTER_ABI)
const READER = new Interface(GMX_READER_ABI)

/** Exact-amount approvals only — the repo never grants an unlimited allowance for collateral. */
const ERC20 = new Interface(['function approve(address spender, uint256 value) returns (bool)'])

const ABI_CODER = AbiCoder.defaultAbiCoder()

/**
 * GMX v2 is deployed on Arbitrum and nowhere else this product touches, so builders default to it.
 * The parameter still exists: `requireGmx` refuses any chain the config does not carry, rather than
 * silently aiming Arbitrum calldata at another chain.
 */
export const GMX_CHAIN_ID = 42161

/** `sizeDeltaUsd`, `triggerPrice`, `acceptablePrice` and `Position.sizeInUsd` are all 1e30. */
export const GMX_USD_DECIMALS = 30

/** GMX's `Precision.FLOAT_PRECISION` — the denominator every `applyFactor` divides by. */
export const GMX_FLOAT_PRECISION = 10n ** 30n

/** `oraclePriceCount = 3 + swapPath.length` for the execution-fee estimate. */
export const GMX_ORACLE_PRICE_COUNT_BASE = 3

/**
 * How far above the computed execution fee to bid, in bps of the fee.
 *
 * Biased HIGH deliberately: GMX's `payExecutionFee` refunds the unused remainder to the member and
 * emits `ExecutionFeeRefund`, so overpaying costs nothing but a moment of float, while underpaying
 * gets the order cancelled for `InsufficientExecutionFee` after the member has already signed.
 */
export const GMX_EXECUTION_FEE_BUFFER_BPS = 1000

const BPS_DENOMINATOR = 10_000n

/* ------------------------------------------------------------------------------------------- *
 * Input validation and scaling
 * ------------------------------------------------------------------------------------------- */

function describe(value) {
  if (value === null) return 'null'
  if (typeof value === 'object') return 'an object'
  return `a ${typeof value} (${String(value)})`
}

/**
 * The GMX address set for a chain. Throws where GMX is not deployed: a call object with a null
 * target would be a transaction to the zero address carrying the member's collateral.
 */
function requireGmx(chainId) {
  const gmx = gmxAddressesFor(chainId)
  if (!gmx) throw new Error(`GMX v2 is not deployed on chain ${String(chainId)}`)
  return gmx
}

function requireAddress(value, label) {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new TypeError(`${label} must be an address, received ${describe(value)}`)
  }
  const addr = getAddress(value)
  if (addr === ZeroAddress) throw new TypeError(`${label} cannot be the zero address`)
  return addr
}

/**
 * An optional address. Absent → `address(0)`, which is meaningful to GMX rather than broken:
 * a zero `uiFeeReceiver` is a zero UI fee, and a zero `cancellationReceiver` defaults to the account.
 */
function optionalAddress(value, label) {
  if (value == null || value === '') return ZeroAddress
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new TypeError(`${label} must be an address or null, received ${describe(value)}`)
  }
  return getAddress(value)
}

/**
 * Token amounts and wei values are `bigint` only. A JS number here would almost always be a
 * human-unit amount (10 meaning 10 USDC) which encodes as 10 base units.
 */
function requireTokenAmount(value, label) {
  if (typeof value !== 'bigint') {
    throw new TypeError(`${label} must be a bigint in the token's own decimals`)
  }
  if (value < 0n) throw new RangeError(`${label} cannot be negative`)
  return value
}

/**
 * The execution fee must be positive and must equal the `sendWnt` amount — GMX reverts
 * `InsufficientWntAmountForExecutionFee` when the vault received less than the order declares.
 * Both come from this one value, so they cannot drift apart.
 */
function requireExecutionFee(value) {
  const fee = requireTokenAmount(value, 'executionFee')
  if (fee === 0n) {
    throw new RangeError('executionFee must be greater than zero — GMX keepers will not execute a fee-free order')
  }
  return fee
}

/** A plain uint256 (callbackGasLimit, minOutputAmount, validFromTime). */
function requireUint(value, label) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new RangeError(`${label} cannot be negative`)
    return value
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return BigInt(value)
  throw new TypeError(`${label} must be a non-negative integer, received ${describe(value)}`)
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean, received ${describe(value)}`)
  return value
}

function requireBytes32(value, label) {
  if (typeof value !== 'string' || !isHexString(value, 32)) {
    throw new TypeError(`${label} must be a 32-byte hex string, received ${describe(value)}`)
  }
  return value
}

function optionalBytes32(value, label) {
  if (value == null || value === '') return ZeroHash
  return requireBytes32(value, label)
}

/**
 * Human units → GMX's 1e30 fixed point. A `bigint` passes through UNCHANGED because it is already
 * in venue units — that is how a `sizeInUsd` read back from the Reader is re-sent as the
 * `sizeDeltaUsd` of a full close without a round trip through a float.
 */
export function toUsdUnits(value, label = 'value') {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new RangeError(`${label} cannot be negative`)
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number`)
    if (value < 0) throw new RangeError(`${label} cannot be negative`)
    return parseUnits(value.toFixed(GMX_USD_DECIMALS), GMX_USD_DECIMALS)
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (!/^\d+(\.\d+)?$/.test(s)) {
      throw new RangeError(`${label} must be a non-negative decimal, received "${value}"`)
    }
    const [whole, frac = ''] = s.split('.')
    // Truncate rather than round: below the venue's precision is the member's side of the line.
    return parseUnits(`${whole}.${frac.slice(0, GMX_USD_DECIMALS) || '0'}`, GMX_USD_DECIMALS)
  }
  throw new RangeError(`${label} is required`)
}

/** 1e30 venue units → a decimal string. Total: junk in → null out (it renders in the sheet). */
export function fromUsdUnits(units) {
  try {
    if (typeof units === 'string' && !/^-?\d+$/.test(units.trim())) return null
    return formatUnits(units, GMX_USD_DECIMALS)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Order construction
 * ------------------------------------------------------------------------------------------- */

/**
 * `CreateOrderParams` in ABI field order.
 *
 * `receiver` and `cancellationReceiver` are BOTH the member: proceeds and refunds go to the member's
 * own wallet, and neither field confers ownership (see the module header). `uiFeeReceiver` is the
 * single permitted FairWins address; `callbackContract` is zero because this feature has no callback
 * and a contract there would be a third party in the member's order.
 */
function createOrderParams({
  account,
  market,
  collateralToken,
  uiFeeReceiver,
  orderType,
  sizeDeltaUsd,
  initialCollateralDeltaAmount,
  triggerPrice,
  acceptablePrice,
  executionFee,
  minOutputAmount,
  validFromTime,
  isLong,
  shouldUnwrapNativeToken,
  autoCancel,
  referralCode,
}) {
  // THE OWNERSHIP INVARIANT, enforced rather than only asserted in a test. Ownership is `msg.sender`
  // of `createOrder`, so building an order whose account IS the FairWins fee receiver means FairWins
  // holds the position — forbidden pattern 2 in venue-calldata.md. Both sides are already
  // checksum-normalised (`requireAddress` / `optionalAddress`), so this compares addresses, not case.
  if (uiFeeReceiver !== ZeroAddress && uiFeeReceiver === account) {
    throw new Error(
      'refusing to build a GMX order owned by the FairWins UI-fee receiver — the position owner is ' +
        'msg.sender, so this would give FairWins the position (venue-calldata.md, forbidden pattern 2)',
    )
  }
  return [
    [
      account, // receiver — the MEMBER (payout target, NOT ownership)
      account, // cancellationReceiver — the MEMBER (refund target, NOT ownership)
      ZeroAddress, // callbackContract
      uiFeeReceiver, // ← the ONLY FairWins address permitted in this calldata
      market,
      collateralToken,
      [], // swapPath — this feature never swaps on the way in or out
    ],
    [
      sizeDeltaUsd, // 1e30 notional
      initialCollateralDeltaAmount, // collateral token decimals
      triggerPrice, // 1e30, 0 for a market order
      acceptablePrice, // 1e30 slippage bound
      executionFee, // wei — must equal the sendWnt amount
      0n, // callbackGasLimit
      minOutputAmount,
      validFromTime,
    ],
    orderType,
    GMX_DECREASE_POSITION_SWAP_TYPE.NO_SWAP,
    isLong,
    shouldUnwrapNativeToken,
    autoCancel,
    referralCode,
    [], // dataList
  ]
}

/** One transaction to the ExchangeRouter carrying the encoded venue calls and the execution fee. */
function multicall(exchangeRouter, calls, value) {
  return {
    target: exchangeRouter,
    data: EXCHANGE_ROUTER.encodeFunctionData('multicall', [calls]),
    value,
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Builders
 * ------------------------------------------------------------------------------------------- */

/**
 * `approve(router, amount)` on the COLLATERAL TOKEN.
 *
 * THE SPENDER IS GMX'S `Router`, NOT THE `ExchangeRouter` THIS MODULE CALLS. The ExchangeRouter is
 * the call target; the Router is what actually pulls tokens (`Router.pluginTransfer`), so approving
 * the ExchangeRouter yields a `sendTokens` that reverts at execution — after the member has signed
 * and paid. The two addresses are pinned separately in `config/perps.js` with the same warning; do
 * not "simplify" this to `gmx.exchangeRouter`.
 */
export function buildApprovalCall({ chainId = GMX_CHAIN_ID, token, amount }) {
  const gmx = requireGmx(chainId)
  const collateral = requireAddress(token, 'token')
  const value = requireTokenAmount(amount, 'amount')
  return {
    target: collateral,
    data: ERC20.encodeFunctionData('approve', [gmx.router, value]),
    value: 0n,
  }
}

/**
 * Open (or add to) a position: ONE ExchangeRouter `multicall` of
 * `[sendWnt, sendTokens, createOrder]` with `value` = the execution fee.
 *
 * Ordering is load-bearing. Both transfers must land in the OrderVault before `createOrder` runs,
 * because `createOrder` measures what arrived (`recordTransferIn`) rather than trusting the
 * parameters. That is also why a WNT collateral token is safe in this three-call form: the vault's
 * balance delta covers fee + collateral together and GMX subtracts the declared execution fee from
 * it (venue-calldata.md).
 */
export function buildOpenPositionCalls({
  chainId = GMX_CHAIN_ID,
  account,
  market,
  collateralToken,
  collateralAmount,
  sizeDeltaUsd,
  acceptablePrice,
  executionFee,
  isLong,
  uiFeeReceiver = null,
  referralCode = null,
}) {
  const gmx = requireGmx(chainId)
  const member = requireAddress(account, 'account')
  const collateral = requireTokenAmount(collateralAmount, 'collateralAmount')
  if (collateral === 0n) throw new RangeError('collateralAmount must be greater than zero to open')
  const size = toUsdUnits(sizeDeltaUsd, 'sizeDeltaUsd')
  if (size === 0n) throw new RangeError('sizeDeltaUsd must be greater than zero to open')
  const fee = requireExecutionFee(executionFee)
  const collateralAddress = requireAddress(collateralToken, 'collateralToken')

  const params = createOrderParams({
    account: member,
    market: requireAddress(market, 'market'),
    collateralToken: collateralAddress,
    uiFeeReceiver: optionalAddress(uiFeeReceiver, 'uiFeeReceiver'),
    orderType: GMX_ORDER_TYPE.MARKET_INCREASE,
    sizeDeltaUsd: size,
    initialCollateralDeltaAmount: collateral,
    triggerPrice: 0n, // a market order has no trigger
    // Not range-checked: the safe bound is a MAXIMUM for a long and a MINIMUM for a short, so any
    // bound this module invented would be wrong for one of them. The caller states it explicitly.
    acceptablePrice: toUsdUnits(acceptablePrice, 'acceptablePrice'),
    executionFee: fee,
    minOutputAmount: 0n, // an increase produces no output token
    validFromTime: 0n,
    isLong: requireBoolean(isLong, 'isLong'),
    shouldUnwrapNativeToken: false,
    autoCancel: false, // only protection orders die with the position
    referralCode: optionalBytes32(referralCode, 'referralCode'),
  })

  return multicall(
    gmx.exchangeRouter,
    [
      EXCHANGE_ROUTER.encodeFunctionData('sendWnt', [gmx.orderVault, fee]),
      EXCHANGE_ROUTER.encodeFunctionData('sendTokens', [collateralAddress, gmx.orderVault, collateral]),
      EXCHANGE_ROUTER.encodeFunctionData('createOrder', [params]),
    ],
    fee,
  )
}

/**
 * Close or reduce a position: `[sendWnt, createOrder]` with `orderType = MarketDecrease`.
 *
 * NO `sendTokens` — a decrease sends nothing to the vault but the execution fee. Adding one would
 * pull collateral out of the member's wallet for an order that is returning collateral to it.
 *
 * `sizeDeltaUsd` is the notional to close (a full close is the position's own `sizeInUsd`, which is
 * why `toUsdUnits` passes a bigint straight through), and `initialCollateralDeltaAmount` is the
 * collateral to withdraw — zero is legitimate, meaning "reduce size, leave the collateral".
 */
export function buildClosePositionCalls({
  chainId = GMX_CHAIN_ID,
  account,
  market,
  collateralToken,
  collateralAmount = 0n,
  sizeDeltaUsd,
  acceptablePrice,
  executionFee,
  isLong,
  uiFeeReceiver = null,
  referralCode = null,
  minOutputAmount = 0n,
  shouldUnwrapNativeToken = false,
}) {
  const gmx = requireGmx(chainId)
  const member = requireAddress(account, 'account')
  const size = toUsdUnits(sizeDeltaUsd, 'sizeDeltaUsd')
  const collateral = requireTokenAmount(collateralAmount, 'collateralAmount')
  if (size === 0n && collateral === 0n) {
    throw new RangeError('a decrease needs a sizeDeltaUsd or a collateralAmount to withdraw')
  }
  const fee = requireExecutionFee(executionFee)

  const params = createOrderParams({
    account: member,
    market: requireAddress(market, 'market'),
    collateralToken: requireAddress(collateralToken, 'collateralToken'),
    uiFeeReceiver: optionalAddress(uiFeeReceiver, 'uiFeeReceiver'),
    orderType: GMX_ORDER_TYPE.MARKET_DECREASE,
    sizeDeltaUsd: size,
    initialCollateralDeltaAmount: collateral,
    triggerPrice: 0n,
    acceptablePrice: toUsdUnits(acceptablePrice, 'acceptablePrice'),
    executionFee: fee,
    minOutputAmount: requireUint(minOutputAmount, 'minOutputAmount'),
    validFromTime: 0n,
    isLong: requireBoolean(isLong, 'isLong'),
    shouldUnwrapNativeToken: requireBoolean(shouldUnwrapNativeToken, 'shouldUnwrapNativeToken'),
    autoCancel: false, // a market decrease executes or cancels; there is no position to outlive
    referralCode: optionalBytes32(referralCode, 'referralCode'),
  })

  return multicall(
    gmx.exchangeRouter,
    [
      EXCHANGE_ROUTER.encodeFunctionData('sendWnt', [gmx.orderVault, fee]),
      EXCHANGE_ROUTER.encodeFunctionData('createOrder', [params]),
    ],
    fee,
  )
}

/**
 * Stop-loss (`StopLossDecrease`) and/or take-profit (`LimitDecrease`), as INDEPENDENT call objects —
 * one `[sendWnt, createOrder]` multicall per leg, each carrying its own execution fee.
 *
 * `autoCancel` is hardcoded TRUE and is not an option. A trigger order that outlives its position is
 * stale exposure: the member closes manually, believes they are flat, and a lingering stop opens a
 * NEW position in the opposite direction when it fires. `autoCancel` is what makes the order die
 * with the position.
 *
 * The stop-loss leg is emitted FIRST so that a member who abandons the second signature is left with
 * the protective order rather than only the profit-taking one.
 *
 * `acceptablePrice` has no default per leg for the same reason it has none on an open: the safe
 * bound is a maximum for one side and a minimum for the other, and a stop that cannot fill is worse
 * than no stop at all.
 */
export function buildProtectionCalls({
  chainId = GMX_CHAIN_ID,
  account,
  market,
  collateralToken,
  isLong,
  executionFee,
  stopLoss = null,
  takeProfit = null,
  uiFeeReceiver = null,
  referralCode = null,
}) {
  const gmx = requireGmx(chainId)
  const member = requireAddress(account, 'account')
  const marketAddress = requireAddress(market, 'market')
  const collateralAddress = requireAddress(collateralToken, 'collateralToken')
  const uiFee = optionalAddress(uiFeeReceiver, 'uiFeeReceiver')
  const code = optionalBytes32(referralCode, 'referralCode')
  const long = requireBoolean(isLong, 'isLong')
  if (stopLoss == null && takeProfit == null) {
    throw new RangeError('buildProtectionCalls needs a stopLoss, a takeProfit, or both')
  }

  const leg = (spec, orderType, label) => {
    const fee = requireExecutionFee(spec.executionFee ?? executionFee)
    const size = toUsdUnits(spec.sizeDeltaUsd, `${label}.sizeDeltaUsd`)
    if (size === 0n) throw new RangeError(`${label}.sizeDeltaUsd must be greater than zero`)
    const trigger = toUsdUnits(spec.triggerPrice, `${label}.triggerPrice`)
    if (trigger === 0n) throw new RangeError(`${label}.triggerPrice must be greater than zero`)
    if (spec.acceptablePrice == null) {
      throw new RangeError(`${label}.acceptablePrice is required — its safe value depends on direction`)
    }
    const params = createOrderParams({
      account: member,
      market: marketAddress,
      collateralToken: collateralAddress,
      uiFeeReceiver: uiFee,
      orderType,
      sizeDeltaUsd: size,
      initialCollateralDeltaAmount: requireTokenAmount(spec.collateralAmount ?? 0n, `${label}.collateralAmount`),
      triggerPrice: trigger,
      acceptablePrice: toUsdUnits(spec.acceptablePrice, `${label}.acceptablePrice`),
      executionFee: fee,
      minOutputAmount: requireUint(spec.minOutputAmount ?? 0n, `${label}.minOutputAmount`),
      validFromTime: requireUint(spec.validFromTime ?? 0n, `${label}.validFromTime`),
      isLong: long,
      shouldUnwrapNativeToken: Boolean(spec.shouldUnwrapNativeToken),
      autoCancel: true, // NOT configurable — see the doc comment above
      referralCode: code,
    })
    return multicall(
      gmx.exchangeRouter,
      [
        EXCHANGE_ROUTER.encodeFunctionData('sendWnt', [gmx.orderVault, fee]),
        EXCHANGE_ROUTER.encodeFunctionData('createOrder', [params]),
      ],
      fee,
    )
  }

  const calls = []
  if (stopLoss != null) calls.push(leg(stopLoss, GMX_ORDER_TYPE.STOP_LOSS_DECREASE, 'stopLoss'))
  if (takeProfit != null) calls.push(leg(takeProfit, GMX_ORDER_TYPE.LIMIT_DECREASE, 'takeProfit'))
  return calls
}

/**
 * `cancelOrder(key)` — the only way out of a frozen trigger order, and the member's alone: GMX
 * reverts unless `order.account() == msg.sender`. Nothing auto-clears a frozen order, which is why
 * this control is always offered rather than gated.
 *
 * Accepts a bare key as well as an options object, because the contract doc names it `cancelOrder(key)`.
 */
export function buildCancelOrderCall(arg) {
  const { chainId = GMX_CHAIN_ID, key } = typeof arg === 'string' ? { key: arg } : (arg ?? {})
  const gmx = requireGmx(chainId)
  return {
    target: gmx.exchangeRouter,
    data: EXCHANGE_ROUTER.encodeFunctionData('cancelOrder', [requireBytes32(key, 'key')]),
    value: 0n,
  }
}

/**
 * `updateOrder(key, …)` — retune a pending or frozen trigger order in place. Owner-gated the same
 * way `cancelOrder` is.
 *
 * `autoCancel` defaults to TRUE because `updateOrder` OVERWRITES the stored flag: omitting it with a
 * `false` default would quietly convert a protection order into one that outlives its position,
 * which is exactly the stale exposure `buildProtectionCalls` refuses to create.
 *
 * No execution-fee top-up is modelled: `value` is zero. If GMX ever requires more fee for an updated
 * order, that is a `sendWnt` in a multicall and must be added deliberately, not inferred here.
 */
export function buildUpdateOrderCall({
  chainId = GMX_CHAIN_ID,
  key,
  sizeDeltaUsd,
  acceptablePrice,
  triggerPrice,
  minOutputAmount = 0n,
  validFromTime = 0n,
  autoCancel = true,
}) {
  const gmx = requireGmx(chainId)
  return {
    target: gmx.exchangeRouter,
    data: EXCHANGE_ROUTER.encodeFunctionData('updateOrder', [
      requireBytes32(key, 'key'),
      toUsdUnits(sizeDeltaUsd, 'sizeDeltaUsd'),
      toUsdUnits(acceptablePrice, 'acceptablePrice'),
      toUsdUnits(triggerPrice, 'triggerPrice'),
      requireUint(minOutputAmount, 'minOutputAmount'),
      requireUint(validFromTime, 'validFromTime'),
      requireBoolean(autoCancel, 'autoCancel'),
    ]),
    value: 0n,
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Execution fee estimate
 * ------------------------------------------------------------------------------------------- */

/** GMX's `Precision.applyFactor` — `value × factor / 1e30`. Total: junk in → null out. */
export function applyFactor(value, factor) {
  const v = toUnsigned(value)
  const f = toUnsigned(factor)
  if (v === null || f === null) return null
  return (v * f) / GMX_FLOAT_PRECISION
}

/**
 * The keeper execution fee for one order, per venue-calldata.md:
 *
 *   gasLimit = baseGasLimit + gasPerOraclePrice × (3 + swapPath.length)
 *              + applyFactor(orderGasLimit, multiplierFactor)
 *   fee      = gasLimit × gasPrice, plus `bufferBps`
 *
 * Every GMX-sourced input is REQUIRED and none is defaulted: `baseGasLimit`, `gasPerOraclePrice`,
 * `orderGasLimit` and `multiplierFactor` all live in GMX's DataStore and change with the venue's
 * own configuration. Inventing a fallback for one would put a fabricated number in front of a
 * member, so a missing input returns null and the caller discloses that the fee is unknown.
 *
 * The result is biased HIGH by `bufferBps` on purpose — see `GMX_EXECUTION_FEE_BUFFER_BPS`:
 * overpaying is refunded, underpaying cancels the order after the member has signed.
 *
 * → `{ gasLimit, oraclePriceCount, baseFee, fee, bufferBps }` or null.
 */
export function estimateExecutionFee(input) {
  // Destructured INSIDE the body, from `?? {}`: a parameter-list default only covers `undefined`, and
  // the DataStore constants this reads arrive asynchronously — `estimateExecutionFee(gasParams)` with
  // `gasParams` still null is the normal first render, not an error, and must yield null not a throw.
  const {
    gasPrice,
    baseGasLimit,
    gasPerOraclePrice,
    orderGasLimit,
    multiplierFactor,
    swapPathLength = 0,
    bufferBps = GMX_EXECUTION_FEE_BUFFER_BPS,
  } = input ?? {}
  const price = toUnsigned(gasPrice)
  const base = toUnsigned(baseGasLimit)
  const perOracle = toUnsigned(gasPerOraclePrice)
  const orderGas = toUnsigned(orderGasLimit)
  const factor = toUnsigned(multiplierFactor)
  const buffer = toUnsigned(bufferBps)
  if (price === null || base === null || perOracle === null || orderGas === null || factor === null) return null
  if (buffer === null) return null
  if (!Number.isInteger(swapPathLength) || swapPathLength < 0) return null

  const oraclePriceCount = GMX_ORACLE_PRICE_COUNT_BASE + swapPathLength
  const gasLimit = base + perOracle * BigInt(oraclePriceCount) + (orderGas * factor) / GMX_FLOAT_PRECISION
  const baseFee = gasLimit * price
  return {
    gasLimit,
    oraclePriceCount,
    baseFee,
    fee: baseFee + (baseFee * buffer) / BPS_DENOMINATOR,
    bufferBps: Number(buffer),
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Reading — Reader positions and the EventEmitter filter
 * ------------------------------------------------------------------------------------------- */

/**
 * `Position.getPositionKey` — `keccak256(abi.encode(account, market, collateralToken, isLong))`.
 *
 * The ACCOUNT in this hash is `msg.sender` of `createOrder`. It is the concrete reason no field in
 * `CreateOrderParams` can redirect ownership: a different receiver produces the same key, so it
 * addresses the same member's position.
 *
 * Total: junk in → null out.
 */
export function positionKey(account, market, collateralToken, isLong) {
  try {
    return keccak256(
      ABI_CODER.encode(
        ['address', 'address', 'address', 'bool'],
        [getAddress(account), getAddress(market), getAddress(collateralToken), Boolean(isLong)],
      ),
    )
  } catch {
    return null
  }
}

/**
 * `Reader.getAccountPositions` → normalized position objects.
 *
 * Accepts either the decoded ethers result or the raw returndata hex, so a caller that already has
 * a `Contract` result and one that has bytes both land here rather than each rolling their own.
 *
 * TOTAL: an empty array for junk, and an unreadable ROW is dropped rather than emitted with holes —
 * an account with no positions returns a clean empty array from GMX, so absence is never an error
 * and must never render as a failed read. Values stay in VENUE units (`sizeInUsd` 1e30,
 * `sizeInTokens` in the index token's decimals, collateral in the collateral token's) and are
 * scaled for display by the caller, never re-derived here.
 */
export function decodeAccountPositions(readerResult) {
  const rows = positionRows(readerResult)
  if (!rows) return []
  const out = []
  for (const row of rows) {
    const position = decodePosition(row)
    if (position) out.push(position)
  }
  return out
}

function positionRows(readerResult) {
  if (typeof readerResult === 'string') {
    try {
      const [decoded] = READER.decodeFunctionResult('getAccountPositions', readerResult)
      return Array.from(decoded)
    } catch {
      return null
    }
  }
  if (readerResult == null || typeof readerResult !== 'object') return null
  try {
    return Array.from(readerResult)
  } catch {
    return null
  }
}

/**
 * ethers `Result` exposes both named and positional access; a plain array fixture only the latter.
 * Reading by name FIRST keeps the field mapping honest even if the tuple ever gains a member, and
 * the positional fallback keeps test fixtures from having to fake a Result.
 */
function at(tuple, name, index) {
  if (tuple == null) return undefined
  try {
    const named = tuple[name]
    if (named !== undefined) return named
  } catch {
    /* Result throws on an unknown name — fall through to the index */
  }
  try {
    return tuple[index]
  } catch {
    return undefined
  }
}

function decodePosition(row) {
  const addresses = at(row, 'addresses', 0)
  const numbers = at(row, 'numbers', 1)
  const flags = at(row, 'flags', 2)
  const account = toAddress(at(addresses, 'account', 0))
  const market = toAddress(at(addresses, 'market', 1))
  const collateralToken = toAddress(at(addresses, 'collateralToken', 2))
  const sizeInUsd = toUnsigned(at(numbers, 'sizeInUsd', 0))
  if (!account || !market || !collateralToken || sizeInUsd === null) return null
  const isLong = Boolean(at(flags, 'isLong', 0))
  return {
    key: positionKey(account, market, collateralToken, isLong),
    account,
    market,
    collateralToken,
    isLong,
    sizeInUsd,
    sizeInTokens: toUnsigned(at(numbers, 'sizeInTokens', 1)),
    collateralAmount: toUnsigned(at(numbers, 'collateralAmount', 2)),
    // int256 and routinely negative — decoding it unsigned turns a small debit into ~2^256.
    pendingImpactAmount: toSigned(at(numbers, 'pendingImpactAmount', 3)),
    borrowingFactor: toUnsigned(at(numbers, 'borrowingFactor', 4)),
    fundingFeeAmountPerSize: toUnsigned(at(numbers, 'fundingFeeAmountPerSize', 5)),
    longTokenClaimableFundingAmountPerSize: toUnsigned(at(numbers, 'longTokenClaimableFundingAmountPerSize', 6)),
    shortTokenClaimableFundingAmountPerSize: toUnsigned(at(numbers, 'shortTokenClaimableFundingAmountPerSize', 7)),
    // TIMESTAMPS in seconds, not block numbers — earlier GMX releases carried blocks in these slots.
    increasedAtTime: toSeconds(at(numbers, 'increasedAtTime', 8)),
    decreasedAtTime: toSeconds(at(numbers, 'decreasedAtTime', 9)),
  }
}

/** The `EventLog2` topic — every order event GMX emits shares it. */
export const GMX_EVENT_LOG2_TOPIC = EVENT_EMITTER.getEvent('EventLog2').topicHash

/**
 * The log filter for one member's order events.
 *
 * `EventLog2` carries three indexed topics: `eventNameHash`, `topic1` (the order key) and `topic2`
 * (`Cast.toBytes32(account)` — the member's address left-padded to 32 bytes). Filtering on topic2 is
 * what makes "this member's orders" a node-side query instead of a full scan; topic1 is left open
 * because we want every order, not one known key.
 *
 * TOTAL: null for a bad address or a chain without GMX, so an effect can branch instead of throwing.
 *
 * → `{ address, topics }` — an ethers filter, ready for `getLogs` / `provider.on`.
 */
export function eventTopicsForAccount(account, options) {
  // `?? {}` inside the body — an explicit null options object must degrade, not throw (see above).
  const { chainId = GMX_CHAIN_ID, eventNames = GMX_ORDER_EVENT_NAMES } = options ?? {}
  if (typeof account !== 'string' || !isAddress(account)) return null
  const gmx = gmxAddressesFor(chainId)
  if (!gmx) return null
  const names = Array.isArray(eventNames) ? eventNames.filter((name) => typeof name === 'string' && name !== '') : []
  return {
    address: gmx.eventEmitter,
    topics: [
      GMX_EVENT_LOG2_TOPIC,
      // An indexed string is topic'd as keccak(bytes(name)); an array here is an OR filter.
      names.length ? names.map((name) => id(name)) : null,
      null, // topic1 = the order key
      zeroPadValue(getAddress(account).toLowerCase(), 32),
    ],
  }
}

/**
 * One raw `EventLog2` log → the flat order event `orderState.js`'s `gmxEventSignal` consumes:
 * `{ eventName, key, account, reason, msgSender }`.
 *
 * GMX emits EVERY order event through the single EventEmitter as an `EventLog2` whose real payload
 * is nested inside the `EventLogData` key/value bag, so "which event is this" is not the log's topic0
 * — topic0 is `EventLog2` for all of them. The discriminator is the `eventName` STRING in the data
 * (`eventNameHash` is its indexed twin and comes back as a hash, not the name).
 *
 * `reason` is pulled out of `stringItems` because that is where GMX puts its own words for a
 * cancellation or a freeze ("OrderNotFulfillableAtAcceptablePrice"). It is passed through verbatim —
 * translating it would mean inventing a cause we have not confirmed (FR-008).
 *
 * `account` is returned as the raw bytes32 topic (`Cast.toBytes32(account)`), NOT narrowed to an
 * address: `gmxEventSignal` compares the trailing 20 bytes itself, and re-formatting it here would
 * be a second place to get that padding wrong.
 *
 * TOTAL: it runs over arbitrary logs inside an effect, so a log from another contract, a non-order
 * event, or malformed data returns null rather than taking the sheet down.
 */
export function decodeOrderEvent(log) {
  const topics = Array.isArray(log?.topics) ? log.topics : null
  if (!topics?.length) return null
  if (String(topics[0]).toLowerCase() !== GMX_EVENT_LOG2_TOPIC.toLowerCase()) return null
  let parsed
  try {
    parsed = EVENT_EMITTER.parseLog({ topics: [...topics], data: log.data ?? '0x' })
  } catch {
    return null
  }
  if (parsed?.name !== 'EventLog2') return null
  const eventName = typeof parsed.args?.eventName === 'string' ? parsed.args.eventName : null
  // Not one of ours — a position/market event sharing the emitter, not an order event.
  if (!eventName || !GMX_ORDER_EVENT_NAMES.includes(eventName)) return null
  return {
    eventName,
    key: parsed.args.topic1,
    account: parsed.args.topic2,
    reason: stringEventItem(parsed.args.eventData, 'reason'),
    msgSender: parsed.args.msgSender,
  }
}

/** One `stringItems` entry out of an `EventLogData` bag, or null. Never throws on a shape change. */
function stringEventItem(eventData, key) {
  try {
    for (const item of eventData?.stringItems?.items ?? []) {
      if (item?.key === key && typeof item.value === 'string' && item.value !== '') return item.value
    }
  } catch {
    /* an unexpected bag shape is "no reason", never a crash */
  }
  return null
}

/* ------------------------------------------------------------------------------------------- *
 * Total coercions (decoder side)
 * ------------------------------------------------------------------------------------------- */

function toUnsigned(value) {
  const n = toSigned(value)
  return n === null || n < 0n ? null : n
}

function toSigned(value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : null
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim())
  return null
}

function toAddress(value) {
  if (typeof value !== 'string' || !isAddress(value)) return null
  const addr = getAddress(value)
  return addr === ZeroAddress ? null : addr
}

function toSeconds(value) {
  const n = toUnsigned(value)
  return n === null ? null : Number(n)
}
