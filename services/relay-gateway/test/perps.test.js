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
  HL_DEFAULT_DEX,
  isAddress,
  normalizeGainsPairs,
  normalizeGainsPendingOrders,
  normalizeGainsPositions,
  normalizeGmxPairs,
  normalizeHyperliquidDexes,
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
  /**
   * The venue's own fee table, indexed by `pairs[].feeIndex`. CAPTURED VERBATIM from the live
   * https://backend-arbitrum.gains.trade/trading-variables payload on 2026-08-12 — entries 0, 1 and
   * 13, at the raw scales the backend serves (never pre-divided, which is the point of the test).
   *
   * The relation between the two numbers is the venue's own and was checked on chain the same day:
   * `totalPositionSizeFeeP / 1e12 × minPositionSizeUsd / 1e3` equals `pairMinFeeUsd(pairIndex)` on
   * the Arbitrum diamond exactly — 0.00035 × 285.715 = $0.10000025 = 100000250000000000 / 1e18.
   */
  fees: [
    { totalPositionSizeFeeP: '600000000', totalLiqCollateralFeeP: '100000000000', oraclePositionSizeFeeP: '0', minPositionSizeUsd: '166667' },
    { totalPositionSizeFeeP: '120000000', totalLiqCollateralFeeP: '100000000000', oraclePositionSizeFeeP: '0', minPositionSizeUsd: '833334' },
    ...Array.from({ length: 11 }, () => null), // indices 2–12, unused by this fixture's one pair
    // BTC/USD's own entry — feeIndex 13, the 0.035% gTrade publishes for it.
    { totalPositionSizeFeeP: '350000000', totalLiqCollateralFeeP: '100000000000', oraclePositionSizeFeeP: '0', minPositionSizeUsd: '285715' },
  ],
  globalTradeFeeParams: { referralFeeP: '5000', govFeeP: '84999', triggerOrderFeeP: '0', gnsOtcFeeP: '1', gTokenFeeP: '15000' },
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
const WBTC_B = '0x3f770Ac673856F105b586bb393d122721265aD46'
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const GMX_MARKETS = {
  markets: [
    {
      name: 'BTC/USD [WBTC.b-USDC]',
      marketToken: '0x47c031236e19d024b42f8AE6780E44A573170703',
      indexToken: BTC_INDEX_TOKEN,
      // The market's accepted collateral (spec 083 US3) — the only two tokens GMX takes here.
      longToken: WBTC_B,
      shortToken: USDC_ARB,
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
  // 1 USDC = 10^(30-6) = 1e24. GMX prices its own collateral; nothing assumes a $1 peg.
  { tokenAddress: USDC_ARB, tokenSymbol: 'USDC', minPrice: '1000000000000000000000000', maxPrice: '1000000000000000000000000' },
]
const GMX_TOKENS = {
  tokens: [
    { symbol: 'BTC', address: BTC_INDEX_TOKEN, decimals: 8 },
    { symbol: 'WBTC.b', address: WBTC_B, decimals: 8 },
    { symbol: 'USDC', address: USDC_ARB, decimals: 6 },
  ],
}

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

/**
 * HIP-3 perp dexes. The FIRST element is a bare `null` — Hyperliquid's own encoding for the
 * first/default dex, whose name is the empty string — and every other element names a
 * validator-operated book. Shape captured from the venue's documented `perpDexs` response; the
 * live list held 10 entries on 2026-08-12 (hyperliquid-decision.md §5.2).
 */
const HL_PERP_DEXS = [
  null,
  { name: 'xyz', fullName: 'xyz dex', deployer: '0x5e89b26d8d66da9888c835c9bfcc2aa51813e152' },
  { name: 'hyna', fullName: 'hyna dex', deployer: '0x5e89b26d8d66da9888c835c9bfcc2aa51813e152' },
]

/** The `xyz` dex lists its own BTC market — the same symbol the default dex lists. */
const HL_META_XYZ = [
  { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 20 }] },
  [{ funding: '0.00002', openInterest: '10', markPx: '62900', midPx: '62950', dayNtlVlm: '10000' }],
]

/**
 * A member with a BTC LONG on `xyz` and nothing on the default dex — the measured case that made
 * FairWins render "No open perp positions found for this account." The direction matches the
 * default dex's ETH long only in side, not in coin; the collision fixture below is the same coin.
 */
const HL_CLEARINGHOUSE_XYZ = {
  assetPositions: [
    {
      position: {
        coin: 'BTC',
        szi: '0.5',
        entryPx: '62000',
        positionValue: '31000',
        unrealizedPnl: '450',
        marginUsed: '3100',
        leverage: { type: 'cross', value: 10 },
      },
    },
  ],
}

/** `hyna` holds the SAME coin and side as the default dex's row — the id-collision case. */
const HL_CLEARINGHOUSE_HYNA = {
  assetPositions: [
    {
      position: {
        coin: 'ETH',
        szi: '2',
        entryPx: '3100',
        positionValue: '6200',
        unrealizedPnl: '25',
        marginUsed: '620',
        leverage: { type: 'cross', value: 10 },
      },
    },
  ],
}

const HL_BY_DEX = {
  '': { meta: HL_META, clearinghouse: HL_CLEARINGHOUSE },
  xyz: { meta: HL_META_XYZ, clearinghouse: HL_CLEARINGHOUSE_XYZ },
  hyna: { meta: HL_META, clearinghouse: HL_CLEARINGHOUSE_HYNA },
}

// ---- injected fetch -----------------------------------------------------------------------------

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' })
const fail = () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' })

/**
 * Dispatches on URL/body like the real venues. `down` lists read keys to fail:
 * 'gains' (the whole venue) | 'gainsOpenTrades' | 'gainsUserTv' | 'gainsPricing' | 'gmx' |
 * 'hyperliquid' | 'hlPerpDexs' (discovery only) | 'hlDex:<name>' (one perp dex only).
 *
 * The Hyperliquid branch dispatches on the request's `dex` field the way the venue does — a read
 * with no `dex` answers for the FIRST dex, which is the behaviour that produced the fabricated
 * absence this fixture set exists to prove is gone.
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
      if (body.type === 'perpDexs') return down.includes('hlPerpDexs') ? fail() : ok(HL_PERP_DEXS)
      // The venue's own default: an omitted `dex` is the first perp dex.
      const dex = typeof body.dex === 'string' ? body.dex : ''
      if (down.includes(`hlDex:${dex}`)) return fail()
      const book = HL_BY_DEX[dex]
      if (!book) return fail()
      if (body.type === 'metaAndAssetCtxs') return ok(book.meta)
      if (body.type === 'clearinghouseState') return ok(book.clearinghouse)
    }
    return fail()
  }
  impl.calls = calls
  return impl
}

/** Every Hyperliquid `/info` body this run sent, in order — for the "did we scope the read" checks. */
function hlBodies(perpsFetch) {
  return perpsFetch.calls
    .filter((c) => c.url.includes('hyperliquid'))
    .map((c) => JSON.parse(c.init.body ?? '{}'))
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

  /* ------------------------------------------------------------------------------------------ *
   * Spec 083 US3 — the handles the OPEN path needs.
   *
   * These are not display fields, and the failure they prevent is not a cosmetic one: without a
   * pair index and a collateral list the open sheet has nothing to build calldata from, so the
   * whole surface would be a control that cannot submit. Each assertion below pins the exact value
   * a wrong one would substitute — a 0 index (someone else's market), a symbol instead of an index,
   * a collateral with unknown decimals (an order for the wrong size).
   * ------------------------------------------------------------------------------------------ */

  it('publishes the gains pair index — the venue’s own handle, not a name', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    // The FIRST pair is index 0, which is a real market on this venue — so the field must be
    // present and 0, never absent, and never coerced to null by an "is it truthy" test.
    expect(pair.pairIndex).toBe(0)
    expect(Object.prototype.hasOwnProperty.call(pair, 'pairIndex')).toBe(true)
  })

  it('publishes the gains collateral set with the venue’s own 1-based index and decimals', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    expect(pair.collaterals).toEqual([
      {
        symbol: 'USDC',
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6,
        collateralIndex: 3,
        usdPrice: 1,
      },
    ])
    // The index is the venue's, not the array position: reading it off the array would name
    // collateral #0, which is not a collateral at all on a 1-based venue.
    expect(pair.collaterals[0].collateralIndex).not.toBe(0)
  })

  /* ------------------------------------------------------------------------------------------ *
   * The venue's OWN fee, and the minimum it actually enforces (spec 083)
   *
   * Until this shipped the confirm step showed FairWins' fee in money and the venue's as '—', which
   * reads as "FairWins is what this costs". These tests pin the two scales that make the number
   * real, the floor that makes it honest on small positions, and the one field that is deliberately
   * NULL because publishing it would refuse orders the venue would fill.
   * ------------------------------------------------------------------------------------------ */

  it('publishes the gains trading fee as a RATE, at the two scales the venue serves', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    // 350000000 / 1e12 — a FRACTION of position size, i.e. gTrade's published 0.035% for BTC. The
    // /1e12 is 1e10 (the venue's percent scale) × 100 (percent → fraction); using 1e10 alone would
    // publish a rate 100× too large and every disclosure built on it would be wrong by that much.
    expect(pair.venueFee.openRate).toBeCloseTo(0.00035, 12)
    // Gains charges the same rate on the way out (`getClosingFee` delegates to the same function).
    expect(pair.venueFee.closeRate).toBe(pair.venueFee.openRate)
    // 285715 / 1e3 — dollars, not the 1e10 the prices on this payload use.
    expect(pair.venueFee.feeFloorNotionalUsd).toBeCloseTo(285.715, 9)
    // The venue's own pairMinFeeUsd: 0.00035 × 285.715, which the Arbitrum diamond returns as
    // 100000250000000000 (1e18) for pair 0.
    expect(pair.venueFee.minFeeUsd).toBeCloseTo(0.10000025, 12)
    // A published rate is not a quote, and the DTO says which it is so a consumer cannot present
    // one as the other.
    expect(pair.venueFee.basis).toBe('published-rate')
  })

  it('resolves the fee through the pair’s OWN feeIndex, not its position in the list', () => {
    // The fixture's single pair is at index 0 and carries feeIndex 13. A normalizer that read
    // `fees[0]` would publish 0.06% / $166.67 — a different market's fee, silently.
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    expect(pair.venueFee.openRate).not.toBeCloseTo(0.0006, 12)
    const eur = normalizeGainsPairs({
      tradingVariables: { ...GAINS_TV, pairs: [{ from: 'EUR', to: 'USD', groupIndex: '1', feeIndex: '1' }] },
      chartPrices: null,
      chainId: 42161,
    })[0]
    expect(eur.venueFee.openRate).toBeCloseTo(0.00012, 12)
    expect(eur.venueFee.feeFloorNotionalUsd).toBeCloseTo(833.334, 9)
  })

  it('publishes the collateral minimum gains actually enforces — 5× the pair’s minimum fee', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    // `openTrade` reverts InsufficientCollateral below this (gTrade v9 changelog). Small, but it is
    // the venue's own bound and a member should meet it before paying gas to be told.
    expect(pair.minCollateralUsd).toBeCloseTo(0.50000125, 10)
  })

  it('publishes NO minimum notional for gains, because since v9 the venue has none', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    // `minPositionSizeUsd` is the FEE FLOOR, not a minimum size: gTrade v9 removed the
    // BelowMinPositionSizeUsd check outright. Publishing $285.72 as a minimum here would refuse a
    // $100 BTC position the venue would happily fill — a dead control built from a real number
    // read as the wrong fact. The field is present-and-null so a consumer can tell that apart from
    // a gateway that predates it.
    expect(pair.minNotional).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(pair, 'minNotional')).toBe(true)
  })

  it('leaves the fee null — never zero — when the venue does not describe the pair’s fee', () => {
    const cases = {
      'no fees table at all': { ...GAINS_TV, fees: undefined },
      'a feeIndex past the end of it': { ...GAINS_TV, pairs: [{ ...GAINS_TV.pairs[0], feeIndex: '99' }] },
      'no feeIndex on the pair': { ...GAINS_TV, pairs: [{ from: 'BTC', to: 'USD', groupIndex: '0' }] },
      'an entry with no rate in it': { ...GAINS_TV, fees: [...GAINS_TV.fees.slice(0, 13), { minPositionSizeUsd: '285715' }] },
    }
    for (const [why, tradingVariables] of Object.entries(cases)) {
      const [pair] = normalizeGainsPairs({ tradingVariables, chartPrices: GAINS_CHARTS, chainId: 42161 })
      expect(pair.venueFee, why).toBeNull()
      // A null fee must not leave a fabricated minimum behind it.
      expect(pair.minCollateralUsd, why).toBeNull()
    }
  })

  it('keeps a fee whose floor the venue omitted — a rate is still a rate without one', () => {
    const tradingVariables = {
      ...GAINS_TV,
      fees: [...GAINS_TV.fees.slice(0, 13), { totalPositionSizeFeeP: '350000000', minPositionSizeUsd: '0' }],
    }
    const [pair] = normalizeGainsPairs({ tradingVariables, chartPrices: GAINS_CHARTS, chainId: 42161 })
    expect(pair.venueFee.openRate).toBeCloseTo(0.00035, 12)
    expect(pair.venueFee.feeFloorNotionalUsd).toBeNull()
    // No floor ⇒ no minimum fee ⇒ nothing to derive a collateral minimum from. Null, not 0.
    expect(pair.venueFee.minFeeUsd).toBeNull()
    expect(pair.minCollateralUsd).toBeNull()
  })

  it('keeps a ZERO rate as an answer, distinct from an absent one', () => {
    const tradingVariables = {
      ...GAINS_TV,
      fees: [...GAINS_TV.fees.slice(0, 13), { totalPositionSizeFeeP: '0', minPositionSizeUsd: '285715' }],
    }
    const [pair] = normalizeGainsPairs({ tradingVariables, chartPrices: GAINS_CHARTS, chainId: 42161 })
    // "This pair costs nothing to open" is a publishable fact and must not collapse into the null
    // that means "we could not find out".
    expect(pair.venueFee.openRate).toBe(0)
    expect(pair.venueFee.minFeeUsd).toBe(0)
    expect(pair.minCollateralUsd).toBe(0)
  })

  it('reports GMX’s fee and minimums as null — the REST feed does not carry them', () => {
    const [pair] = normalizeGmxPairs({ marketsInfo: GMX_MARKETS, tickers: GMX_TICKERS, tokens: GMX_TOKENS, chainId: 42161 })
    // GMX keeps position-fee factors and MIN_COLLATERAL_USD in its DataStore; `/markets/info`
    // returns name/tokens/liquidity/OI/rates and nothing else. An admitted unknown beats a rate
    // copied from documentation that the deployed contract may have moved.
    expect(pair.venueFee).toBeNull()
    expect(pair.minNotional).toBeNull()
    expect(pair.minCollateralUsd).toBeNull()
    // Present-and-null, so a consumer can distinguish it from an older gateway that never had them.
    for (const field of ['venueFee', 'minNotional', 'minCollateralUsd']) {
      expect(Object.prototype.hasOwnProperty.call(pair, field), field).toBe(true)
    }
  })

  it('publishes the gains leverage FLOOR as well as the ceiling', () => {
    const [pair] = normalizeGainsPairs({ tradingVariables: GAINS_TV, chartPrices: GAINS_CHARTS, chainId: 42161 })
    expect(pair.minLeverage).toBe(1.1) // group minLeverage 1100 at the 1e3 scale
    expect(pair.maxLeverage).toBe(200) // unchanged
  })

  it('omits a gains collateral the venue has deactivated or described only partly', () => {
    const tv = {
      ...GAINS_TV,
      collaterals: [
        { ...GAINS_TV.collaterals[0], isActive: false },
        // Active, but no address — a collateral we cannot name is not one we may offer.
        { collateralIndex: '4', isActive: true, symbol: 'DAI', collateralConfig: { decimals: 18 } },
        // Active with an address, but no decimals — an amount in unknown units is not an amount.
        { collateralIndex: '5', isActive: true, symbol: 'WETH', collateral: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', collateralConfig: {} },
        // Index 0 does not exist on a 1-based venue.
        { collateralIndex: '0', isActive: true, symbol: 'X', collateral: '0x1111111111111111111111111111111111111111', collateralConfig: { decimals: 6 } },
      ],
    }
    const [pair] = normalizeGainsPairs({ tradingVariables: tv, chartPrices: GAINS_CHARTS, chainId: 42161 })
    expect(pair.collaterals).toEqual([])
  })

  it('publishes the gmx market token and its two collateral tokens', () => {
    const [pair] = normalizeGmxPairs({ marketsInfo: GMX_MARKETS, tickers: GMX_TICKERS, tokens: GMX_TOKENS, chainId: 42161 })
    expect(pair.market).toBe('0x47c031236e19d024b42f8AE6780E44A573170703')
    // The field and the id must agree — they come from one value, and this is what says so.
    expect(pair.id.endsWith(pair.market)).toBe(true)
    expect(pair.collaterals).toEqual([
      // WBTC.b has no ticker in this payload — priced null, never assumed, never 0.
      { symbol: 'WBTC.b', address: WBTC_B, decimals: 8, collateralIndex: null, usdPrice: null },
      { symbol: 'USDC', address: USDC_ARB, decimals: 6, collateralIndex: null, usdPrice: 1 },
    ])
  })

  it('omits a gmx collateral whose decimals the token list does not resolve', () => {
    // A token GMX names but does not describe. Offering it would size the order in unknown units.
    const [pair] = normalizeGmxPairs({
      marketsInfo: GMX_MARKETS,
      tickers: GMX_TICKERS,
      tokens: { tokens: [{ symbol: 'BTC', address: BTC_INDEX_TOKEN, decimals: 8 }] },
      chainId: 42161,
    })
    expect(pair.collaterals).toEqual([])
    // …and the market handle survives, because it is a different fact from the collateral list.
    expect(pair.market).toBe('0x47c031236e19d024b42f8AE6780E44A573170703')
  })

  it('does not list a single-collateral gmx market twice', () => {
    const markets = {
      markets: [{ ...GMX_MARKETS.markets[0], longToken: USDC_ARB, shortToken: USDC_ARB }],
    }
    const [pair] = normalizeGmxPairs({ marketsInfo: markets, tickers: GMX_TICKERS, tokens: GMX_TOKENS, chainId: 42161 })
    expect(pair.collaterals).toHaveLength(1)
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

  /* ---- HIP-3 perp dexes (spec 083, hyperliquid-decision.md §5.2 defect 1) ------------------ */

  it('reads the perp-dex list, treating the leading null as the default dex', () => {
    expect(normalizeHyperliquidDexes(HL_PERP_DEXS)).toEqual([HL_DEFAULT_DEX, 'xyz', 'hyna'])
  })

  it('always yields the default dex, even from an unusable or dex-less list', () => {
    // A list we cannot read must not cost us the book spec 082 already served.
    expect(normalizeHyperliquidDexes(null)).toEqual([HL_DEFAULT_DEX])
    expect(normalizeHyperliquidDexes([{ name: 'xyz' }])).toEqual([HL_DEFAULT_DEX, 'xyz'])
    // Deduped, and a repeated default (two nulls) is still one entry.
    expect(normalizeHyperliquidDexes([null, null, { name: 'xyz' }, { name: 'xyz' }])).toEqual([
      HL_DEFAULT_DEX,
      'xyz',
    ])
  })

  it('scopes a non-default dex into the position id, so two dexes never merge into one row', () => {
    const [dflt] = normalizeHyperliquidPositions({ clearinghouseState: HL_CLEARINGHOUSE })
    const [other] = normalizeHyperliquidPositions({ clearinghouseState: HL_CLEARINGHOUSE_HYNA, dex: 'hyna' })
    // Same coin, same side, two REAL positions on two different books.
    expect(dflt.symbol).toBe(other.symbol)
    expect(dflt.direction).toBe(other.direction)
    expect(other.id).not.toBe(dflt.id)
    expect(other.id).toBe('hyperliquid:hyna:ETH:long')
    // The default dex's id is byte-identical to what spec 082 shipped: the SPA's activity source
    // fingerprints these, so re-keying them would narrate a position change that never happened.
    expect(dflt.id).toBe('hyperliquid:ETH:long')
    expect(dflt.dex).toBe(HL_DEFAULT_DEX)
    expect(dflt.variant).toBeNull()
    expect(other.dex).toBe('hyna')
    expect(other.variant).toBe('hyna') // rides the same field GMX's market variant does
    expect(other.venueRef).toEqual({ venue: 'hyperliquid', dex: 'hyna' })
  })

  it('scopes a non-default dex into the pair id too, and strips a redundant dex prefix', () => {
    const [pair] = normalizeHyperliquidPairs({ metaAndAssetCtxs: HL_META_XYZ, dex: 'xyz' })
    expect(pair.id).toBe('hyperliquid:xyz:BTC')
    expect(pair.symbol).toBe('BTC/USD') // never "xyz:BTC/USD" — the dex is a variant, not a symbol
    expect(pair.variant).toBe('xyz')
    // Some Hyperliquid surfaces qualify the asset as "<dex>:<COIN>"; both spellings land here.
    const prefixed = normalizeHyperliquidPairs({
      metaAndAssetCtxs: [{ universe: [{ name: 'xyz:BTC' }] }, [{ markPx: '1' }]],
      dex: 'xyz',
    })
    expect(prefixed[0].id).toBe('hyperliquid:xyz:BTC')
    expect(prefixed[0].base).toBe('BTC')
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

  /* ---- HIP-3 perp dexes: the pair feed ------------------------------------------------------ */

  it('lists markets from every perp dex, keeping two same-symbol markets distinguishable', async () => {
    const { app } = build()
    const res = await get(app, '/v1/perps/pairs')
    const hl = res.body.pairs.filter((p) => p.venue === 'hyperliquid')
    // Default dex BTC + xyz BTC + hyna BTC — three markets, three ids, no React-key collision.
    expect(hl.map((p) => p.id).sort()).toEqual(['hyperliquid:BTC', 'hyperliquid:hyna:BTC', 'hyperliquid:xyz:BTC'])
    expect(new Set(hl.map((p) => p.symbol))).toEqual(new Set(['BTC/USD']))
    expect(hl.filter((p) => p.variant === 'xyz')).toHaveLength(1)
    expect(res.body.sources.hyperliquid).toMatchObject({
      status: 'read',
      dexes: [HL_DEFAULT_DEX, 'xyz', 'hyna'],
      unreadDexes: [],
      partial: false,
    })
  })

  it('scopes every hyperliquid read to a dex — an un-scoped read answers for the first one only', async () => {
    const { app, perpsFetch } = build()
    await get(app, '/v1/perps/pairs')
    const metaBodies = hlBodies(perpsFetch).filter((b) => b.type === 'metaAndAssetCtxs')
    expect(metaBodies).toHaveLength(3)
    expect(metaBodies.every((b) => typeof b.dex === 'string')).toBe(true)
    expect(metaBodies.map((b) => b.dex).sort()).toEqual(['', 'hyna', 'xyz'])
  })

  it('caps the fan-out but NAMES what it left out — a bounded read is never a silent one', async () => {
    const { app } = build({ env: { PERPS_HL_DEX_MAX: '2' } })
    const res = await get(app, '/v1/perps/pairs')
    expect(res.body.sources.hyperliquid).toMatchObject({
      status: 'read',
      dexes: [HL_DEFAULT_DEX, 'xyz'],
      unreadDexes: ['hyna'], // named, so the absence is qualified rather than absolute
      partial: true,
    })
    expect(res.body.pairs.some((p) => p.id === 'hyperliquid:hyna:BTC')).toBe(false)
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

  /* ---- HIP-3 perp dexes: the fabricated absence (hyperliquid-decision.md §5.2 defect 1) ----- *
   *
   * The measured member held 35 positions across xyz/hyna/mkts and ZERO on the first perp dex, and
   * FairWins rendered "No open perp positions found for this account." These are that member.
   * ------------------------------------------------------------------------------------------ */

  it('finds positions held on a NON-DEFAULT perp dex, with nothing on the first one', async () => {
    // The first dex answers with an EMPTY book: only the fan-out can find this member's position.
    const emptyFirstDex = mockPerpsFetch()
    const inner = emptyFirstDex
    const perpsFetch = async (url, init = {}) => {
      const res = await inner(url, init)
      if (url.includes('hyperliquid')) {
        const body = JSON.parse(init.body ?? '{}')
        if (body.type === 'clearinghouseState' && (body.dex ?? '') === '') return ok({ assetPositions: [] })
      }
      return res
    }
    perpsFetch.calls = inner.calls

    const { app } = build({ perpsFetch })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    const hl = res.body.positions.filter((p) => p.venue === 'hyperliquid')
    expect(hl.map((p) => p.id).sort()).toEqual(['hyperliquid:hyna:ETH:long', 'hyperliquid:xyz:BTC:long'])
    // A complete read: nothing to qualify, so the surface may state absence plainly elsewhere.
    expect(res.body.sources.hyperliquid).toMatchObject({ status: 'read', unreadDexes: [], partial: false })
  })

  it('sends the dex on every clearinghouseState read', async () => {
    const { app, perpsFetch } = build()
    await get(app, `/v1/perps/positions?address=${TRADER}`)
    const states = hlBodies(perpsFetch).filter((b) => b.type === 'clearinghouseState')
    expect(states).toHaveLength(3)
    expect(states.every((b) => typeof b.dex === 'string' && b.user === TRADER)).toBe(true)
    expect(states.map((b) => b.dex).sort()).toEqual(['', 'hyna', 'xyz'])
  })

  it('keeps two same-coin positions on different dexes as two rows', async () => {
    const { app } = build()
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    const eth = res.body.positions.filter((p) => p.venue === 'hyperliquid' && p.symbol === 'ETH/USD')
    expect(eth).toHaveLength(2)
    expect(new Set(eth.map((p) => p.id)).size).toBe(2)
    expect(eth.map((p) => p.venueRef.dex).sort()).toEqual(['', 'hyna'])
  })

  it('reports a per-dex failure instead of swallowing it — a dead dex is not "no positions there"', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['hlDex:xyz'] }) })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    // The dexes that answered still render — per-dex isolation, exactly like per-venue isolation.
    expect(res.body.positions.some((p) => p.id === 'hyperliquid:hyna:ETH:long')).toBe(true)
    expect(res.body.positions.some((p) => p.id.startsWith('hyperliquid:xyz:'))).toBe(false)
    expect(res.body.sources.hyperliquid).toMatchObject({
      status: 'read',
      dexes: [HL_DEFAULT_DEX, 'hyna'],
      unreadDexes: ['xyz'],
      partial: true,
    })
  })

  it('says it does not know what it missed when dex discovery itself fails', async () => {
    const { app } = build({ perpsFetch: mockPerpsFetch({ down: ['hlPerpDexs'] }) })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    // Falls back to the first dex — spec 082's behaviour — but never claims it saw the rest.
    expect(res.body.positions.some((p) => p.id === 'hyperliquid:ETH:long')).toBe(true)
    expect(res.body.sources.hyperliquid).toMatchObject({ status: 'read', dexes: [HL_DEFAULT_DEX], partial: true })
    // null, NOT [] — "we do not know what we missed" must never flatten into "we missed nothing".
    expect(res.body.sources.hyperliquid.unreadDexes).toBeNull()
  })

  it('degrades hyperliquid only when NO dex answered', async () => {
    const { app } = build({
      perpsFetch: mockPerpsFetch({ down: ['hlDex:', 'hlDex:xyz', 'hlDex:hyna'] }),
    })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    expect(res.body.sources.hyperliquid).toMatchObject({ status: 'degraded', dexes: [], partial: true })
    expect(res.body.positions.some((p) => p.venue === 'hyperliquid')).toBe(false)
    expect(res.body.positions.some((p) => p.venue === 'gains')).toBe(true)
  })

  it('never lets a nonsense fan-out cap read zero dexes', async () => {
    // A cap of 0 would mean "search nothing and report nothing found" — the defect, not a default.
    const { app } = build({ env: { PERPS_HL_DEX_MAX: '0' } })
    const res = await get(app, `/v1/perps/positions?address=${TRADER}`)
    expect(res.status).toBe(200)
    expect(res.body.sources.hyperliquid.dexes).toContain(HL_DEFAULT_DEX)
    expect(res.body.positions.some((p) => p.venue === 'hyperliquid')).toBe(true)
  })

  it('caches the dex list across requests — it is global, not per-member', async () => {
    const { app, perpsFetch } = build()
    await get(app, `/v1/perps/positions?address=${TRADER}`)
    await get(app, '/v1/perps/pairs')
    expect(hlBodies(perpsFetch).filter((b) => b.type === 'perpDexs')).toHaveLength(1)
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
