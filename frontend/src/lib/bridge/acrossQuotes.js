/**
 * Bridge quote layer (spec 067, US1 — T066) — the SPA side of the relay-gateway's read-only
 * /v1/bridge/* proxy (services/relay-gateway/src/bridge/routes.js).
 *
 * One quote, assembled from two sources and nothing else:
 *   - Across `suggested-fees`, proxied by the gateway. It is the ONLY source of the amount that
 *     will arrive and of the bridge's own cost legs; a bridge price is not derivable client-side
 *     (research R10), so when the gateway is unset or unreachable this module reports unavailable
 *     and the Bridge surface hides. It never falls back to a remembered or interpolated price
 *     (FR-054) — a member must not sign against a number we made up.
 *   - the live `FeeRouter` rate for `bridge.transfer` (spec 060 / FR-026), read through
 *     `lib/fees/feeQuote.js`. A router that is present but unreadable BLOCKS the quote rather
 *     than assuming zero.
 *
 * The fee ordering here mirrors `BridgeRouter.bridgeWithFee` exactly: the platform fee is skimmed
 * from the GROSS amount the member enters and only the NET is handed to Across, so the Across quote
 * is fetched for the net — quoting the gross would overstate what arrives.
 *
 * Honest-state rules this file exists to keep:
 *   - FR-007: every cost is its own labelled line. A line whose figure the upstream did not give us
 *     is marked unavailable; it is never rendered as 0.
 *   - FR-008: a quote carries a validity window and goes stale. `isQuoteStale` is the boundary the
 *     confirm control is disabled behind; the quoted bps travels back as `maxFeeBps` (FR-028).
 *   - FR-029: a zero or unset platform rate produces NO fee line at all — not a line reading 0.00.
 *   - FR-012: arriving on a network with no gas is disclosed before signature, and only when we
 *     actually know the destination balance is zero.
 *
 * Formatting is deliberately not done here: every amount is base units as a decimal string, exactly
 * as it came from Across or from the fee split, and the surface formats with `decimals`.
 */
import { BRIDGE_SETTLEMENT } from './bridgeCopy'
import { FEE_SERVICES, fetchFeeQuote, splitFee } from '../fees/feeQuote'
import { getNetwork } from '../../config/networks'

const FETCH_TIMEOUT_MS = 10_000

/**
 * Member-facing validity window (FR-008). Deliberately short and deliberately independent of the
 * gateway's 10 s response cache: this is how long a member may look at a price before we make them
 * refresh, not how long we may reuse a response. Across pins the on-chain price with
 * `quoteTimestamp`, so an expired quote costs nothing but a refresh — nothing is charged while it
 * sits (BRIDGE_TIPS.quoteValidity says exactly that).
 */
export const QUOTE_VALIDITY_MS = 60_000

/** Stable ids for the itemized cost lines, so the UI can attach the right InfoTip. */
export const BRIDGE_QUOTE_LINE = Object.freeze({
  BRIDGE_FEE: 'bridgeFee',
  DESTINATION_GAS: 'destinationGas',
  PLATFORM_FEE: 'platformFee',
})

/**
 * A quote could not be produced. Every failure class the member can hit resolves to one of these
 * with a machine-readable `code`, so the surface can tell "operator turned bridging off" from
 * "Across is down" from "we cannot read the fee" and say which (FR-051/FR-053).
 */
export class BridgeQuoteUnavailable extends Error {
  constructor(message, { code, status, disabled = false, retryable = false, cause } = {}) {
    super(message)
    this.name = 'BridgeQuoteUnavailable'
    this.code = code || 'unavailable'
    if (status !== undefined) this.status = status
    this.disabled = disabled
    this.retryable = retryable
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * The configured gateway base URL for BRIDGE quotes, or '' when unset. Read at call time so tests
 * can stub the env.
 *
 * `VITE_BRIDGE_GATEWAY_URL` names this surface's gateway on its own, falling back to the shared
 * `VITE_RELAYER_URL` so a normal deployment still configures everything with one value. The
 * separate name exists because the shared one is a single switch over surfaces that are not
 * related: the same variable also decides whether the Bitcoin gateway (spec 061) counts as
 * configured, so turning the bridge on turned Bitcoin on with it. That collision is a real one —
 * a build that proxies Across has not thereby gained a Bitcoin gateway, and saying it has makes
 * the Bitcoin surface claim a capability it does not have. Giving Bitcoin its own name is issue
 * #1263; the rest of the shared consumers (Predict, Perps, Collect, Solana RPC, intent relay) have
 * the same latent collision and are noted there.
 */
export function bridgeGatewayUrl() {
  const configured = import.meta.env.VITE_BRIDGE_GATEWAY_URL || import.meta.env.VITE_RELAYER_URL || ''
  return configured.trim().replace(/\/$/, '')
}

/**
 * EVM chain ids only. Bitcoin network ids are STRINGS (spec 061) and must never reach a chain-keyed
 * lookup, wagmi, or `getContractAddressForChain` — this is the quote half of FR-006's "Bitcoin is
 * out of scope for bridging" (the submit half lives in `bridgeRouter.js`). Throwing rather than
 * returning null is right here: a string id at this point is a caller bug, not a member state.
 */
function assertEvmChainId(chainId, label) {
  if (typeof chainId !== 'number' || !Number.isInteger(chainId) || chainId <= 0) {
    throw new BridgeQuoteUnavailable(
      `bridge quote: ${label} chain id must be a positive integer EVM chain id (got ${JSON.stringify(chainId)})`,
      { code: 'unsupported_chain' },
    )
  }
  return chainId
}

/**
 * Whether quoting can be attempted at all on a chain: the settlement protocol must be configured
 * there AND a gateway must exist to price it. False hides the Bridge surface for a stated reason
 * (`bridgeUnavailableCopy` / BRIDGE_UNAVAILABLE.gateway) rather than showing a dead control.
 */
export function bridgeQuotingAvailable(chainId) {
  if (typeof chainId !== 'number') return false
  return Boolean(getNetwork(chainId)?.capabilities?.bridge) && bridgeGatewayUrl() !== ''
}

/** Gateway error codes that mean "this capability is off", not "try again". */
const DISABLED_CODES = new Set(['bridge_disabled', 'bridge_killed', 'unconfigured'])
/** …and the ones that are transient: the surface offers a retry instead of hiding. */
const RETRYABLE_CODES = new Set(['upstream_unavailable', 'quota_exceeded', 'timeout', 'network_error'])

async function getJson(path) {
  const base = bridgeGatewayUrl()
  if (!base) {
    throw new BridgeQuoteUnavailable('bridge gateway is not configured', { code: 'unconfigured', disabled: true })
  }

  let res
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    res = await fetch(`${base}${path}`, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal })
  } catch (e) {
    const code = e?.name === 'AbortError' ? 'timeout' : 'network_error'
    throw new BridgeQuoteUnavailable(`bridge gateway unreachable: ${e?.message || e}`, { code, retryable: true, cause: e })
  } finally {
    clearTimeout(timer)
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON body — handled by the status mapping below */
  }

  if (res.ok) {
    if (body === null) {
      throw new BridgeQuoteUnavailable('bridge gateway returned an unreadable body', { code: 'bad_response', retryable: true })
    }
    return body
  }

  const code = body?.error?.code || `http_${res.status}`
  const disabled = DISABLED_CODES.has(code)
  throw new BridgeQuoteUnavailable(body?.error?.reason || `bridge quote request failed (${res.status})`, {
    code,
    status: res.status,
    disabled,
    // "Off" is never "try again": a killswitched or disabled module answers 503 too, and offering a
    // retry there would loop the member against a decision an operator made on purpose.
    retryable: !disabled && (RETRYABLE_CODES.has(code) || res.status >= 500),
  })
}

/**
 * Raw Across legs for one route and amount, straight from the gateway DTO
 * (`services/relay-gateway/src/bridge/quotes.js#normalizeSuggestedFees`).
 *
 * `amount` is what actually reaches Across — the NET, after the platform fee — because that is what
 * `BridgeRouter` forwards. Callers should prefer `fetchBridgeQuote`, which does the split for them.
 *
 * @param {{originChainId: number, destinationChainId: number, inputToken: string,
 *   outputToken: string, amount: string, recipient?: string|null}} params
 * @returns {Promise<object>} the gateway DTO plus `fetchedAt` / `stale`
 */
export async function fetchSuggestedFees({ originChainId, destinationChainId, inputToken, outputToken, amount, recipient = null }) {
  assertEvmChainId(originChainId, 'origin')
  assertEvmChainId(destinationChainId, 'destination')
  // The R11b inversion, caught before it costs a network round trip: a destination equal to the
  // origin is a same-chain transfer wearing a bridge's clothes (the gateway rejects it too).
  if (originChainId === destinationChainId) {
    throw new BridgeQuoteUnavailable('a bridge destination must be a different network than its origin', { code: 'invalid_route' })
  }

  const query = new URLSearchParams({ destinationChainId: String(destinationChainId), inputToken, outputToken, amount })
  if (recipient) query.set('recipient', recipient)
  return getJson(`/v1/bridge/${originChainId}/quote?${query}`)
}

/** Base-unit decimal string, or null for anything we cannot read verbatim. Nothing is coerced. */
function uint(v) {
  if (typeof v === 'bigint') return v >= 0n ? v.toString() : null
  if (typeof v !== 'string') return null
  return /^\d{1,78}$/.test(v.trim()) ? v.trim() : null
}

/** One cost line. A missing figure is `available: false` with a null amount — never a zero (FR-007). */
function costLine(id, label, tipKey, amountRaw, tokenSymbol) {
  return Object.freeze({
    id,
    label,
    tipKey,
    amountRaw: amountRaw ?? null,
    tokenSymbol,
    available: amountRaw != null,
  })
}

/**
 * Assemble the member-facing `BridgeQuote` (data-model.md) from the gateway DTO and the platform-fee
 * split. Pure — no network, no clock beyond the `fetchedAt` it is handed — so the itemization and
 * staleness rules are testable without a fetch.
 *
 * Cost decomposition. Across defines `totalRelayFee` as the sum of its three legs and computes
 * `outputAmount` from it, so THAT figure is the total the member is charged and is served verbatim
 * rather than re-added here (re-adding could drift by a wei against what the chain does). The two
 * displayed protocol lines are:
 *   - destination delivery cost = `relayerGasFee` (paying for the fill on the far side);
 *   - bridge protocol fee       = `lpFee` + `relayerCapitalFee` (the protocol's own charge).
 * Either is dropped to unavailable when its leg is missing, and BOTH are dropped when the quote does
 * not reconcile (`net - totalRelayFee === outputAmount`) — an internally inconsistent breakdown is
 * exactly the kind of confident-looking wrong number this feature must never print. The total and
 * the amount received stay verbatim in that case, so the member still sees true headline figures.
 *
 * @param {{
 *   suggested: object,                       // gateway DTO
 *   inputAmount: string|bigint,              // GROSS the member pays, base units
 *   feeAmount?: string|bigint,               // platform fee skimmed from the gross (0 ⇒ no line)
 *   platformFeeBps?: number,
 *   tokenSymbol: string,
 *   decimals?: number|null,
 *   originChainId: number,
 *   destinationChainId: number,
 *   inputToken?: string|null,
 *   outputToken?: string|null,
 *   expectedFillSeconds?: number|null,       // route hint from BridgeRouter, used only as a fallback
 *   fetchedAt?: number,                      // ms epoch; defaults to now
 *   destinationNativeBalance?: bigint|string|number|null,  // null/undefined ⇒ unknown, not zero
 *   destinationDeliversGas?: boolean,        // true when the delivered asset IS the destination gas coin
 * }} params
 * @returns {object} BridgeQuote
 */
export function buildBridgeQuote({
  suggested,
  inputAmount,
  feeAmount = 0n,
  platformFeeBps = 0,
  tokenSymbol,
  decimals = null,
  originChainId,
  destinationChainId,
  inputToken = null,
  outputToken = null,
  expectedFillSeconds = null,
  fetchedAt = Date.now(),
  destinationNativeBalance = null,
  destinationDeliversGas = false,
}) {
  const gross = BigInt(inputAmount)
  const fee = BigInt(feeAmount)
  const bridgedAmount = gross - fee
  const totalRelayFee = uint(suggested?.totalRelayFee?.total)
  const outputAmount = uint(suggested?.outputAmount)
  if (totalRelayFee == null || outputAmount == null) {
    // The gateway only serves quotes carrying both, so this is a contract violation rather than a
    // member state — but a half-quote must still never reach a confirm screen.
    throw new BridgeQuoteUnavailable('the bridge protocol returned an unreadable quote', { code: 'upstream_malformed', retryable: true })
  }

  const reconciles = bridgedAmount - BigInt(totalRelayFee) === BigInt(outputAmount)
  const relayerGasFee = uint(suggested?.relayerGasFee?.total)
  const lpFee = uint(suggested?.lpFee?.total)
  const relayerCapitalFee = uint(suggested?.relayerCapitalFee?.total)
  const protocolFee = reconciles && lpFee != null && relayerCapitalFee != null ? (BigInt(lpFee) + BigInt(relayerCapitalFee)).toString() : null
  const deliveryCost = reconciles ? relayerGasFee : null

  const lines = [
    costLine(BRIDGE_QUOTE_LINE.BRIDGE_FEE, 'Bridge fee', 'bridgeFee', protocolFee, tokenSymbol),
    costLine(BRIDGE_QUOTE_LINE.DESTINATION_GAS, 'Delivery on the destination network', 'destinationGas', deliveryCost, tokenSymbol),
  ]
  // FR-029: a zero or unset rate renders NO fee line at all — not a line reading 0.00 — so the flow
  // is byte-identical to one with no fee configured. `fee > 0` (not `bps > 0`) is the right test:
  // a nonzero rate that floors to zero on a dust amount charges nothing, so it shows nothing.
  if (fee > 0n) {
    lines.push(costLine(BRIDGE_QUOTE_LINE.PLATFORM_FEE, 'FairWins fee', 'platformFee', fee.toString(), tokenSymbol))
  }

  // Every component of the total is verbatim or exact: Across's own total plus the fee we skim.
  const totalCostRaw = (BigInt(totalRelayFee) + fee).toString()

  // The window ends at whichever comes first: our display ceiling, or the deadline Across itself put
  // on the fill. Quoting past the fill deadline would offer a price the chain will refuse.
  const fillDeadlineMs = uint(suggested?.fillDeadline) != null ? Number(suggested.fillDeadline) * 1000 : null
  const expiresAt = fillDeadlineMs != null && fillDeadlineMs > fetchedAt
    ? Math.min(fetchedAt + QUOTE_VALIDITY_MS, fillDeadlineMs)
    : fetchedAt + QUOTE_VALIDITY_MS

  // FR-012. Only a KNOWN-zero balance warns; an unread balance stays null (unknown), because
  // "you will have no gas" is a claim we would be making up. Routes that deliver the destination's
  // own gas coin cannot strand a member, so they never warn. v1 has no gas-along-with-the-transfer
  // option to present — `bridgeWithFee` takes no such parameter — so there is no cost to state.
  let destinationGasWarning = null
  if (destinationDeliversGas) {
    destinationGasWarning = false
  } else if (destinationNativeBalance != null) {
    destinationGasWarning = BigInt(destinationNativeBalance) === 0n
  }

  return {
    originChainId,
    destinationChainId,
    inputToken: inputToken ?? suggested?.inputToken ?? null,
    outputToken: outputToken ?? suggested?.outputToken ?? null,
    tokenSymbol,
    decimals,
    /** GROSS the member pays. */
    inputAmount: gross.toString(),
    /** What reaches Across after the platform fee — the `depositV3` input amount. */
    bridgedAmount: bridgedAmount.toString(),
    /** What is expected to ARRIVE. Verbatim from Across; the only number that matters most. */
    outputAmount,
    lines,
    totalCostRaw,
    /** False ⇒ the headline figures are true but the breakdown is incomplete; say so, do not guess. */
    itemized: lines.every((l) => l.available),
    reconciles,
    /** The rate the member was shown; passed back as `maxFeeBps` so it is a hard ceiling (FR-028). */
    platformFeeBps,
    platformFeeRaw: fee > 0n ? fee.toString() : null,
    // Deposit arguments — not display values. They pin the quote to a block and bound the fill.
    quoteTimestamp: uint(suggested?.quoteTimestamp),
    fillDeadline: uint(suggested?.fillDeadline),
    exclusivityDeadline: uint(suggested?.exclusivityDeadline),
    exclusiveRelayer: suggested?.exclusiveRelayer ?? null,
    /** Across's own estimate first; the route's configured window only as a fallback (null = unknown). */
    estimatedFillSeconds: Number.isFinite(suggested?.estimatedFillSeconds) ? suggested.estimatedFillSeconds : (expectedFillSeconds ?? null),
    fetchedAt,
    expiresAt,
    destinationGasWarning,
    limits: suggested?.limits ?? null,
    isAmountTooLow: suggested?.isAmountTooLow === true,
    /** FR-014 — the third party that settles this, named on the quote itself. */
    settledBy: BRIDGE_SETTLEMENT.protocol,
  }
}

/** Past its validity window (FR-008): the confirm control is disabled until it is refreshed. */
export function isQuoteStale(quote, now = Date.now()) {
  if (!quote || typeof quote.expiresAt !== 'number') return true
  return now >= quote.expiresAt
}

/** Milliseconds left in the window, floored at 0 — drives the countdown and the refresh prompt. */
export function quoteMsRemaining(quote, now = Date.now()) {
  if (!quote || typeof quote.expiresAt !== 'number') return 0
  return Math.max(0, quote.expiresAt - now)
}

/**
 * The whole quote, end to end: live platform rate → fee split → Across quote on the NET → view model.
 *
 * Ordering matters and mirrors the contract. The fee is read FIRST because it determines the amount
 * Across is asked to price; quoting the gross and subtracting afterwards would show an arrival
 * figure the member will not get.
 *
 * Throws `BridgeQuoteUnavailable` for every failure class — including a FeeRouter that is deployed
 * but unreadable, which blocks the quote rather than assuming a zero rate (spec 060 FR-015). A
 * chain with no router deployed is different and honest: no fee, no fee line, pre-060 behavior.
 *
 * @param {{originChainId: number, destinationChainId: number, inputToken: string, outputToken: string,
 *   amount: string|bigint, tokenSymbol: string, decimals?: number|null, recipient?: string|null,
 *   provider: object, expectedFillSeconds?: number|null,
 *   destinationNativeBalance?: bigint|string|number|null, destinationDeliversGas?: boolean,
 *   now?: number}} params
 * @returns {Promise<object>} BridgeQuote
 */
export async function fetchBridgeQuote({
  originChainId,
  destinationChainId,
  inputToken,
  outputToken,
  amount,
  tokenSymbol,
  decimals = null,
  recipient = null,
  provider,
  expectedFillSeconds = null,
  destinationNativeBalance = null,
  destinationDeliversGas = false,
  now = Date.now(),
}) {
  assertEvmChainId(originChainId, 'origin')
  assertEvmChainId(destinationChainId, 'destination')

  const gross = BigInt(amount)
  if (gross <= 0n) {
    throw new BridgeQuoteUnavailable('bridge quote: amount must be greater than zero', { code: 'invalid_amount' })
  }

  let feeQuote
  try {
    feeQuote = await fetchFeeQuote({ serviceId: FEE_SERVICES.BRIDGE_TRANSFER, chainId: originChainId, provider })
  } catch (e) {
    // A router IS deployed here and we could not read the rate. Blocking is the only honest move:
    // proceeding would quote a rate we are not sure of and could undercharge the ceiling (FR-015).
    throw new BridgeQuoteUnavailable('the current platform fee could not be read', { code: 'fee_unavailable', retryable: true, cause: e })
  }

  const bps = feeQuote.available ? feeQuote.bps : 0
  const { feeAmount, netAmount } = splitFee(gross, bps)
  if (netAmount <= 0n) {
    throw new BridgeQuoteUnavailable('bridge quote: nothing would be left to bridge after the platform fee', { code: 'invalid_amount' })
  }

  const suggested = await fetchSuggestedFees({
    originChainId,
    destinationChainId,
    inputToken,
    outputToken,
    amount: netAmount.toString(),
    recipient,
  })

  return buildBridgeQuote({
    suggested,
    inputAmount: gross,
    feeAmount,
    platformFeeBps: bps,
    tokenSymbol,
    decimals,
    originChainId,
    destinationChainId,
    inputToken,
    outputToken,
    expectedFillSeconds,
    fetchedAt: now,
    destinationNativeBalance,
    destinationDeliversGas,
  })
}
