/**
 * GMX market-address → pair resolution (spec 083 US3/US5).
 *
 * The property under test is not "it finds the pair" — it is that a MISS IS A MISS. GMX's Reader
 * names a market address, the venue feed names markets inside its pair ids, and everything between
 * them is an exact match on (chainId, market address). A near miss must render '—', because a
 * wrong pair on a leveraged position prices a close against a market the member does not hold.
 *
 * The fixture is deliberately the hard shape: TWO GMX markets on ONE base pair (BTC/USD, two
 * collateral variants — this is real, GMX runs both) plus a position in a market the feed does not
 * list at all.
 */
import { describe, it, expect } from 'vitest'

import {
  buildGmxMarketIndex,
  findGmxPair,
  gmxMarketKey,
  gmxMarketPrice,
  parseGmxPairId,
  withGmxMarketSymbols,
} from '../../lib/perps/gmxMarkets'

const ARB = 42161
const AVAX = 43114

// Two BTC/USD markets and an ETH one, in the shape `normalizeGmxPairs` publishes.
const BTC_WBTC = '0x47c031236e19d024b42f8AE6780E44A573170703'
const BTC_SYNTH = '0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77'
const ETH_MARKET = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336'
/** A market the member holds and the feed does not list — the unresolvable case. */
const UNLISTED = '0x0418643F94Ef14917f1345cE5C460C37dE463ef7'

const gmxPair = (over = {}) => ({
  venue: 'gmx',
  chainId: ARB,
  base: 'BTC',
  quote: 'USD',
  price: 63_000,
  ...over,
})

const PAIRS = [
  gmxPair({ id: `gmx:${ARB}:BTC/USD:${BTC_WBTC}`, symbol: 'BTC/USD', variant: 'WBTC.b-USDC', price: 63_000 }),
  gmxPair({ id: `gmx:${ARB}:BTC/USD:${BTC_SYNTH}`, symbol: 'BTC/USD', variant: 'BTC-USDC', price: 63_010 }),
  gmxPair({ id: `gmx:${ARB}:ETH/USD:${ETH_MARKET}`, symbol: 'ETH/USD', variant: 'WETH-USDC', base: 'ETH', price: 3_000 }),
  // Other venues share the feed and must be inert here.
  { id: 'gains:137:BTC/USD', venue: 'gains', chainId: 137, symbol: 'BTC/USD', price: 1 },
  { id: 'hyperliquid:BTC', venue: 'hyperliquid', chainId: null, symbol: 'BTC/USD', price: 2 },
]

const gmxPosition = (market, over = {}) => ({
  id: `gmx:${ARB}:0x${'ab'.repeat(32)}`,
  venue: 'gmx',
  chainId: ARB,
  symbol: null,
  direction: 'long',
  sizeUsd: 1000,
  venueRef: { venue: 'gmx', chainId: ARB, market, collateralToken: null, isLong: true },
  ...over,
})

describe('parseGmxPairId', () => {
  it('reads the chain, the symbol and the market token out of a GMX pair id', () => {
    expect(parseGmxPairId(`gmx:${ARB}:BTC/USD:${BTC_WBTC}`)).toEqual({
      chainId: ARB,
      symbol: 'BTC/USD',
      marketToken: BTC_WBTC,
    })
  })

  it('takes the market token as the LAST segment, so a symbol containing a colon still parses', () => {
    // Nothing publishes such a symbol today; the point is that the parse does not depend on that.
    expect(parseGmxPairId(`gmx:${ARB}:BTC:PERP/USD:${BTC_WBTC}`)).toEqual({
      chainId: ARB,
      symbol: 'BTC:PERP/USD',
      marketToken: BTC_WBTC,
    })
  })

  it('is null for anything that is not a GMX pair id', () => {
    for (const id of [
      null,
      undefined,
      42,
      '',
      'gains:137:BTC/USD',
      `gmx:${ARB}:BTC/USD`, // no market token
      `gmx:${ARB}::${BTC_WBTC}`, // no symbol
      `gmx:0:BTC/USD:${BTC_WBTC}`, // no such chain
      `gmx:${ARB}:BTC/USD:0x1234`, // not an address
    ]) {
      expect(parseGmxPairId(id), String(id)).toBeNull()
    }
  })
})

describe('gmxMarketKey', () => {
  it('is case-insensitive on the address — venues and RPCs disagree about checksums', () => {
    expect(gmxMarketKey(ARB, BTC_WBTC)).toBe(gmxMarketKey(ARB, BTC_WBTC.toLowerCase()))
  })

  it('never lets a market address stand alone: the chain is part of the identity', () => {
    expect(gmxMarketKey(ARB, BTC_WBTC)).not.toBe(gmxMarketKey(AVAX, BTC_WBTC))
    expect(gmxMarketKey(null, BTC_WBTC)).toBeNull()
    expect(gmxMarketKey(ARB, 'not-an-address')).toBeNull()
  })
})

describe('buildGmxMarketIndex', () => {
  it('indexes only the GMX pairs, one entry per market', () => {
    expect(buildGmxMarketIndex(PAIRS).size).toBe(3)
  })

  it('survives a feed that is missing, empty, or not a list', () => {
    for (const input of [null, undefined, [], 'nope', {}]) {
      expect(buildGmxMarketIndex(input).size).toBe(0)
    }
  })

  it('skips a record that disagrees with itself rather than picking a reading', () => {
    // The id says Arbitrum, the record says Avalanche. There is no known-true reading of that.
    const index = buildGmxMarketIndex([gmxPair({ id: `gmx:${ARB}:BTC/USD:${BTC_WBTC}`, symbol: 'BTC/USD', chainId: AVAX })])
    expect(index.size).toBe(0)
  })

  it('poisons a market two different pairs both claim, instead of taking the first', () => {
    const index = buildGmxMarketIndex([
      gmxPair({ id: `gmx:${ARB}:BTC/USD:${BTC_WBTC}`, symbol: 'BTC/USD', variant: 'WBTC.b-USDC' }),
      gmxPair({ id: `gmx:${ARB}:SOL/USD:${BTC_WBTC}`, symbol: 'SOL/USD', variant: 'SOL-USDC' }),
      // …and a later duplicate of the first cannot un-poison it.
      gmxPair({ id: `gmx:${ARB}:BTC/USD:${BTC_WBTC}`, symbol: 'BTC/USD', variant: 'WBTC.b-USDC' }),
    ])
    expect(findGmxPair(gmxPosition(BTC_WBTC), index)).toBeNull()
  })

  it('tolerates a duplicate of the SAME market — one market twice is not a conflict', () => {
    const index = buildGmxMarketIndex([PAIRS[0], { ...PAIRS[0], price: 63_100 }])
    expect(findGmxPair(gmxPosition(BTC_WBTC), index)?.symbol).toBe('BTC/USD')
  })
})

describe('findGmxPair', () => {
  const index = buildGmxMarketIndex(PAIRS)

  it('resolves each of two markets on one base pair to its OWN variant', () => {
    expect(findGmxPair(gmxPosition(BTC_WBTC), index)).toMatchObject({ symbol: 'BTC/USD', variant: 'WBTC.b-USDC' })
    expect(findGmxPair(gmxPosition(BTC_SYNTH), index)).toMatchObject({ symbol: 'BTC/USD', variant: 'BTC-USDC' })
  })

  it('matches the address however either side cased it', () => {
    expect(findGmxPair(gmxPosition(BTC_WBTC.toLowerCase()), index)?.variant).toBe('WBTC.b-USDC')
  })

  it('is null for a market the feed does not list — never the nearest BTC market', () => {
    expect(findGmxPair(gmxPosition(UNLISTED), index)).toBeNull()
  })

  it('is null across chains: the same address on another chain is another market', () => {
    expect(findGmxPair(gmxPosition(BTC_WBTC, { chainId: AVAX, venueRef: { market: BTC_WBTC } }), index)).toBeNull()
  })

  it('is null when the row names no market, or names one that is not an address', () => {
    expect(findGmxPair(gmxPosition(null), index)).toBeNull()
    expect(findGmxPair(gmxPosition('0xdeadbeef'), index)).toBeNull()
    expect(findGmxPair({ venue: 'gmx', chainId: ARB }, index)).toBeNull()
  })

  it('falls back to the decoded venue units when a row carries no venue ref', () => {
    const row = { venue: 'gmx', chainId: ARB, venueRef: null, raw: { market: BTC_SYNTH } }
    expect(findGmxPair(row, index)?.variant).toBe('BTC-USDC')
  })

  it('never answers for another venue, even holding a GMX market address', () => {
    expect(findGmxPair({ ...gmxPosition(BTC_WBTC), venue: 'gains' }, index)).toBeNull()
    expect(findGmxPair(null, index)).toBeNull()
  })

  it('is null when the feed could not be read at all', () => {
    expect(findGmxPair(gmxPosition(BTC_WBTC), buildGmxMarketIndex([]))).toBeNull()
    expect(findGmxPair(gmxPosition(BTC_WBTC), null)).toBeNull()
  })
})

describe('gmxMarketPrice', () => {
  const index = buildGmxMarketIndex(PAIRS)

  it('gives each market its own price, not the base pair’s first listing', () => {
    expect(gmxMarketPrice(gmxPosition(BTC_WBTC), index)).toBe(63_000)
    expect(gmxMarketPrice(gmxPosition(BTC_SYNTH), index)).toBe(63_010)
  })

  it('is null for an unlisted market, and for a market the venue priced at 0 or not at all', () => {
    expect(gmxMarketPrice(gmxPosition(UNLISTED), index)).toBeNull()
    const unpriced = buildGmxMarketIndex([
      gmxPair({ id: `gmx:${ARB}:BTC/USD:${BTC_WBTC}`, symbol: 'BTC/USD', price: 0 }),
      gmxPair({ id: `gmx:${ARB}:ETH/USD:${ETH_MARKET}`, symbol: 'ETH/USD', price: null }),
    ])
    expect(gmxMarketPrice(gmxPosition(BTC_WBTC), unpriced)).toBeNull()
    expect(gmxMarketPrice(gmxPosition(ETH_MARKET), unpriced)).toBeNull()
  })
})

describe('withGmxMarketSymbols', () => {
  const index = buildGmxMarketIndex(PAIRS)

  const GAINS_ROW = { id: 'gains:137:7', venue: 'gains', chainId: 137, symbol: 'BTC/USD' }
  const rows = [GAINS_ROW, gmxPosition(BTC_WBTC, { id: 'a' }), gmxPosition(UNLISTED, { id: 'b' })]

  it('names the markets it can and leaves the one it cannot as “not reported”', () => {
    const [gains, resolved, unresolved] = withGmxMarketSymbols(rows, index)

    expect(resolved.symbol).toBe('BTC/USD')
    expect(resolved.variant).toBe('WBTC.b-USDC')
    // The unresolvable market keeps a null symbol, which the surfaces render as '—'.
    expect(unresolved.symbol).toBeNull()
    expect(unresolved.variant).toBeUndefined()
    // Per-venue isolation: the Gains row is the very same object it was handed.
    expect(gains).toBe(GAINS_ROW)
  })

  it('changes nothing else about a row it resolves', () => {
    const [, resolved] = withGmxMarketSymbols(rows, index)
    const source = rows[1]
    expect(resolved.id).toBe(source.id)
    expect(resolved.venueRef).toBe(source.venueRef)
    expect(resolved.sizeUsd).toBe(source.sizeUsd)
    expect(resolved.direction).toBe(source.direction)
    expect(Object.isFrozen(resolved)).toBe(true)
  })

  it('two markets on one base pair stay distinguishable', () => {
    const both = withGmxMarketSymbols([gmxPosition(BTC_WBTC), gmxPosition(BTC_SYNTH)], index)
    expect(both.map((p) => p.variant)).toEqual(['WBTC.b-USDC', 'BTC-USDC'])
  })

  it('never overwrites a symbol a producer already reported', () => {
    const named = [gmxPosition(BTC_SYNTH, { symbol: 'BTC/USD reported by the venue' })]
    expect(withGmxMarketSymbols(named, index)).toBe(named)
  })

  it('returns the SAME array when nothing resolved, so a memo downstream does not churn', () => {
    const nothing = [GAINS_ROW, gmxPosition(UNLISTED)]
    expect(withGmxMarketSymbols(nothing, index)).toBe(nothing)
    expect(withGmxMarketSymbols(nothing, buildGmxMarketIndex([]))).toBe(nothing)
  })

  it('survives a missing list and a missing index', () => {
    expect(withGmxMarketSymbols(null, index)).toEqual([])
    expect(withGmxMarketSymbols(rows, null)).toBe(rows)
  })
})
