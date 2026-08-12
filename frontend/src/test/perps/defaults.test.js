/**
 * Perps smart defaults (spec 083, T017).
 *
 * Two properties carry real weight here. First, a default venue may never be one the member cannot
 * open on — a close-only or paused venue looks perfectly healthy on every other read, and choosing
 * it hands the member an order the venue refuses. Second, suggested protection must always be
 * levels `validateProtection` accepts: a suggestion the app then refuses is worse than none, so the
 * two modules are pinned together by a fuzz over the whole grid rather than by two hand-picked
 * examples.
 */
import { describe, it, expect } from 'vitest'
import {
  pickVenue,
  defaultLeverage,
  defaultCollateral,
  defaultSlippage,
  suggestProtection,
  CONSERVATIVE_LEVERAGE,
} from '../../lib/perps/defaults'
import { validateProtection } from '../../lib/perps/validation'
import { VENUE_STATUS, canOpen } from '../../lib/perps/venueStatus'

const JUNK = [null, undefined, NaN, Infinity, -Infinity, 'nope', '', {}, [], true, false, -1, 0]

const BTC = 'BTC/USD'

function snapshot(venue, { status = 'ACTIVATED', canOpen, fundingRate = 0.00001, openInterestUsd = 1e8 } = {}) {
  const s = { venue, status, pairs: [{ symbol: BTC, fundingRate, openInterestUsd, maxLeverage: 100 }] }
  if (canOpen !== undefined) s.canOpen = canOpen
  return s
}

describe('pickVenue — never an unavailable venue', () => {
  it('picks the only venue that can open the pair, and says so', () => {
    const r = pickVenue(BTC, [snapshot('gains')])
    expect(r.venue).toBe('gains')
    expect(r.reason).toContain(BTC)
  })

  it('NEVER picks a close-only venue for an open', () => {
    const r = pickVenue(BTC, [snapshot('gains', { status: 'CLOSE_ONLY' }), snapshot('gmx')])
    expect(r.venue).toBe('gmx')

    // And with close-only as the only option, it picks nothing rather than the venue that will
    // refuse the order — exits stay available elsewhere; this function is about OPENING.
    const alone = pickVenue(BTC, [snapshot('gains', { status: 'CLOSE_ONLY' })])
    expect(alone.venue).toBeNull()
    expect(alone.reason).toMatch(/no venue/i)
  })

  it('NEVER picks a paused, unavailable, or unreadable venue', () => {
    for (const status of ['PAUSED', 'unavailable', 'degraded', 'unknown', '', undefined, null]) {
      // Spread rather than the helper's default, so `undefined`/`null` really do reach the check.
      const unhealthy = { ...snapshot('gains'), status }
      const r = pickVenue(BTC, [unhealthy, snapshot('gmx')])
      expect(r.venue).toBe('gmx')
      expect(pickVenue(BTC, [unhealthy]).venue).toBeNull()
    }
  })

  it('agrees with venueStatus about which status may open — exactly one of them', () => {
    // Pinned to the other module's vocabulary rather than to a string literal: if `venueStatus`
    // renames a state or adds one, a default venue must not start being chosen for it.
    for (const status of Object.values(VENUE_STATUS)) {
      const chosen = pickVenue(BTC, [{ ...snapshot('gains'), status }]).venue
      expect(chosen === 'gains').toBe(canOpen(status))
    }
    expect(Object.values(VENUE_STATUS).filter((s) => canOpen(s))).toHaveLength(1)
  })

  it('an explicit canOpen:false overrides a healthy-looking status', () => {
    const r = pickVenue(BTC, [snapshot('gains', { status: 'ACTIVATED', canOpen: false }), snapshot('gmx')])
    expect(r.venue).toBe('gmx')
  })

  it('never picks a venue that does not list the pair', () => {
    const gmxWithoutBtc = { venue: 'gmx', status: 'ACTIVATED', pairs: [{ symbol: 'ETH/USD', openInterestUsd: 1e9 }] }
    expect(pickVenue(BTC, [gmxWithoutBtc]).venue).toBeNull()
    expect(pickVenue(BTC, [gmxWithoutBtc, snapshot('gains')]).venue).toBe('gains')
    // No pair list at all is not evidence the venue trades it.
    expect(pickVenue(BTC, [{ venue: 'gains', status: 'ACTIVATED' }]).venue).toBeNull()
  })

  it('never picks Hyperliquid — it is read-only this release (FR-021)', () => {
    // Its snapshot is as healthy as any other; it is excluded by the config's own `evm` flag.
    const hl = { venue: 'hyperliquid', status: 'ACTIVATED', pairs: [{ symbol: BTC, openInterestUsd: 1e12 }] }
    expect(pickVenue(BTC, [hl]).venue).toBeNull()
    expect(pickVenue(BTC, [hl, snapshot('gains')]).venue).toBe('gains')
  })

  it('never picks a venue id the product does not know', () => {
    const rogue = { venue: 'definitely-not-a-venue', status: 'ACTIVATED', pairs: [{ symbol: BTC, openInterestUsd: 1e12 }] }
    expect(pickVenue(BTC, [rogue]).venue).toBeNull()
  })

  it('prefers the cheaper funding for the direction being opened', () => {
    const cheap = snapshot('gains', { fundingRate: 0.00001 })
    const dear = snapshot('gmx', { fundingRate: 0.0005 })

    const long = pickVenue(BTC, [dear, cheap], { isLong: true })
    expect(long.venue).toBe('gains')
    expect(long.reason).toMatch(/funding/i)

    // Funding is income to the other side: the SAME rates flip the answer for a short.
    const short = pickVenue(BTC, [dear, cheap], { isLong: false })
    expect(short.venue).toBe('gmx')
    expect(short.reason).toMatch(/funding/i)
  })

  it('falls back to the deeper book when funding is effectively identical', () => {
    const shallow = snapshot('gains', { fundingRate: 0.00001, openInterestUsd: 1e7 })
    const deep = snapshot('gmx', { fundingRate: 0.00001, openInterestUsd: 1e9 })
    const r = pickVenue(BTC, [shallow, deep], { isLong: true })
    expect(r.venue).toBe('gmx')
    expect(r.reason).toMatch(/liquidity/i)
  })

  it('a funding difference too small to render does not decide the venue', () => {
    // 1e-9 apart: the UI shows both as the same number, so a "cheaper funding" reason would be
    // unexplainable. Liquidity decides instead.
    const a = snapshot('gains', { fundingRate: 0.00001, openInterestUsd: 1e7 })
    const b = snapshot('gmx', { fundingRate: 0.00001 + 1e-9, openInterestUsd: 1e9 })
    const r = pickVenue(BTC, [a, b], { isLong: true })
    expect(r.venue).toBe('gmx')
    expect(r.reason).toMatch(/liquidity/i)
  })

  it('a venue with known funding beats one whose funding is unreadable', () => {
    const known = snapshot('gains', { fundingRate: 0.0009 })
    const unknown = snapshot('gmx', { fundingRate: null })
    expect(pickVenue(BTC, [unknown, known], { isLong: true }).venue).toBe('gains')
  })

  it('states an honest tie rather than inventing a reason', () => {
    const r = pickVenue(BTC, [snapshot('gains'), snapshot('gmx')], { isLong: true })
    expect(r.venue).toBe('gains') // input order is the tie-break
    expect(r.reason).toMatch(/similar terms/i)
  })

  it('accepts a venue-keyed object as well as an array', () => {
    const r = pickVenue(BTC, { gains: { status: 'CLOSE_ONLY', pairs: [{ symbol: BTC }] }, gmx: snapshot('gmx') })
    expect(r.venue).toBe('gmx')
  })

  it('matches the symbol tolerantly but not loosely', () => {
    expect(pickVenue('btc/usd', [snapshot('gains')]).venue).toBe('gains')
    expect(pickVenue(' BTC / USD ', [snapshot('gains')]).venue).toBe('gains')
    expect(pickVenue('BTC/USDC', [snapshot('gains')]).venue).toBeNull()
  })

  it('always returns a reason, even with nothing to choose from', () => {
    for (const junk of JUNK) {
      const r = pickVenue(junk, junk)
      expect(r.venue).toBeNull()
      expect(typeof r.reason).toBe('string')
      expect(r.reason.length).toBeGreaterThan(0)
    }
    expect(pickVenue(BTC, []).venue).toBeNull()
  })
})

describe('defaultLeverage', () => {
  it('is conservative and far below a high venue maximum', () => {
    expect(defaultLeverage(150)).toBe(CONSERVATIVE_LEVERAGE)
    expect(defaultLeverage(100)).toBe(CONSERVATIVE_LEVERAGE)
    expect(CONSERVATIVE_LEVERAGE).toBeLessThanOrEqual(2)
  })

  it('never exceeds the venue maximum', () => {
    for (const max of [1, 1.5, 2, 3, 10, 150]) {
      expect(defaultLeverage(max)).toBeLessThanOrEqual(max)
    }
  })

  it('respects a venue minimum above the conservative default', () => {
    expect(defaultLeverage(150, { minLeverage: 5 })).toBe(5)
    expect(defaultLeverage(150, { minLeverage: 1 })).toBe(CONSERVATIVE_LEVERAGE)
  })

  it('returns null rather than a fabricated default when the ceiling is unknown', () => {
    for (const junk of JUNK) expect(defaultLeverage(junk)).toBeNull()
    // Contradictory venue bounds are data we cannot resolve, not a default we can invent.
    expect(defaultLeverage(2, { minLeverage: 10 })).toBeNull()
    expect(defaultLeverage(150, null)).toBe(CONSERVATIVE_LEVERAGE)
  })
})

describe('defaultCollateral', () => {
  const VENUE = [
    { symbol: 'USDC', address: '0xAf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, collateralIndex: 3 },
    { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, collateralIndex: 1 },
    { symbol: 'DAI', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, collateralIndex: 2 },
  ]

  it('picks from what the member actually holds', () => {
    const holdings = [{ symbol: 'DAI', address: VENUE[2].address, balance: 500n, decimals: 18 }]
    const r = defaultCollateral(holdings, VENUE)
    expect(r.symbol).toBe('DAI')
    expect(r.collateralIndex).toBe(2)
    expect(r.balance).toBe(500n)
  })

  it('prefers the venue’s stablecoin over a volatile collateral the member also holds', () => {
    // Defaulting to WETH collateral would add a second directional bet to a leveraged position.
    const holdings = [
      { symbol: 'WETH', address: VENUE[1].address, balance: 3n, usdValue: 9_000 },
      { symbol: 'USDC', address: VENUE[0].address, balance: 100n, usdValue: 100 },
    ]
    expect(defaultCollateral(holdings, VENUE).symbol).toBe('USDC')
  })

  it('honours an explicit primary flag over the preference list', () => {
    const holdings = [
      { symbol: 'USDC', address: VENUE[0].address, balance: 100n },
      { symbol: 'DAI', address: VENUE[2].address, balance: 100n },
    ]
    const venue = VENUE.map((c) => (c.symbol === 'DAI' ? { ...c, isPrimary: true } : c))
    expect(defaultCollateral(holdings, venue).symbol).toBe('DAI')
  })

  it('ignores zero balances — a default the member cannot fund is a dead form', () => {
    const holdings = [
      { symbol: 'USDC', address: VENUE[0].address, balance: 0n },
      { symbol: 'DAI', address: VENUE[2].address, balance: 25n },
    ]
    expect(defaultCollateral(holdings, VENUE).symbol).toBe('DAI')
    expect(defaultCollateral([{ symbol: 'USDC', address: VENUE[0].address, balance: 0 }], VENUE)).toBeNull()
  })

  it('matches by address first, so a symbol collision cannot pick the wrong token', () => {
    const impostor = [{ symbol: 'USDC', address: '0x000000000000000000000000000000000000dEaD', balance: 999n }]
    // Same symbol, different token: no venue collateral matches by address, and the symbol
    // fallback is the only thing that could match it — which it does, deliberately, since a venue
    // entry without an address has nothing better to go on.
    const r = defaultCollateral(impostor, [{ symbol: 'USDC', collateralIndex: 3 }])
    expect(r.symbol).toBe('USDC')
    // But when the venue DOES publish an address, the wrong token is not a match.
    expect(defaultCollateral(impostor, VENUE)).toBeNull()
  })

  it('breaks a tie on the larger USD balance', () => {
    const holdings = [
      { symbol: 'USDC', address: VENUE[0].address, balance: 10n, usdValue: 10 },
      { symbol: 'USDC.e', address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', balance: 900n, usdValue: 900 },
    ]
    const venue = [...VENUE, { symbol: 'USDC.e', address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 }]
    // USDC ranks ahead of USDC.e on the preference list, so preference wins over size...
    expect(defaultCollateral(holdings, venue).symbol).toBe('USDC')
    // ...but two entries of the same preference are separated by the deeper balance.
    const sameRank = [
      { symbol: 'DAI', address: VENUE[2].address, balance: 10n, usdValue: 10 },
      { symbol: 'DAI', address: VENUE[2].address, balance: 10n, usdValue: 10 },
    ]
    expect(defaultCollateral(sameRank, VENUE).symbol).toBe('DAI')
  })

  it('returns null rather than a token the member does not hold', () => {
    expect(defaultCollateral([{ symbol: 'PEPE', balance: 100n }], VENUE)).toBeNull()
    for (const junk of JUNK) {
      expect(defaultCollateral(junk, VENUE)).toBeNull()
      expect(defaultCollateral([{ symbol: 'USDC', address: VENUE[0].address, balance: 1n }], junk)).toBeNull()
      expect(defaultCollateral(junk, junk)).toBeNull()
    }
  })
})

describe('defaultSlippage', () => {
  it('is 1 PERCENT — the venue SDK’s own default, not bps and not the 1e3 venue scale', () => {
    expect(defaultSlippage()).toBe(1)
    // The tells of a scale mix-up: 1e3-scaled (1000) or bps (100).
    expect(defaultSlippage()).not.toBe(1000)
    expect(defaultSlippage()).not.toBe(100)
  })

  it('is total under junk arguments', () => {
    for (const junk of JUNK) expect(defaultSlippage(junk)).toBe(1)
  })
})

describe('suggestProtection', () => {
  it('places a long’s stop between the liquidation price and the market', () => {
    const { stopLoss, takeProfit } = suggestProtection({
      entry: 100,
      mark: 100,
      leverage: 10,
      isLong: true,
      liquidationPrice: 90,
    })
    expect(stopLoss).toBeGreaterThan(90)
    expect(stopLoss).toBeLessThan(100)
    expect(takeProfit).toBeGreaterThan(100)
  })

  it('mirrors exactly for a short', () => {
    const { stopLoss, takeProfit } = suggestProtection({
      entry: 100,
      mark: 100,
      leverage: 10,
      isLong: false,
      liquidationPrice: 110,
    })
    expect(stopLoss).toBeLessThan(110)
    expect(stopLoss).toBeGreaterThan(100)
    expect(takeProfit).toBeLessThan(100)
  })

  it('measures from the current price, not entry, on a position that has moved', () => {
    const moved = { entry: 100, mark: 80, leverage: 10, isLong: true, liquidationPrice: 60 }
    const { stopLoss } = suggestProtection(moved)
    expect(stopLoss).toBeLessThan(80)
    expect(stopLoss).toBeGreaterThan(60)
  })

  it('falls back to the leverage-implied distance when the venue reports no liquidation price', () => {
    const { stopLoss } = suggestProtection({ entry: 100, leverage: 10, isLong: true })
    expect(stopLoss).toBeGreaterThan(0)
    expect(stopLoss).toBeLessThan(100)
  })

  it('suggests nothing rather than something unsafe on contradictory data', () => {
    // A long whose liquidation price sits ABOVE the market is not a bound a stop can go inside.
    expect(suggestProtection({ mark: 100, leverage: 10, isLong: true, liquidationPrice: 120 })).toEqual({
      stopLoss: null,
      takeProfit: null,
    })
    expect(suggestProtection({ mark: 100, leverage: 10, isLong: false, liquidationPrice: 80 })).toEqual({
      stopLoss: null,
      takeProfit: null,
    })
    // Neither a liquidation price nor a leverage: nothing to derive a distance from.
    expect(suggestProtection({ mark: 100, isLong: true })).toEqual({ stopLoss: null, takeProfit: null })
    // No direction: every sign below it would be a guess.
    expect(suggestProtection({ mark: 100, leverage: 10, liquidationPrice: 90 })).toEqual({
      stopLoss: null,
      takeProfit: null,
    })
  })

  it('is total: junk in → nulls out, never a throw', () => {
    for (const junk of JUNK) {
      expect(() => suggestProtection(junk)).not.toThrow()
      expect(suggestProtection(junk)).toEqual({ stopLoss: null, takeProfit: null })
      expect(
        suggestProtection({ entry: junk, mark: junk, leverage: junk, isLong: junk, liquidationPrice: junk }),
      ).toEqual({ stopLoss: null, takeProfit: null })
    }
    expect(suggestProtection()).toEqual({ stopLoss: null, takeProfit: null })
  })
})

describe('suggestProtection ⇄ validateProtection', () => {
  it('EVERY suggestion the app makes is a level the app will accept', () => {
    // The whole grid, both directions: a suggestion that validation then refuses is a dead end the
    // member cannot resolve, so these two must never drift apart.
    let checked = 0
    for (const isLong of [true, false]) {
      for (const mark of [0.00093, 1.0841, 63_412.5, 3_100, 42]) {
        for (const leverage of [1.5, 2, 5, 10, 25, 50, 150]) {
          for (const liqFraction of [null, 0.02, 0.1, 0.35, 0.9]) {
            const liquidationPrice =
              liqFraction === null ? null : isLong ? mark * (1 - liqFraction) : mark * (1 + liqFraction)
            const { stopLoss, takeProfit } = suggestProtection({
              entry: mark,
              mark,
              leverage,
              isLong,
              liquidationPrice,
            })
            if (stopLoss === null && takeProfit === null) continue
            const position = {
              direction: isLong ? 'long' : 'short',
              markPrice: mark,
              entryPrice: mark,
              liquidationPrice,
            }
            const r = validateProtection({ position, stopLoss, takeProfit, liquidationPrice, isLong })
            expect(
              r.ok,
              `refused ${isLong ? 'long' : 'short'} mark=${mark} lev=${leverage} liq=${liquidationPrice}: ${r.reason}`,
            ).toBe(true)
            checked += 1
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50) // the grid actually exercised the path
  })

  it('the suggested stop is strictly inside the liquidation bound, never on it', () => {
    for (const isLong of [true, false]) {
      const mark = 2_000
      const liquidationPrice = isLong ? 1_900 : 2_100
      const { stopLoss } = suggestProtection({ mark, leverage: 20, isLong, liquidationPrice })
      expect(stopLoss).not.toBe(liquidationPrice)
      expect(isLong ? stopLoss > liquidationPrice : stopLoss < liquidationPrice).toBe(true)
      // And the boundary itself is refused, which is what "strictly" has to mean.
      const atBound = validateProtection({
        position: { direction: isLong ? 'long' : 'short', markPrice: mark, liquidationPrice },
        stopLoss: liquidationPrice,
        isLong,
      })
      expect(atBound.ok).toBe(false)
    }
  })
})
