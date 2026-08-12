/**
 * What a GMX position is worth, and how honestly it is said (spec 083 US1, critic finding 1).
 *
 * The visual review found a GMX position rendering SIX blank figures in the exit sheet — entry
 * price, leverage, liquidation, P&L, estimated proceeds and the venue's own fee — so a member was
 * closing a leveraged position on almost no information. Three of those were never missing data:
 * GMX's Reader reports the position in raw venue units and the scales that turn them into money are
 * on the pairs feed already on screen.
 *
 * So this suite is about two properties, and the second matters more than the first:
 *
 *   1. THE ARITHMETIC IS RIGHT AT REAL DECIMALS. Not 18 everywhere — an 8-decimal WBTC index, an
 *      18-decimal WETH index and a 6-decimal USDC collateral in the same fixture, because assuming
 *      18 on the BTC market misstates the entry price by a factor of 10^10.
 *   2. A MISSING INPUT PRODUCES NOTHING, NOT SOMETHING SMALLER. Every input is removed one at a
 *      time and the figures that depended on it must be null — never a partial number, never a 0 —
 *      and the figures that did NOT depend on it must survive.
 *
 * The honesty half — that a calculated figure is labelled as ours and never as the venue's, and
 * that the liquidation price says why it is absent rather than showing a bare dash — is asserted
 * where a member actually reads it, in `PositionSheet.test.jsx`.
 */
import { describe, it, expect } from 'vitest'

import {
  GMX_DERIVED_FIELDS,
  deriveGmxFigures,
  gmxCollateralOf,
  gmxIndexDecimals,
  isDerivedFigure,
  withGmxDerivedFigures,
} from '../../lib/perps/gmxDerived'
import { buildGmxMarketIndex, findGmxPair } from '../../lib/perps/gmxMarkets'

const ARB = 42161

/* Real Arbitrum addresses and real decimals — the point of the fixture is that they differ. */
const BTC_MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703'
const ETH_MARKET = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336'
const DOGE_MARKET = '0x6853EA96FF216fAb11D2d930CE3C508556A4bdc4'
const UNLISTED_MARKET = '0x0418643F94Ef14917f1345cE5C460C37dE463ef7'
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' // 8 decimals
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' // 18 decimals
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' // 6 decimals

const usdc = (over = {}) => ({ symbol: 'USDC', address: USDC, decimals: 6, usdPrice: 0.9998, ...over })

/** The feed shape `normalizeGmxPairs` publishes, including the market's own collaterals. */
const PAIRS = [
  {
    id: `gmx:${ARB}:BTC/USD:${BTC_MARKET}`,
    venue: 'gmx',
    chainId: ARB,
    symbol: 'BTC/USD',
    base: 'BTC',
    quote: 'USD',
    variant: 'WBTC.e-USDC',
    price: 63_000,
    market: BTC_MARKET,
    collaterals: [{ symbol: 'WBTC.e', address: WBTC, decimals: 8, usdPrice: 62_990 }, usdc()],
  },
  {
    id: `gmx:${ARB}:ETH/USD:${ETH_MARKET}`,
    venue: 'gmx',
    chainId: ARB,
    symbol: 'ETH/USD',
    base: 'ETH',
    quote: 'USD',
    variant: 'WETH-USDC',
    price: 4_180.4,
    market: ETH_MARKET,
    collaterals: [{ symbol: 'WETH', address: WETH, decimals: 18, usdPrice: 4_180.4 }, usdc()],
  },
  {
    // A SYNTHETIC market: the index asset is DOGE, and no collateral names it. Nothing that needs
    // the index scale may be produced here.
    id: `gmx:${ARB}:DOGE/USD:${DOGE_MARKET}`,
    venue: 'gmx',
    chainId: ARB,
    symbol: 'DOGE/USD',
    base: 'DOGE',
    quote: 'USD',
    variant: 'WETH-USDC',
    price: 0.13,
    market: DOGE_MARKET,
    collaterals: [{ symbol: 'WETH', address: WETH, decimals: 18, usdPrice: 4_180.4 }, usdc()],
  },
]

const INDEX = buildGmxMarketIndex(PAIRS)
const btcPair = () => findGmxPair(gmxPosition({ market: BTC_MARKET }), INDEX)
const ethPair = () => findGmxPair(gmxPosition({ market: ETH_MARKET }), INDEX)

/**
 * A GMX position exactly as `usePerpsPositions#toGmxPosition` publishes one: four nulls where the
 * Reader reported nothing, and the venue-unit read carried along in `raw`.
 */
function gmxPosition({ market = BTC_MARKET, isLong = true, raw = {}, ...over } = {}) {
  return {
    id: `gmx:${ARB}:${market}`,
    venue: 'gmx',
    chainId: ARB,
    symbol: null,
    direction: isLong ? 'long' : 'short',
    sizeUsd: 3_000,
    collateralUsd: null,
    entryPrice: null,
    leverage: null,
    unrealizedPnlUsd: null,
    venueRef: {
      venue: 'gmx',
      chainId: ARB,
      positionKey: `0x${'ab'.repeat(32)}`,
      market,
      collateralToken: USDC,
      isLong,
    },
    raw: {
      market,
      collateralToken: USDC,
      isLong,
      // $3,000 notional, 0.05 BTC at an entry of $60,000, backed by 300 USDC.
      sizeInUsd: 3_000n * 10n ** 30n,
      sizeInTokens: 5_000_000n, // 0.05 × 1e8 — WBTC is EIGHT decimals, not eighteen
      collateralAmount: 300_000_000n, // 300 × 1e6 — USDC is SIX
      ...raw,
    },
    ...over,
  }
}

/** The 18-decimal counterpart: 1 WETH long at an entry of $4,000, backed by 400 USDC. */
function ethPosition(over = {}) {
  return gmxPosition({
    market: ETH_MARKET,
    raw: {
      sizeInUsd: 4_000n * 10n ** 30n,
      sizeInTokens: 10n ** 18n, // 1 WETH — EIGHTEEN decimals
      collateralAmount: 400_000_000n,
    },
    sizeUsd: 4_000,
    ...over,
  })
}

/* --------------------------------------------------------------------------------------------- *
 * The index token's decimals — the scale nothing may assume
 * --------------------------------------------------------------------------------------------- */

describe('gmxIndexDecimals', () => {
  it('reads 8 for a WBTC-collateralised BTC market and 18 for a WETH-collateralised ETH one', () => {
    expect(gmxIndexDecimals(btcPair())).toBe(8)
    expect(gmxIndexDecimals(ethPair())).toBe(18)
  })

  it('refuses a synthetic market, where no collateral names the index asset', () => {
    const doge = findGmxPair(gmxPosition({ market: DOGE_MARKET }), INDEX)
    expect(doge).not.toBeNull() // the market resolves — it is only its index scale we cannot know
    expect(gmxIndexDecimals(doge)).toBeNull()
  })

  it('never falls back to 18 when the feed published no decimals', () => {
    const index = buildGmxMarketIndex([
      { ...PAIRS[0], collaterals: [{ symbol: 'WBTC.e', address: WBTC, usdPrice: 62_990 }, usdc()] },
    ])
    expect(gmxIndexDecimals(findGmxPair(gmxPosition({ market: BTC_MARKET }), index))).toBeNull()
  })

  it('takes an exact symbol match first, so a base that begins with W is not mangled', () => {
    // WIF is dogwifhat: stripping the leading 'W' would look for 'IF' and find nothing.
    const index = buildGmxMarketIndex([
      {
        ...PAIRS[0],
        id: `gmx:${ARB}:WIF/USD:${BTC_MARKET}`,
        symbol: 'WIF/USD',
        base: 'WIF',
        collaterals: [{ symbol: 'WIF', address: WBTC, decimals: 6, usdPrice: 2.1 }, usdc()],
      },
    ])
    expect(gmxIndexDecimals(findGmxPair(gmxPosition({ market: BTC_MARKET }), index))).toBe(6)
  })

  it('refuses when two candidates disagree about the scale, rather than picking one', () => {
    const index = buildGmxMarketIndex([
      {
        ...PAIRS[0],
        collaterals: [
          { symbol: 'WBTC.e', address: WBTC, decimals: 8, usdPrice: 62_990 },
          { symbol: 'BTC', address: USDC, decimals: 18, usdPrice: 62_990 },
        ],
      },
    ])
    expect(gmxIndexDecimals(findGmxPair(gmxPosition({ market: BTC_MARKET }), index))).toBeNull()
  })

  it('is total — junk in, null out', () => {
    for (const junk of [null, undefined, {}, { base: 'BTC' }, { collaterals: 'nope' }, 7]) {
      expect(gmxIndexDecimals(junk)).toBeNull()
    }
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The figures themselves, at real decimals
 * --------------------------------------------------------------------------------------------- */

describe('deriveGmxFigures at the venues’ own decimals', () => {
  it('prices an 8-decimal WBTC index against 6-decimal USDC collateral', () => {
    const figures = deriveGmxFigures(gmxPosition(), btcPair())
    // $3,000 / 0.05 BTC = $60,000 — the position's own average entry, exactly.
    expect(figures.entryPrice).toBeCloseTo(60_000, 6)
    // 300 USDC at GMX's OWN price for it (0.9998), never at an assumed $1 peg.
    expect(figures.collateralUsd).toBeCloseTo(299.94, 6)
    expect(figures.leverage).toBeCloseTo(3_000 / 299.94, 9)
    // Long, mark $63,000: 0.05 × 63,000 − 3,000 = +$150.
    expect(figures.unrealizedPnlUsd).toBeCloseTo(150, 6)
  })

  it('prices an 18-decimal WETH index in the same pass', () => {
    const figures = deriveGmxFigures(ethPosition(), ethPair())
    expect(figures.entryPrice).toBeCloseTo(4_000, 6)
    expect(figures.collateralUsd).toBeCloseTo(399.92, 6)
    expect(figures.leverage).toBeCloseTo(4_000 / 399.92, 9)
    expect(figures.unrealizedPnlUsd).toBeCloseTo(180.4, 6)
  })

  it('reverses the P&L for a short — the side is read, never assumed', () => {
    const short = deriveGmxFigures(gmxPosition({ isLong: false }), btcPair())
    expect(short.unrealizedPnlUsd).toBeCloseTo(-150, 6)
    // Everything that does not depend on the side is identical.
    expect(short.entryPrice).toBeCloseTo(60_000, 6)
    expect(short.leverage).toBeCloseTo(3_000 / 299.94, 9)

    const shortEth = deriveGmxFigures(ethPosition({ isLong: false }), ethPair())
    expect(shortEth.unrealizedPnlUsd).toBeCloseTo(-180.4, 6)
  })

  it('reads the side from the branded ref, not from a row’s display string', () => {
    const lying = gmxPosition({ isLong: false, direction: 'long' })
    expect(deriveGmxFigures(lying, btcPair()).unrealizedPnlUsd).toBeCloseTo(-150, 6)
  })

  it('matches the collateral on its ADDRESS, so the wrong token can never price it', () => {
    const inWbtc = gmxPosition({
      venueRef: { venue: 'gmx', chainId: ARB, market: BTC_MARKET, collateralToken: WBTC, isLong: true },
      raw: { collateralAmount: 500_000n }, // 0.005 WBTC at 8 decimals
    })
    expect(gmxCollateralOf(inWbtc, btcPair())?.symbol).toBe('WBTC.e')
    // 0.005 × 62,990 = $314.95 — NOT 0.005 read as USDC, and not 500,000 read as anything.
    expect(deriveGmxFigures(inWbtc, btcPair()).collateralUsd).toBeCloseTo(314.95, 6)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Every missing input, one at a time
 * --------------------------------------------------------------------------------------------- */

describe('a missing input yields null, never a partial figure', () => {
  it('gives nothing at all when the market does not resolve', () => {
    const unlisted = gmxPosition({ market: UNLISTED_MARKET })
    expect(findGmxPair(unlisted, INDEX)).toBeNull()
    expect(deriveGmxFigures(unlisted, null)).toEqual({
      entryPrice: null,
      leverage: null,
      collateralUsd: null,
      unrealizedPnlUsd: null,
    })
  })

  it('drops the index-scaled figures on a synthetic market and KEEPS the collateral ones', () => {
    const doge = findGmxPair(gmxPosition({ market: DOGE_MARKET }), INDEX)
    const figures = deriveGmxFigures(gmxPosition({ market: DOGE_MARKET }), doge)
    expect(figures.entryPrice).toBeNull()
    expect(figures.unrealizedPnlUsd).toBeNull()
    // Collateral value and leverage never needed the index scale, so they are still exact.
    expect(figures.collateralUsd).toBeCloseTo(299.94, 6)
    expect(figures.leverage).toBeCloseTo(3_000 / 299.94, 9)
  })

  it('drops collateral value and leverage — and nothing else — when the venue did not price it', () => {
    const index = buildGmxMarketIndex([
      {
        ...PAIRS[0],
        collaterals: [{ symbol: 'WBTC.e', address: WBTC, decimals: 8 }, usdc({ usdPrice: null })],
      },
    ])
    const figures = deriveGmxFigures(gmxPosition(), findGmxPair(gmxPosition(), index))
    expect(figures.collateralUsd).toBeNull()
    expect(figures.leverage).toBeNull()
    expect(figures.entryPrice).toBeCloseTo(60_000, 6)
    expect(figures.unrealizedPnlUsd).toBeCloseTo(150, 6)
  })

  it('drops the P&L — and nothing else — when the venue reported no price', () => {
    const index = buildGmxMarketIndex([{ ...PAIRS[0], price: null }])
    const figures = deriveGmxFigures(gmxPosition(), findGmxPair(gmxPosition(), index))
    expect(figures.unrealizedPnlUsd).toBeNull()
    expect(figures.entryPrice).toBeCloseTo(60_000, 6)
    expect(figures.collateralUsd).toBeCloseTo(299.94, 6)
  })

  it('drops the collateral figures when the position is in a token this market does not list', () => {
    const foreign = gmxPosition({
      venueRef: { venue: 'gmx', chainId: ARB, market: BTC_MARKET, collateralToken: ETH_MARKET, isLong: true },
    })
    const figures = deriveGmxFigures(foreign, btcPair())
    expect(figures.collateralUsd).toBeNull()
    expect(figures.leverage).toBeNull()
  })

  it('gives nothing when the venue read is absent or empty — and never a zero', () => {
    for (const raw of [null, undefined, {}, 'nonsense']) {
      const figures = deriveGmxFigures({ ...gmxPosition(), raw }, btcPair())
      expect(Object.values(figures)).toEqual([null, null, null, null])
    }
  })

  it('refuses a zero or missing size in tokens rather than dividing by it', () => {
    for (const sizeInTokens of [0n, null, undefined, 1.5, 'x']) {
      const figures = deriveGmxFigures(gmxPosition({ raw: { sizeInTokens } }), btcPair())
      expect(figures.entryPrice).toBeNull()
      expect(figures.unrealizedPnlUsd).toBeNull()
    }
  })

  it('withholds the index-scaled figures when the scale cannot be reconciled with the venue’s price', () => {
    // The feed claims 18 decimals for the BTC index; the position is really 8. The implied entry
    // price is then astronomically far from GMX's own $63,000, so both figures go rather than one
    // of them being quietly wrong by 10^10.
    const index = buildGmxMarketIndex([
      {
        ...PAIRS[0],
        collaterals: [{ symbol: 'WBTC.e', address: WBTC, decimals: 18, usdPrice: 62_990 }, usdc()],
      },
    ])
    const figures = deriveGmxFigures(gmxPosition(), findGmxPair(gmxPosition(), index))
    expect(figures.entryPrice).toBeNull()
    expect(figures.unrealizedPnlUsd).toBeNull()
    expect(figures.collateralUsd).toBeCloseTo(299.94, 6)
  })

  it('is total for anything that is not a GMX position', () => {
    for (const junk of [null, undefined, {}, { venue: 'gains', raw: {} }, 42, 'position']) {
      expect(Object.values(deriveGmxFigures(junk, btcPair()))).toEqual([null, null, null, null])
    }
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Composition — filled in, and NAMED as ours
 * --------------------------------------------------------------------------------------------- */

describe('withGmxDerivedFigures', () => {
  it('fills the GMX row and names exactly what it worked out', () => {
    const [row] = withGmxDerivedFigures([gmxPosition()], INDEX)
    expect(row.entryPrice).toBeCloseTo(60_000, 6)
    expect(row.leverage).toBeCloseTo(3_000 / 299.94, 9)
    expect(row.unrealizedPnlUsd).toBeCloseTo(150, 6)
    expect([...row.derivedFields].sort()).toEqual([...GMX_DERIVED_FIELDS].sort())
    for (const field of GMX_DERIVED_FIELDS) expect(isDerivedFigure(row, field)).toBe(true)
  })

  it('names only the figures it actually produced', () => {
    const [row] = withGmxDerivedFigures([gmxPosition({ market: DOGE_MARKET })], INDEX)
    expect([...row.derivedFields].sort()).toEqual(['collateralUsd', 'leverage'])
    expect(isDerivedFigure(row, 'entryPrice')).toBe(false)
    expect(row.entryPrice).toBeNull()
  })

  it('never overwrites a figure the venue itself reported', () => {
    const reported = gmxPosition({ entryPrice: 59_000, unrealizedPnlUsd: -7 })
    const [row] = withGmxDerivedFigures([reported], INDEX)
    expect(row.entryPrice).toBe(59_000)
    expect(row.unrealizedPnlUsd).toBe(-7)
    expect(isDerivedFigure(row, 'entryPrice')).toBe(false)
    expect(isDerivedFigure(row, 'leverage')).toBe(true)
  })

  it('leaves every other venue’s row untouched — per-venue isolation, both directions', () => {
    const gains = { id: 'gains:137:4', venue: 'gains', chainId: 137, entryPrice: null, leverage: null }
    const rows = withGmxDerivedFigures([gains, gmxPosition()], INDEX)
    expect(rows[0]).toBe(gains)
  })

  it('returns the ORIGINAL array when nothing could be derived, so a memo does not churn', () => {
    const rows = [gmxPosition({ market: UNLISTED_MARKET })]
    expect(withGmxDerivedFigures(rows, INDEX)).toBe(rows)
    expect(withGmxDerivedFigures(rows, new Map())).toBe(rows)
  })

  it('is total', () => {
    expect(withGmxDerivedFigures(null, INDEX)).toEqual([])
    expect(withGmxDerivedFigures([null, 'x'], INDEX)).toEqual([null, 'x'])
    expect(isDerivedFigure(null, 'entryPrice')).toBe(false)
    expect(isDerivedFigure({ derivedFields: 'entryPrice' }, 'entryPrice')).toBe(false)
  })
})
