/**
 * Spec 067 T067 — bridge quote layer: itemization (FR-007), the validity window and staleness
 * (FR-008), the no-line-at-all rule for a zero platform rate (FR-029), the destination-gas
 * disclosure (FR-012), and the honest-unavailable taxonomy (FR-051/FR-053/FR-054).
 *
 * fetch is fully stubbed and the FeeRouter read is mocked — no network, no chain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BRIDGE_QUOTE_LINE,
  BridgeQuoteUnavailable,
  QUOTE_VALIDITY_MS,
  bridgeGatewayUrl,
  bridgeQuotingAvailable,
  buildBridgeQuote,
  fetchBridgeQuote,
  fetchSuggestedFees,
  isQuoteStale,
  quoteMsRemaining,
} from '../acrossQuotes'
import { fetchFeeQuote } from '../../fees/feeQuote'

vi.mock('../../fees/feeQuote', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchFeeQuote: vi.fn() }
})

const BASE = 'https://relayer.fairwins.example'
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const NOW = 1_800_000_000_000

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

/**
 * A coherent Across response for bridging 1,000.000000 USDC: 3.5 USDC total spread, split
 * 1.0 LP + 1.5 relayer capital + 1.0 relayer gas, so outputAmount = 996.5 exactly.
 */
const suggested = (over = {}) => ({
  outputAmount: '996500000',
  totalRelayFee: { pct: '3500000000000000', total: '3500000' },
  lpFee: { pct: '1000000000000000', total: '1000000' },
  relayerCapitalFee: { pct: '1500000000000000', total: '1500000' },
  relayerGasFee: { pct: '1000000000000000', total: '1000000' },
  estimatedFillSeconds: 42,
  quoteTimestamp: '1799999900',
  fillDeadline: '1800003600',
  exclusivityDeadline: '0',
  exclusiveRelayer: null,
  spokePoolAddress: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
  limits: { minDeposit: '1000000', maxDeposit: '100000000000' },
  isAmountTooLow: false,
  fetchedAt: new Date(NOW).toISOString(),
  stale: false,
  ...over,
})

/** The same coherent response re-based for a different NET amount handed to Across. */
const suggestedForNet = (net) => suggested({ outputAmount: (BigInt(net) - 3_500_000n).toString() })

const build = (over = {}) =>
  buildBridgeQuote({
    suggested: suggested(),
    inputAmount: '1000000000',
    tokenSymbol: 'USDC',
    decimals: 6,
    originChainId: 137,
    destinationChainId: 1,
    inputToken: USDC_POLYGON,
    outputToken: USDC_ETHEREUM,
    fetchedAt: NOW,
    ...over,
  })

const lineById = (quote, id) => quote.lines.find((l) => l.id === id)

beforeEach(() => {
  vi.stubEnv('VITE_RELAYER_URL', BASE)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('gateway configuration', () => {
  it('reads VITE_RELAYER_URL like the other gateway clients, trimming the trailing slash', () => {
    vi.stubEnv('VITE_RELAYER_URL', `${BASE}/`)
    expect(bridgeGatewayUrl()).toBe(BASE)
    vi.stubEnv('VITE_RELAYER_URL', '')
    expect(bridgeGatewayUrl()).toBe('')
  })

  it('an unconfigured gateway is a stated capability-off verdict, and never touches the network', async () => {
    vi.stubEnv('VITE_RELAYER_URL', '')
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const err = await fetchSuggestedFees({
      originChainId: 137,
      destinationChainId: 1,
      inputToken: USDC_POLYGON,
      outputToken: USDC_ETHEREUM,
      amount: '1000000',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(BridgeQuoteUnavailable)
    expect(err.code).toBe('unconfigured')
    expect(err.disabled).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('bridgeQuotingAvailable needs BOTH a configured gateway and a network the protocol is on', () => {
    expect(bridgeQuotingAvailable(137)).toBe(true)
    expect(bridgeQuotingAvailable(61)).toBe(false) // Ethereum Classic — no Across deployment (FR-006c)
    vi.stubEnv('VITE_RELAYER_URL', '')
    expect(bridgeQuotingAvailable(137)).toBe(false)
  })

  it('never lets a Bitcoin (string) network id reach a chain-keyed path', () => {
    expect(bridgeQuotingAvailable('bitcoin')).toBe(false)
  })
})

describe('fetchSuggestedFees', () => {
  it('quotes the origin chain in the path and the rest as query params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, suggested()))
    vi.stubGlobal('fetch', fetchImpl)
    await fetchSuggestedFees({
      originChainId: 137,
      destinationChainId: 1,
      inputToken: USDC_POLYGON,
      outputToken: USDC_ETHEREUM,
      amount: '1000000000',
      recipient: '0x1111111111111111111111111111111111111111',
    })
    const url = new URL(fetchImpl.mock.calls[0][0])
    expect(url.pathname).toBe('/v1/bridge/137/quote')
    expect(url.searchParams.get('destinationChainId')).toBe('1')
    expect(url.searchParams.get('inputToken')).toBe(USDC_POLYGON)
    expect(url.searchParams.get('amount')).toBe('1000000000')
    expect(url.searchParams.get('recipient')).toBe('0x1111111111111111111111111111111111111111')
  })

  it('omits recipient when the member has not chosen one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, suggested()))
    vi.stubGlobal('fetch', fetchImpl)
    await fetchSuggestedFees({ originChainId: 137, destinationChainId: 1, inputToken: USDC_POLYGON, outputToken: USDC_ETHEREUM, amount: '1' })
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.has('recipient')).toBe(false)
  })

  it('refuses a destination equal to the origin — that is a transfer, not a bridge (R11b)', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const err = await fetchSuggestedFees({
      originChainId: 137,
      destinationChainId: 137,
      inputToken: USDC_POLYGON,
      outputToken: USDC_POLYGON,
      amount: '1000000',
    }).catch((e) => e)
    expect(err.code).toBe('invalid_route')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a string (Bitcoin) chain id before it can reach the gateway or wagmi (FR-006)', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const err = await fetchSuggestedFees({
      originChainId: 'bitcoin',
      destinationChainId: 1,
      inputToken: USDC_POLYGON,
      outputToken: USDC_ETHEREUM,
      amount: '1000000',
    }).catch((e) => e)
    expect(err.code).toBe('unsupported_chain')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    [503, 'bridge_disabled', { disabled: true, retryable: false }],
    [503, 'upstream_unavailable', { disabled: false, retryable: true }],
    [429, 'quota_exceeded', { disabled: false, retryable: true }],
    [400, 'invalid_amount', { disabled: false, retryable: false }],
  ])('maps a %i %s body to a typed, actionable verdict', async (status, code, flags) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(status, { error: { code, reason: 'because' } })))
    const err = await fetchSuggestedFees({
      originChainId: 137,
      destinationChainId: 1,
      inputToken: USDC_POLYGON,
      outputToken: USDC_ETHEREUM,
      amount: '1000000',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(BridgeQuoteUnavailable)
    expect(err.code).toBe(code)
    expect(err.status).toBe(status)
    expect(err.disabled).toBe(flags.disabled)
    expect(err.retryable).toBe(flags.retryable)
    expect(err.message).toBe('because')
  })

  it('reports a transport failure as retryable rather than as a price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection reset')))
    const err = await fetchSuggestedFees({
      originChainId: 137,
      destinationChainId: 1,
      inputToken: USDC_POLYGON,
      outputToken: USDC_ETHEREUM,
      amount: '1000000',
    }).catch((e) => e)
    expect(err.code).toBe('network_error')
    expect(err.retryable).toBe(true)
  })
})

describe('buildBridgeQuote — itemization (FR-007)', () => {
  it('shows the amount that arrives verbatim and one labelled line per cost', () => {
    const quote = build({ suggested: suggestedForNet('995000000'), feeAmount: 5_000_000n, platformFeeBps: 50 })
    expect(quote.outputAmount).toBe('991500000')
    expect(quote.inputAmount).toBe('1000000000')
    // 1,000 USDC gross − 5 USDC platform fee = 995 handed to Across.
    expect(quote.bridgedAmount).toBe('995000000')
    expect(quote.lines.map((l) => l.id)).toEqual([
      BRIDGE_QUOTE_LINE.BRIDGE_FEE,
      BRIDGE_QUOTE_LINE.DESTINATION_GAS,
      BRIDGE_QUOTE_LINE.PLATFORM_FEE,
    ])
    // bridge protocol fee = LP + relayer capital; delivery = relayer gas.
    expect(lineById(quote, BRIDGE_QUOTE_LINE.BRIDGE_FEE).amountRaw).toBe('2500000')
    expect(lineById(quote, BRIDGE_QUOTE_LINE.DESTINATION_GAS).amountRaw).toBe('1000000')
    expect(lineById(quote, BRIDGE_QUOTE_LINE.PLATFORM_FEE).amountRaw).toBe('5000000')
    expect(quote.lines.every((l) => l.available && l.tokenSymbol === 'USDC' && l.label && l.tipKey)).toBe(true)
    expect(quote.itemized).toBe(true)
  })

  it('totals Across’s own spread plus the platform fee, and the lines add up to it', () => {
    const quote = build({ suggested: suggestedForNet('995000000'), feeAmount: 5_000_000n, platformFeeBps: 50 })
    expect(quote.totalCostRaw).toBe('8500000') // 3.5 bridge + 5 platform
    const summed = quote.lines.reduce((acc, l) => acc + BigInt(l.amountRaw), 0n)
    expect(summed.toString()).toBe(quote.totalCostRaw)
  })

  it('names the settling third party on the quote itself (FR-014)', () => {
    expect(build().settledBy).toBe('Across')
  })

  it('carries the deposit arguments through untouched', () => {
    const quote = build()
    expect(quote.quoteTimestamp).toBe('1799999900')
    expect(quote.fillDeadline).toBe('1800003600')
    expect(quote.exclusivityDeadline).toBe('0')
    expect(quote.estimatedFillSeconds).toBe(42)
  })

  it('falls back to the route’s configured window only when Across gives no estimate', () => {
    const noEstimate = suggested({ estimatedFillSeconds: null })
    expect(build({ suggested: noEstimate, expectedFillSeconds: 900 }).estimatedFillSeconds).toBe(900)
    // …and stays honestly unknown when neither source has one.
    expect(build({ suggested: noEstimate }).estimatedFillSeconds).toBeNull()
  })
})

describe('buildBridgeQuote — the platform fee line (FR-029)', () => {
  it('renders NO fee line at all at a zero rate — not a line reading 0.00', () => {
    const quote = build()
    expect(lineById(quote, BRIDGE_QUOTE_LINE.PLATFORM_FEE)).toBeUndefined()
    expect(quote.lines).toHaveLength(2)
    expect(quote.platformFeeRaw).toBeNull()
    expect(quote.platformFeeBps).toBe(0)
    // Behavior identical to no fee configured: the whole gross reaches Across.
    expect(quote.bridgedAmount).toBe(quote.inputAmount)
    expect(quote.totalCostRaw).toBe('3500000')
  })

  it('renders no fee line when a nonzero rate floors to nothing on a dust amount', () => {
    const quote = build({ feeAmount: 0n, platformFeeBps: 50 })
    expect(lineById(quote, BRIDGE_QUOTE_LINE.PLATFORM_FEE)).toBeUndefined()
    // The rate is still reported, because it is what travels back as the maxFeeBps ceiling.
    expect(quote.platformFeeBps).toBe(50)
  })
})

describe('buildBridgeQuote — a figure we do not have is unavailable, never zero (FR-054)', () => {
  it('marks a missing cost leg unavailable while keeping the headline figures exact', () => {
    const quote = build({ suggested: suggested({ relayerGasFee: null }) })
    const delivery = lineById(quote, BRIDGE_QUOTE_LINE.DESTINATION_GAS)
    expect(delivery.available).toBe(false)
    expect(delivery.amountRaw).toBeNull()
    expect(quote.itemized).toBe(false)
    expect(quote.outputAmount).toBe('996500000')
    expect(quote.totalCostRaw).toBe('3500000')
  })

  it('drops the whole breakdown when the legs do not reconcile with the total', () => {
    // outputAmount inconsistent with input − totalRelayFee: we cannot stand behind a breakdown.
    const quote = build({ suggested: suggested({ outputAmount: '990000000' }) })
    expect(quote.reconciles).toBe(false)
    expect(lineById(quote, BRIDGE_QUOTE_LINE.BRIDGE_FEE).available).toBe(false)
    expect(lineById(quote, BRIDGE_QUOTE_LINE.DESTINATION_GAS).available).toBe(false)
    expect(quote.itemized).toBe(false)
    expect(quote.outputAmount).toBe('990000000')
  })

  it('refuses to build a quote at all when the arrival amount or the total is missing', () => {
    expect(() => build({ suggested: suggested({ outputAmount: null }) })).toThrow(BridgeQuoteUnavailable)
    expect(() => build({ suggested: suggested({ totalRelayFee: null }) })).toThrow(/unreadable quote/)
  })
})

describe('validity window and staleness (FR-008)', () => {
  it('expires one window after it was fetched', () => {
    const quote = build()
    expect(quote.fetchedAt).toBe(NOW)
    expect(quote.expiresAt).toBe(NOW + QUOTE_VALIDITY_MS)
    expect(isQuoteStale(quote, NOW)).toBe(false)
    expect(isQuoteStale(quote, NOW + QUOTE_VALIDITY_MS - 1)).toBe(false)
    expect(isQuoteStale(quote, NOW + QUOTE_VALIDITY_MS)).toBe(true)
    expect(quoteMsRemaining(quote, NOW + 20_000)).toBe(QUOTE_VALIDITY_MS - 20_000)
    expect(quoteMsRemaining(quote, NOW + QUOTE_VALIDITY_MS + 5_000)).toBe(0)
  })

  it('never outlives the fill deadline Across itself set', () => {
    const deadline = Math.floor(NOW / 1000) + 10 // 10 s away — sooner than the display window
    const quote = build({ suggested: suggested({ fillDeadline: String(deadline) }) })
    expect(quote.expiresAt).toBe(deadline * 1000)
    expect(isQuoteStale(quote, deadline * 1000)).toBe(true)
  })

  it('treats a missing or malformed quote as stale — the confirm control stays disabled', () => {
    expect(isQuoteStale(null)).toBe(true)
    expect(isQuoteStale({}, NOW)).toBe(true)
    expect(quoteMsRemaining(null)).toBe(0)
  })
})

describe('destination gas disclosure (FR-012)', () => {
  it('warns only when the destination balance is KNOWN to be zero', () => {
    expect(build({ destinationNativeBalance: 0n }).destinationGasWarning).toBe(true)
    expect(build({ destinationNativeBalance: 12_000_000_000_000_000n }).destinationGasWarning).toBe(false)
  })

  it('stays unknown (null) rather than claiming the member has no gas when we could not read it', () => {
    expect(build().destinationGasWarning).toBeNull()
    expect(build({ destinationNativeBalance: null }).destinationGasWarning).toBeNull()
  })

  it('does not warn when the delivered asset IS the destination network’s gas coin', () => {
    expect(build({ destinationNativeBalance: 0n, destinationDeliversGas: true }).destinationGasWarning).toBe(false)
  })
})

describe('fetchBridgeQuote — fee first, then Across on the net', () => {
  const params = {
    originChainId: 137,
    destinationChainId: 1,
    inputToken: USDC_POLYGON,
    outputToken: USDC_ETHEREUM,
    amount: '1000000000',
    tokenSymbol: 'USDC',
    decimals: 6,
    provider: {},
    now: NOW,
  }

  it('quotes Across for the NET amount the router will actually forward', async () => {
    fetchFeeQuote.mockResolvedValue({ available: true, bps: 50, capBps: 250, routerAddress: '0xfee' })
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, suggestedForNet('995000000')))
    vi.stubGlobal('fetch', fetchImpl)

    const quote = await fetchBridgeQuote(params)

    // 1,000 USDC at 50 bps = 5 USDC fee ⇒ 995 quoted, not the 1,000 the member typed.
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('amount')).toBe('995000000')
    expect(fetchFeeQuote).toHaveBeenCalledWith(expect.objectContaining({ chainId: 137, provider: params.provider }))
    expect(quote.platformFeeBps).toBe(50)
    expect(quote.platformFeeRaw).toBe('5000000')
    expect(lineById(quote, BRIDGE_QUOTE_LINE.PLATFORM_FEE).amountRaw).toBe('5000000')
    expect(quote.expiresAt).toBe(NOW + QUOTE_VALIDITY_MS)
  })

  it('a chain with no FeeRouter behaves exactly as before the fee system existed', async () => {
    fetchFeeQuote.mockResolvedValue({ available: false, bps: 0, capBps: 0, routerAddress: null })
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, suggested()))
    vi.stubGlobal('fetch', fetchImpl)

    const quote = await fetchBridgeQuote(params)

    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('amount')).toBe('1000000000')
    expect(quote.lines).toHaveLength(2)
    expect(lineById(quote, BRIDGE_QUOTE_LINE.PLATFORM_FEE)).toBeUndefined()
  })

  it('blocks the quote when a deployed FeeRouter cannot be read — never assumes zero', async () => {
    fetchFeeQuote.mockRejectedValue(new Error('call revert exception'))
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const err = await fetchBridgeQuote(params).catch((e) => e)
    expect(err).toBeInstanceOf(BridgeQuoteUnavailable)
    expect(err.code).toBe('fee_unavailable')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a non-positive amount before any read', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const err = await fetchBridgeQuote({ ...params, amount: '0' }).catch((e) => e)
    expect(err.code).toBe('invalid_amount')
    expect(fetchFeeQuote).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses an amount the platform fee would consume entirely', async () => {
    fetchFeeQuote.mockResolvedValue({ available: true, bps: 10_000, capBps: 10_000, routerAddress: '0xfee' })
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const err = await fetchBridgeQuote({ ...params, amount: '100' }).catch((e) => e)
    expect(err.code).toBe('invalid_amount')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
