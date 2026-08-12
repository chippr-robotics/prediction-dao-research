/**
 * /v1/perps/* read-proxy tests (spec 082 — contracts/gateway-perps-api.md).
 * Venue upstreams are mocked via the injectable perpsFetch; fixtures mirror REAL payload shapes
 * captured from the venue APIs (research D2). Everything else uses the same
 * build-the-app-with-injected-deps pattern as polymarket.test.js.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import {
  isAddress,
  normalizeGainsPairs,
  normalizeGainsPendingOrders,
  normalizeGainsPositions,
  normalizeGmxPairs,
  normalizeHyperliquidPairs,
  normalizeHyperliquidPositions,
} from '../src/perps/normalize.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

const TRADER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const BTC_INDEX_TOKEN = '0x47904963fc8b2340414262125aF798B9655E58Cd'

// ---- upstream fixtures (real venue payload shapes, trimmed) -------------------------------------

// Gains /trading-variables: 1e10 percent/price fixed-point, 1e3 leverage, per-collateral markets.
const GAINS_TV = {
  pairs: [{ from: 'BTC', to: 'USD', spreadP: '100000000', groupIndex: '0', feeIndex: '13' }],
  groups: [{ name: 'crypto', minLeverage: '1100', maxLeverage: '200000' }],
  pairInfos: { maxLeverages: [0] },
  // Blocks a pending market order must age before cancelOrderAfterTimeout stops reverting.
  marketOrdersTimeoutBlocks: 200,
  collaterals: [
    {
      collateralIndex: '3',
      collateral: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
      symbol: 'USDC',
      isActive: true,
      prices: { collateralPriceUsd: 1.0 },
      collateralConfig: { precision: '1000000', decimals: 6 },
      pairOis: [
        {
          beforeV10: { long: '0', short: '0', max: '50750000000000000' },
          collateral: { oiLongCollateral: '5000000000', oiShortCollateral: '3000000000' },
          token: { oiLongToken: '0', oiShortToken: '0' },
        },
      ],
      fundingFees: {
        pairParams: [{ fundingFeesEnabled: true }],
        // percent per second at 1e18: 2e12/1e18 = 2e-6 %/s -> *3600/100 = 7.2e-5 fraction/hour
        pairData: [{ lastFundingRatePerSecondP: '2000000000000' }],
      },
    },
  ],
}
const GAINS_CHARTS = { time: TEST_NOW, opens: [63000] }
// Gains /open-trades/<addr>: tradeType 0 = open market position; 1 = resting limit order.
const GAINS_OPEN_TRADES = [
  {
    trade: {
      user: TRADER,
      index: '7',
      pairIndex: '0',
      leverage: '10000', // 10x
      long: true,
      isOpen: true,
      collateralIndex: '3',
      tradeType: '0',
      collateralAmount: '100000000', // 100 USDC
      openPrice: '630000000000000', // 63000 at 1e10
    },
  },
  { trade: { user: TRADER, index: '8', pairIndex: '0', leverage: '5000', long: false, isOpen: true, collateralIndex: '3', tradeType: '1', collateralAmount: '50000000', openPrice: '650000000000000' } },
]

// Gains /user-trading-variables/<addr> (spec 083): the member's pending market orders. Shape
// verified live against backend-arbitrum.gains.trade — entries are ITradingStorage.PendingOrder.
// THE INDEX TRAP: the entry's `index` is the PENDING-ORDER index (the only value
// cancelOrderAfterTimeout accepts); `trade.index` inside it is the TRADE index.
const gainsPendingTrade = (over = {}) => ({
  user: TRADER,
  index: '0',
  pairIndex: '0',
  leverage: '10000',
  long: true,
  isOpen: true,
  collateralIndex: '3',
  tradeType: '0',
  collateralAmount: '250000000', // 250 USDC
  openPrice: '630000000000000',
  ...over,
})
const GAINS_USER_TV = {
  pendingMarketOrdersIds: [
    { user: TRADER, index: '4' },
    { user: TRADER, index: '5' },
    { user: TRADER, index: '9' }, // an id the backend reported with no detail entry
  ],
  pendingMarketOrders: [
    // MARKET_OPEN: no trade exists yet, so trade.index is the venue's placeholder 0.
    { trade: gainsPendingTrade(), user: TRADER, index: '4', isOpen: true, orderType: 0, createdBlock: '493752800', maxSlippageP: '1000' },
    // MARKET_CLOSE of trade #7: this one DOES reference a stored trade.
    { trade: gainsPendingTrade({ index: '7', collateralAmount: '100000000' }), user: TRADER, index: '5', isOpen: true, orderType: 1, createdBlock: '493752810', maxSlippageP: '1000' },
    // Already resolved by the venue -> nothing to recover, dropped.
    { trade: gainsPendingTrade({ index: '3' }), user: TRADER, index: '6', isOpen: false, orderType: 0, createdBlock: '493752700', maxSlippageP: '1000' },
  ],
  collaterals: [{ balance: '1000000', allowance: '0', decimals: 6 }],
  referrer: '0x0000000000000000000000000000000000000000',
}

// GMX /markets/info + /prices/tickers + /tokens: 1e30 USD floats, prices at 10^(30-decimals).
const GMX_MARKETS = {
  markets: [
    {
      name: 'BTC/USD [WBTC.b-USDC]',
      marketToken: '0x47c031236e19d024b42f8AE6780E44A573170703',
      indexToken: BTC_INDEX_TOKEN,
      isListed: true,
      openInterestLong: '5000000000000000000000000000000000000', // $5M
      openInterestShort: '3000000000000000000000000000000000000', // $3M
      fundingRateLong: '43800000000000000000000000000', // 0.0438/yr -> 5e-6/hour
      fundingRateShort: '-46000000000000000000000000000',
      netRateLong: '84000000000000000000000000000',
      netRateShort: '-46000000000000000000000000000',
    },
    { name: 'SWAP-ONLY [USDC-DAI]', marketToken: '0x2', indexToken: '0x0000000000000000000000000000000000000000', isListed: true },
    { name: 'ETH/USD [WETH-USDC]', marketToken: '0x3', indexToken: '0x4', isListed: false },
  ],
}
const GMX_TICKERS = [
  // 63000 * 10^(30-8) = 6.3e26
  { tokenAddress: BTC_INDEX_TOKEN, tokenSymbol: 'BTC', minPrice: '629000000000000000000000000', maxPrice: '631000000000000000000000000' },
]
const GMX_TOKENS = { tokens: [{ symbol: 'BTC', address: BTC_INDEX_TOKEN, decimals: 8 }] }

// Hyperliquid metaAndAssetCtxs: decimal strings; funding already hourly; OI in base units.
const HL_META = [
  { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }, { name: 'DEAD', maxLeverage: 3, isDelisted: true }] },
  [
    { funding: '0.0000125', openInterest: '1000', prevDayPx: '62000', dayNtlVlm: '5000000', oraclePx: '63010', markPx: '63000', midPx: '63001' },
    { funding: '0.0001', openInterest: '5', markPx: '1', midPx: '1' },
  ],
]
const HL_CLEARINGHOUSE = {
  assetPositions: [
    {
      position: {
        coin: 'ETH',
        szi: '1.5',
        entryPx: '3000',
        positionValue: '4500',
        unrealizedPnl: '-50',
        marginUsed: '450',
        leverage: { type: 'cross', value: 10 },
      },
    },
    { position: { coin: 'SOL', szi: '0' } }, // flat -> dropped
  ],
}

// ---- injected fetch -----------------------------------------------------------------------------

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' })
const fail = () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' })

/**
 * Dispatches on URL/body like the real venues. `down` lists read keys to fail:
 * 'gains' (the whole venue) | 'gainsOpenTrades' | 'gainsUserTv' | 'gainsPricing' | 'gmx' |
 * 'hyperliquid'.
 */
function mockPerpsFetch({ down = [] } = {}) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, init })
    if (url.includes('gains.trade')) {
      if (url.includes('backend-pricing')) return down.includes('gainsPricing') ? fail() : ok(GAINS_CHARTS)
      if (down.includes('gains')) return fail()
      // Ordering matters: '/user-trading-variables/' also contains '/trading-variables'.
      if (url.includes('/user-trading-variables/')) return down.includes('gainsUserTv') ? fail() : ok(GAINS_USER_TV)
      if (url.includes('/trading-variables')) return ok(GAINS_TV)
      if (url.includes('/open-trades/')) return down.includes('gainsOpenTrades') ? fail() : ok(GAINS_OPEN_TRADES)
    }
    if (url.includes('gmxinfra')) {
      if (down.includes('gmx')) return fail()
      if (url.includes('/markets/info')) return ok(GMX_MARKETS)
      if (url.includes('/prices/tickers')) return ok(GMX_TICKERS)
      if (url.includes('/tokens')) return ok(GMX_TOKENS)
    }
    if (url.includes('hyperliquid')) {
      if (down.includes('hyperliquid')) return fail()
      const body = JSON.parse(init.body ?? '{}')
      if (body.type === 'metaAndAssetCtxs') return ok(HL_META)
      if (body.type === 'clearinghouseState') return ok(HL_CLEARINGHOUSE)
    }
    return fail()
  }
  impl.calls = calls
  return impl
}

const PERPS_ENV = {
  PERPS_ENABLED: 'true',
  // One gains chain keeps fixtures small; base/polygon are disabled via empty URLs.
  PERPS_GAINS_URL_BASE: '',
  PERPS_GAINS_URL_POLYGON: '',
  PERPS_GMX_REF_CODE: 'fairwins',
  PERPS_GAINS_REFERRER: '0x2222222222222222222222222222222222222222',
  PERPS_HL_BUILDER_ADDRESS: '0x3333333333333333333333333333333333333333',
  PERPS_HL_BUILDER_FEE_BPS: '5',
}

function build({ env = {}, perpsFetch = mockPerpsFetch(), killSwitch = createKillSwitch(false), noRouter = true } = {}) {
  const config = testConfig({ ...PERPS_ENV, ...env })
  // Most tests exercise the env-fallback fee path; the on-chain path is covered in fees.test.js.
  if (noRouter) config.feeRouter = { ...config.feeRouter, address: null }
  const clock = { t: TEST_NOW }
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => clock.t,
    killSwitch,
    perpsFetch,
  })
  return { app, config, clock, perpsFetch, killSwitch }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)

// ---- unit: normalize ----------------------------------------------------------------------------

describe('perps normalize', () => {
  it('validates addresses', () => {
    expect(isAddress(TRADER)).toBe(true)
    expect(isAddress('0x123')).toBe(false)
    expect(isAddress(null)).toBe(false)
  })

  it('normalizes gains pairs with SDK-verified scales', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    expect(pair.id).toBe('gains:42161:BTC/USD')
    expect(pair.venue).toBe('gains')
    expect(pair.chainId).toBe(42161)
    expect(pair.price).toBe(63000)
    expect(pair.maxLeverage).toBe(200) // group 200000 / 1e3
    expect(pair.openInterestUsd).toBeCloseTo(8000, 6) // (5000 + 3000) USDC at $1
    expect(pair.fundingRate).toBeCloseTo(7.2e-5, 12) // 2e-6 %/s * 3600 / 100
    expect(pair.fundingIntervalHours).toBe(1)
    expect(pair.volume24hUsd).toBeNull() // not exposed -> null, never 0
  })

  it('gains pairs stay honest without a price snapshot', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: null, chainId: 137 })
    expect(pair.price).toBeNull()
    expect(pair.openInterestUsd).toBeCloseTo(8000, 6) // collateral OI needs no pair price
  })

  it('normalizes gains open positions and skips resting orders', () => {
    const positions = normalizeGainsPositions({ openTrades: GAINS_OPEN_TRADES, tradingVariables: GAINS_TV, chainId: 42161 })
    expect(positions).toHaveLength(1) // the tradeType 1 limit order is exposure-free -> dropped
    const [p] = positions
    expect(p.symbol).toBe('BTC/USD')
    expect(p.direction).toBe('long')
    expect(p.leverage).toBe(10)
    expect(p.collateralUsd).toBeCloseTo(100, 6)
    expect(p.sizeUsd).toBeCloseTo(1000, 6)
    expect(p.entryPrice).toBe(63000)
    expect(p.unrealizedPnlUsd).toBeNull()
  })

  it('carries a venue ref on gains positions: the TRADE index plus the collateral scale', () => {
    const [p] = normalizeGainsPositions({ openTrades: GAINS_OPEN_TRADES, tradingVariables: GAINS_TV, chainId: 42161 })
    expect(p.venueRef).toEqual({
      venue: 'gains',
      chainId: 42161,
      tradeIndex: 7,
      pairIndex: 0,
      collateralIndex: 3,
      collateralToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      collateralDecimals: 6,
      // Exact decimal string: 10**18 collaterals exceed the float range where a JSON round-trip is
      // guaranteed exact, and collateralAmount is in the token's own decimals, never 1e18.
      collateralPrecision: '1000000',
    })
    // The two index spaces can never be confused because neither is a bare `index`.
    expect(Object.keys(p.venueRef)).not.toContain('index')
    expect(p.venueRef.pendingOrderIndex).toBeUndefined()
  })

  it('normalizes gains pending orders and keeps the two index spaces distinct', () => {
    const orders = normalizeGainsPendingOrders({
      userTradingVariables: GAINS_USER_TV,
      tradingVariables: GAINS_TV,
      chainId: 42161,
    })
    const byIndex = new Map(orders.map((o) => [o.venueRef.pendingOrderIndex, o]))
    expect([...byIndex.keys()].sort()).toEqual([4, 5, 9]) // #6 already resolved -> dropped

    const open = byIndex.get(4)
    expect(open.orderType).toBe(0)
    expect(open.orderTypeName).toBe('MARKET_OPEN')
    expect(open.symbol).toBe('BTC/USD')
    expect(open.direction).toBe('long')
    expect(open.createdBlock).toBe(493752800)
    expect(open.timeoutBlocks).toBe(200) // venue-reported, never a hardcoded per-chain constant
    // Pre-execution values are labelled requested, never presented as the position's actual state.
    expect(open.requestedCollateralUsd).toBeCloseTo(250, 6)
    expect(open.requestedLeverage).toBe(10)
    expect(open.requestedSizeUsd).toBeCloseTo(2500, 6)
    expect(open.requestedPrice).toBe(63000)
    expect(open.sizeUsd).toBeUndefined() // nothing here may read as executed state
    // THE TRAP: a MARKET_OPEN order has no trade yet — trade.index is the venue's placeholder 0,
    // and publishing it would hand the client a live handle to the member's trade #0.
    expect(open.venueRef.tradeIndex).toBeNull()
    expect(open.venueRef.pendingOrderIndex).toBe(4)
    expect(open.venueRef.collateralDecimals).toBe(6)
    expect(Object.keys(open.venueRef)).not.toContain('index')

    // A MARKET_CLOSE acts on a stored trade, so both handles are present and distinctly named.
    const close = byIndex.get(5)
    expect(close.orderTypeName).toBe('MARKET_CLOSE')
    expect(close.venueRef.pendingOrderIndex).toBe(5)
    expect(close.venueRef.tradeIndex).toBe(7)
    expect(close.venueRef.pendingOrderIndex).not.toBe(close.venueRef.tradeIndex)
  })

  it('still exposes an id-only pending order — a recovery handle is never invisible', () => {
    const [bare] = normalizeGainsPendingOrders({
      userTradingVariables: GAINS_USER_TV,
      tradingVariables: GAINS_TV,
      chainId: 42161,
    }).filter((o) => o.venueRef.pendingOrderIndex === 9)
    expect(bare.venueRef.pendingOrderIndex).toBe(9)
    expect(bare.venueRef.tradeIndex).toBeNull()
    // Everything the backend did not report stays null — never 0, which is a real index here.
    expect(bare.orderType).toBeNull()
    expect(bare.orderTypeName).toBeNull()
    expect(bare.createdBlock).toBeNull()
    expect(bare.requestedSizeUsd).toBeNull()
    expect(bare.symbol).toBeNull()
  })

  it('normalizes pending orders without trading variables (recovery is never gated on a second read)', () => {
    const orders = normalizeGainsPendingOrders({
      userTradingVariables: GAINS_USER_TV,
      tradingVariables: null,
      chainId: 42161,
    })
    expect(orders).toHaveLength(3)
    const open = orders.find((o) => o.venueRef.pendingOrderIndex === 4)
    expect(open.venueRef.pendingOrderIndex).toBe(4) // the handle survives
    expect(open.symbol).toBe('pair #0') // no pair table -> named by index, not invented
    expect(open.timeoutBlocks).toBeNull()
    expect(open.requestedCollateralUsd).toBeNull() // no collateral scale -> null, never 0
    expect(open.venueRef.collateralDecimals).toBeNull()
    expect(open.venueRef.collateralIndex).toBe(3) // straight off the order, no lookup needed
  })

  it('returns no pending orders for a member with none', () => {
    expect(
      normalizeGainsPendingOrders({
        userTradingVariables: { pendingMarketOrdersIds: [], pendingMarketOrders: [] },
        tradingVariables: GAINS_TV,
        chainId: 42161,
      }),
    ).toEqual([])
  })

  it('normalizes gmx pairs, dropping swap-only and unlisted markets', () => {
    const pairs = normalizeGmxPairs({ marketsInfo: GMX_MARKETS, tickers: GMX_TICKERS, tokens: GMX_TOKENS, chainId: 42161 })
    expect(pairs).toHaveLength(1)
    const [pair] = pairs
    expect(pair.symbol).toBe('BTC/USD')
    expect(pair.variant).toBe('WBTC.b-USDC')
    expect(pair.price).toBeCloseTo(63000, 6) // mid of min/max at 10^(30-8)
    expect(pair.openInterestUsd).toBeCloseTo(8_000_000, 0) // (5e36 + 3e36) / 1e30
    expect(pair.fundingRate).toBeCloseTo(0.0438 / 8760, 12) // annualized 1e30 -> hourly
    expect(pair.maxLeverage).toBeNull() // not exposed by the REST API -> null
  })

  it('normalizes hyperliquid pairs and skips delisted assets', () => {
    const pairs = normalizeHyperliquidPairs({ metaAndAssetCtxs: HL_META })
    expect(pairs).toHaveLength(1)
    const [pair] = pairs
    expect(pair.id).toBe('hyperliquid:BTC')
    expect(pair.chainId).toBeNull() // non-EVM venue (FR-012)
    expect(pair.price).toBe(63001) // midPx preferred
    expect(pair.fundingRate).toBe(0.0000125) // already hourly
    expect(pair.openInterestUsd).toBeCloseTo(63_000_000, 0) // 1000 BTC * markPx
    expect(pair.maxLeverage).toBe(40)
    expect(pair.volume24hUsd).toBe(5_000_000)
  })

  it('normalizes hyperliquid positions and drops flat entries', () => {
    const positions = normalizeHyperliquidPositions({ clearinghouseState: HL_CLEARINGHOUSE })
    expect(positions).toHaveLength(1)
    const [p] = positions
    expect(p.direction).toBe('long')
    expect(p.sizeUsd).toBe(4500)
    expect(p.unrealizedPnlUsd).toBe(-50)
    expect(p.leverage).toBe(10)
  })
})

// ---- routes -------------------------------------------------------------------------------------

describe('GET /v1/perps/pairs', () => {
  it('merges pairs across venues with per-venue sources', async () => {
    const { app } = build()
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(200)
    const venues = new Set(res.body.pairs.map((p) => p.venue))
    expect(venues).toEqual(new Set(['gains', 'gmx', 'hyperliquid']))
    expect(res.body.sources.gains).toMatchObject({ status: 'read', chains: [42161] })
    expect(res.body.sources.gmx).toMatchObject({ status: 'read', chains: [42161] })
    expect(res.body.sources.hyperliquid).toMatchObject({ status: 'read', chains: [] })
  })

  it('isolates a venue outage: degraded venue contributes no rows, others render', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['hyperliquid'] }) })
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(200)
    expect(res.body.sources.hyperliquid.status).toBe('degraded')
    expect(res.body.pairs.some((p) => p.venue === 'hyperliquid')).toBe(false)
    expect(res.body.pairs.some((p) => p.venue === 'gains')).toBe(true)
    expect(res.body.pairs.some((p) => p.venue === 'gmx')).toBe(true)
  })

  it('answers 503 perps_unconfigured when the module is disabled', async () => {
    const { app } = build({ env: { PERPS_ENABLED: 'false' } })
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('perps_unconfigured')
  })

  it('answers 503 killswitch_active under the ops killswitch', async () => {
    const { app } = build({ killSwitch: createKillSwitch(true) })
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('killswitch_active')
  })

  it('answers 503 perps_killed under the MODULE killswitch (PERPS_KILLSWITCH)', async () => {
    const { app } = build({ env: { PERPS_KILLSWITCH: 'true' } })
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('perps_killed')
  })

  it('answers 502 upstream_failed when EVERY venue fails — never 200 with empty rows', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['gains', 'gainsPricing', 'gmx', 'hyperliquid'] }) })
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_failed')
  })

  it('enforces the read quota with Retry-After', async () => {
    const { app } = build({ env: { PERPS_QUOTA_PER_IP: '1' } })
    expect((await get(app, '/v1/perps/pairs')).status).toBe(200)
    const res = await get(app, '/v1/perps/pairs')
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('quota_exceeded')
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('serves within-TTL cache without refetching', async () => {
    const { app, perpsFetch } = build()
    await get(app, '/v1/perps/pairs')
    const callsAfterFirst = perpsFetch.calls.length
    await get(app, '/v1/perps/pairs')
    expect(perpsFetch.calls.length).toBe(callsAfterFirst) // all venue reads cached
  })
})

describe('GET /v1/perps/positions', () => {
  it('returns per-venue positions for a valid address (gmx honestly absent)', async () => {
    const { app } = build()
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    expect(res.body.positions.some((p) => p.venue === 'gains')).toBe(true)
    expect(res.body.positions.some((p) => p.venue === 'hyperliquid')).toBe(true)
    // GMX positions are not readable via REST this release — absent from sources, never faked.
    expect(res.body.sources.gmx).toBeUndefined()
    expect(res.body.sources.gains.status).toBe('read')
    expect(res.body.sources.hyperliquid.status).toBe('read')
  })

  it('carries venue refs through the route so the client can act on a position', async () => {
    const { app } = build()
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    const gains = res.body.positions.find((p) => p.venue === 'gains')
    expect(gains.venueRef).toMatchObject({ venue: 'gains', chainId: 42161, tradeIndex: 7, collateralDecimals: 6 })
    // Display fields the phase-0 UI depends on are untouched.
    expect(gains).toMatchObject({ symbol: 'BTC/USD', direction: 'long', leverage: 10, entryPrice: 63000 })
  })

  it('serves the member pending orders alongside positions, per gains chain', async () => {
    const { app } = build()
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    expect(res.body.pendingOrders.map((o) => o.venueRef.pendingOrderIndex).sort()).toEqual([4, 5, 9])
    expect(res.body.pendingOrders.every((o) => o.venue === 'gains' && o.chainId === 42161)).toBe(true)
    // The recovery facet reports its own chain list: absent here would mean "unknown", not "none".
    expect(res.body.sources.gains.pendingOrderChains).toEqual([42161])
  })

  it('serves pending orders even when the positions read is down — exits are never gated', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['gainsOpenTrades', 'hyperliquid'] }) })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    // Every venue's POSITION read failed, yet a stuck order must never be buried behind a 502.
    expect(res.status).toBe(200)
    expect(res.body.positions).toEqual([])
    expect(res.body.sources.gains).toMatchObject({ status: 'degraded', chains: [], pendingOrderChains: [42161] })
    expect(res.body.pendingOrders.length).toBeGreaterThan(0)
  })

  it('reports pending orders as unknown (not empty) when only that read fails', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['gainsUserTv'] }) })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    expect(res.body.positions.some((p) => p.venue === 'gains')).toBe(true)
    expect(res.body.pendingOrders).toEqual([])
    // 42161 read positions but NOT pending orders — the empty array is not a claim about that chain.
    expect(res.body.sources.gains).toMatchObject({ status: 'read', chains: [42161], pendingOrderChains: [] })
  })

  it('rejects a malformed address', async () => {
    const { app } = build()
    const res = await get(app, '/v1/perps/positions?address=nope')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_address')
  })

  it('degrades one venue without blanking the other', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['gains'] }) })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    expect(res.body.sources.gains.status).toBe('degraded')
    expect(res.body.positions.some((p) => p.venue === 'gains')).toBe(false)
    expect(res.body.positions.some((p) => p.venue === 'hyperliquid')).toBe(true)
  })

  it('answers 502 upstream_failed when every venue read fails — empty positions must mean "none exist"', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['gains', 'gainsPricing', 'hyperliquid'] }) })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_failed')
  })
})

describe('GET /v1/perps/config', () => {
  it('serves public attribution + the env-fallback builder fee with its cap', async () => {
    const { app } = build()
    const res = await get(app, '/v1/perps/config')
    expect(res.status).toBe(200)
    expect(res.body.attribution).toEqual({
      gains: { referrer: '0x2222222222222222222222222222222222222222' },
      gmx: { refCode: 'fairwins' },
      hyperliquid: { builderAddress: '0x3333333333333333333333333333333333333333' },
    })
    expect(res.body.hyperliquidBuilderFee).toEqual({ bps: 5, capBps: 10, source: 'env-fallback' })
  })
})

describe('perps config boot validation', () => {
  it('fails boot loudly when the HL builder fee exceeds the 10 bps venue cap', () => {
    expect(() => testConfig({ ...PERPS_ENV, PERPS_HL_BUILDER_FEE_BPS: '11' })).toThrow(/10 bps/)
  })

  it('fails boot loudly on a malformed referral code', () => {
    expect(() => testConfig({ ...PERPS_ENV, PERPS_GMX_REF_CODE: 'not ok!' })).toThrow(/PERPS_GMX_REF_CODE/)
  })

  it('accepts the fee at exactly the cap and disables cleanly', () => {
    expect(() => testConfig({ ...PERPS_ENV, PERPS_HL_BUILDER_FEE_BPS: '10' })).not.toThrow()
    // Disabled: no validation, no throw, routes fail closed instead.
    expect(() => testConfig({ PERPS_ENABLED: 'false', PERPS_HL_BUILDER_FEE_BPS: '11' })).not.toThrow()
  })
})

describe('/status perps block', () => {
  it('reports venue + attribution configuration (no member data)', async () => {
    const { app } = build()
    const res = await request(app).get('/status')
    expect(res.status).toBe(200)
    expect(res.body.perps).toMatchObject({
      enabled: true,
      venues: { gains: [42161], gmx: true, hyperliquid: true },
      attribution: { gains: true, gmx: true, hyperliquid: true },
    })
  })

  it('reports enabled:false under the module killswitch (honest liveness)', async () => {
    const { app } = build({ env: { PERPS_KILLSWITCH: 'true' } })
    const res = await request(app).get('/status')
    expect(res.status).toBe(200)
    expect(res.body.perps.enabled).toBe(false)
  })
})
