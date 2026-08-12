/**
 * Perps refuse-before-prompt validators (spec 083, T016).
 *
 * The load-bearing case is the liquidation bound, exercised in BOTH directions: a stop-loss beyond
 * liquidation looks like protection and provides none, and the sign flips entirely between a long
 * and a short. Everything else here defends the two properties the module promises — totality, and
 * that an unreadable input refuses rather than passes.
 */
import { describe, it, expect } from 'vitest'
import { validateOpen, validateClose, validateProtection, VALIDATION_CODE } from '../../lib/perps/validation'

const JUNK = [null, undefined, NaN, Infinity, -Infinity, 'nope', '', {}, [], true, false, -1, 0]

/** A venue that publishes everything, so a test can isolate the one bound it is exercising. */
const LIMITS = { minLeverage: 2, maxLeverage: 150, minCollateral: 10, maxCollateral: 100_000 }

describe('validateOpen', () => {
  it('passes a well-formed order', () => {
    const r = validateOpen({
      collateralAmount: 100,
      balance: 250,
      leverage: 5,
      venueLimits: LIMITS,
      notional: 500,
      minNotional: 10,
    })
    expect(r.ok).toBe(true)
    expect(r.reason).toBeNull()
  })

  it('refuses an empty or non-positive amount before anything else', () => {
    for (const bad of [null, undefined, 0, '', '0', -5, 'abc']) {
      const r = validateOpen({ collateralAmount: bad, balance: 250, leverage: 5, venueLimits: LIMITS })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(VALIDATION_CODE.AMOUNT_MISSING)
    }
  })

  it('refuses when the balance is unreadable — it never assumes the member has enough', () => {
    const r = validateOpen({ collateralAmount: 100, balance: null, leverage: 5, venueLimits: LIMITS })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(VALIDATION_CODE.BALANCE_UNKNOWN)
  })

  it('refuses an amount above the balance', () => {
    const r = validateOpen({ collateralAmount: 300, balance: 250, leverage: 5, venueLimits: LIMITS })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(VALIDATION_CODE.INSUFFICIENT_BALANCE)
  })

  it('compares base units to base units exactly, past Number.MAX_SAFE_INTEGER', () => {
    // Base units throughout — including the venue's own bounds, which arrive from the chain in the
    // same unit as the amount.
    const limits = { minLeverage: 2, maxLeverage: 150, minCollateral: 10n ** 6n }
    const balance = 10n ** 24n
    expect(validateOpen({ collateralAmount: balance, balance, leverage: 5, venueLimits: limits }).ok).toBe(true)
    expect(
      validateOpen({ collateralAmount: balance + 1n, balance, leverage: 5, venueLimits: limits }).code,
    ).toBe(VALIDATION_CODE.INSUFFICIENT_BALANCE)
    // A float that cannot represent this balance exactly must not be compared against it at all.
    expect(validateOpen({ collateralAmount: balance, balance: 1e24, leverage: 5, venueLimits: limits }).code).toBe(
      VALIDATION_CODE.BALANCE_UNKNOWN,
    )
  })

  it('REFUSES a base-unit amount against a human-unit balance instead of silently passing it', () => {
    // 100 USDC of base units vs a float balance of 100: numerically the bigint is far larger, but
    // the real failure is the reverse — 100 base units (0.0001 USDC) would read as "enough" for a
    // 100 USDC position. Mixed units are never comparable, in either direction.
    const mixed = validateOpen({ collateralAmount: 100_000_000n, balance: 100, leverage: 5, venueLimits: LIMITS })
    expect(mixed.ok).toBe(false)
    expect(mixed.code).toBe(VALIDATION_CODE.BALANCE_UNKNOWN)

    const reversed = validateOpen({ collateralAmount: 100, balance: 100_000_000n, leverage: 5, venueLimits: LIMITS })
    expect(reversed.ok).toBe(false)
    expect(reversed.code).toBe(VALIDATION_CODE.BALANCE_UNKNOWN)
  })

  it('refuses when the venue limits could not be read', () => {
    for (const limits of [null, undefined, 'nope', 5]) {
      const r = validateOpen({ collateralAmount: 100, balance: 250, leverage: 5, venueLimits: limits })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(VALIDATION_CODE.LIMITS_UNKNOWN)
    }
    // A limits object without a maximum leverage is just as unreadable for the leverage check.
    expect(validateOpen({ collateralAmount: 100, balance: 250, leverage: 5, venueLimits: {} }).code).toBe(
      VALIDATION_CODE.LIMITS_UNKNOWN,
    )
  })

  it('honours the venue collateral bounds', () => {
    expect(validateOpen({ collateralAmount: 5, balance: 250, leverage: 5, venueLimits: LIMITS }).code).toBe(
      VALIDATION_CODE.BELOW_VENUE_MINIMUM,
    )
    expect(
      validateOpen({ collateralAmount: 200_000, balance: 500_000, leverage: 5, venueLimits: LIMITS }).code,
    ).toBe(VALIDATION_CODE.ABOVE_VENUE_MAXIMUM)
  })

  it('honours the venue leverage bounds and names them in plain words', () => {
    const low = validateOpen({ collateralAmount: 100, balance: 250, leverage: 1, venueLimits: LIMITS })
    expect(low.code).toBe(VALIDATION_CODE.LEVERAGE_BELOW_MIN)
    expect(low.reason).toContain('2×')

    const high = validateOpen({ collateralAmount: 100, balance: 250, leverage: 200, venueLimits: LIMITS })
    expect(high.code).toBe(VALIDATION_CODE.LEVERAGE_ABOVE_MAX)
    expect(high.reason).toContain('150×')

    expect(validateOpen({ collateralAmount: 100, balance: 250, leverage: null, venueLimits: LIMITS }).code).toBe(
      VALIDATION_CODE.LEVERAGE_MISSING,
    )
  })

  it('refuses a position below the venue minimum size, and above its maximum', () => {
    expect(
      validateOpen({
        collateralAmount: 100,
        balance: 250,
        leverage: 5,
        venueLimits: LIMITS,
        notional: 500,
        minNotional: 1_500,
      }).code,
    ).toBe(VALIDATION_CODE.BELOW_MIN_NOTIONAL)

    expect(
      validateOpen({
        collateralAmount: 100,
        balance: 250,
        leverage: 5,
        venueLimits: { ...LIMITS, maxNotional: 400 },
        notional: 500,
      }).code,
    ).toBe(VALIDATION_CODE.ABOVE_MAX_NOTIONAL)
  })

  it('refuses when a bound exists but the size could not be worked out', () => {
    const r = validateOpen({
      collateralAmount: 100,
      balance: 250,
      leverage: 5,
      venueLimits: LIMITS,
      notional: null,
      minNotional: 10,
    })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(VALIDATION_CODE.NOTIONAL_UNKNOWN)
  })

  it('an ABSENT venue minimum is a fact, not an unknown — it passes without one', () => {
    const r = validateOpen({
      collateralAmount: 100,
      balance: 250,
      leverage: 5,
      venueLimits: LIMITS,
      notional: null,
      minNotional: null,
    })
    expect(r.ok).toBe(true)
  })

  it('never leaks a raw venue error into a member-facing reason', () => {
    const refusals = [
      validateOpen({}),
      validateOpen({ collateralAmount: 100, balance: null }),
      validateOpen({ collateralAmount: 300, balance: 250, leverage: 5, venueLimits: LIMITS }),
      validateOpen({ collateralAmount: 100, balance: 250, leverage: 500, venueLimits: LIMITS }),
    ]
    for (const r of refusals) {
      expect(r.ok).toBe(false)
      expect(typeof r.reason).toBe('string')
      expect(r.reason.length).toBeGreaterThan(10)
      expect(r.reason).not.toMatch(/revert|0x[0-9a-f]{8}|\(\)$|Error|_msgSender/i)
    }
  })
})

describe('validateClose — the exit path', () => {
  const position = { sizeUsd: 5_000, direction: 'long' }

  it('passes a full close and a partial one', () => {
    expect(validateClose({ position, closeFraction: 1 }).ok).toBe(true)
    expect(validateClose({ position, closeFraction: 0.5 }).ok).toBe(true)
    expect(validateClose({ position, closeFraction: 0.0001 }).ok).toBe(true)
  })

  it('accepts a GMX 1e30 size as a bigint', () => {
    expect(validateClose({ position: { sizeInUsd: 5_000n * 10n ** 30n }, closeFraction: 1 }).ok).toBe(true)
  })

  it('refuses only an unreadable position or a nonsensical share', () => {
    expect(validateClose({ position: null, closeFraction: 1 }).code).toBe(VALIDATION_CODE.POSITION_UNREADABLE)
    expect(validateClose({ position: { sizeUsd: 0 }, closeFraction: 1 }).code).toBe(VALIDATION_CODE.POSITION_UNREADABLE)
    expect(validateClose({ position, closeFraction: null }).code).toBe(VALIDATION_CODE.FRACTION_MISSING)
    expect(validateClose({ position, closeFraction: 0 }).code).toBe(VALIDATION_CODE.FRACTION_INVALID)
    expect(validateClose({ position, closeFraction: -0.5 }).code).toBe(VALIDATION_CODE.FRACTION_INVALID)
    expect(validateClose({ position, closeFraction: 1.5 }).code).toBe(VALIDATION_CODE.FRACTION_TOO_LARGE)
  })

  it('SC-004: no restriction can reach it — screening, killswitch and venue state are not inputs', () => {
    // Passing every gate this product has, all set to their most restrictive value, changes nothing:
    // there is no parameter for them, so no future caller can accidentally wire one in.
    const gated = validateClose({
      position,
      closeFraction: 1,
      screeningBlocked: true,
      sanctioned: true,
      attested: false,
      killswitch: true,
      featureEnabled: false,
      venueStatus: 'PAUSED',
      restrictedRegion: true,
    })
    expect(gated.ok).toBe(true)
    expect(gated.reason).toBeNull()
  })
})

describe('validateProtection — the liquidation bound', () => {
  // A long at 100 with liquidation at 90: the safe stop window is 90 < stop < 100 (mark).
  const long = { direction: 'long', entryPrice: 100, markPrice: 100, liquidationPrice: 90 }
  // A short at 100 with liquidation at 110: the window mirrors — 100 < stop < 110.
  const short = { direction: 'short', entryPrice: 100, markPrice: 100, liquidationPrice: 110 }

  it('LONG: refuses a stop at or below the liquidation price', () => {
    for (const stopLoss of [90, 89.99, 50, 1]) {
      const r = validateProtection({ position: long, stopLoss, isLong: true })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(VALIDATION_CODE.STOP_BEYOND_LIQUIDATION)
      expect(r.reason).toMatch(/liquidat/i)
    }
  })

  it('LONG: accepts a stop inside the bound and below the mark', () => {
    for (const stopLoss of [90.01, 95, 99.99]) {
      expect(validateProtection({ position: long, stopLoss, isLong: true }).ok).toBe(true)
    }
  })

  it('SHORT: refuses a stop at or above the liquidation price — the sign is mirrored', () => {
    for (const stopLoss of [110, 110.01, 200]) {
      const r = validateProtection({ position: short, stopLoss, isLong: false })
      expect(r.ok).toBe(false)
      expect(r.code).toBe(VALIDATION_CODE.STOP_BEYOND_LIQUIDATION)
    }
  })

  it('SHORT: accepts a stop inside the bound and above the mark', () => {
    for (const stopLoss of [100.01, 105, 109.99]) {
      expect(validateProtection({ position: short, stopLoss, isLong: false }).ok).toBe(true)
    }
  })

  it('a stop safe for a long is refused for a short at the same prices, and vice versa', () => {
    // The same number, the same market: only the direction differs. If the sign were dropped, one
    // of these two would wrongly pass.
    expect(validateProtection({ position: long, stopLoss: 95, isLong: true }).ok).toBe(true)
    expect(validateProtection({ position: { ...long, liquidationPrice: 110 }, stopLoss: 95, isLong: false }).ok).toBe(
      false,
    )
    expect(validateProtection({ position: short, stopLoss: 105, isLong: false }).ok).toBe(true)
    expect(validateProtection({ position: { ...short, liquidationPrice: 90 }, stopLoss: 105, isLong: true }).ok).toBe(
      false,
    )
  })

  it('refuses a stop on the wrong side of the current price (it would close immediately)', () => {
    expect(validateProtection({ position: long, stopLoss: 100, isLong: true }).code).toBe(
      VALIDATION_CODE.STOP_WRONG_SIDE,
    )
    expect(validateProtection({ position: long, stopLoss: 120, isLong: true }).code).toBe(
      VALIDATION_CODE.STOP_WRONG_SIDE,
    )
    expect(validateProtection({ position: short, stopLoss: 100, isLong: false }).code).toBe(
      VALIDATION_CODE.STOP_WRONG_SIDE,
    )
    expect(validateProtection({ position: short, stopLoss: 80, isLong: false }).code).toBe(
      VALIDATION_CODE.STOP_WRONG_SIDE,
    )
  })

  it('refuses a take-profit on the wrong side of the mark, in both directions', () => {
    expect(validateProtection({ position: long, takeProfit: 100, isLong: true }).code).toBe(
      VALIDATION_CODE.TAKE_PROFIT_WRONG_SIDE,
    )
    expect(validateProtection({ position: long, takeProfit: 80, isLong: true }).code).toBe(
      VALIDATION_CODE.TAKE_PROFIT_WRONG_SIDE,
    )
    expect(validateProtection({ position: short, takeProfit: 100, isLong: false }).code).toBe(
      VALIDATION_CODE.TAKE_PROFIT_WRONG_SIDE,
    )
    expect(validateProtection({ position: short, takeProfit: 130, isLong: false }).code).toBe(
      VALIDATION_CODE.TAKE_PROFIT_WRONG_SIDE,
    )
    expect(validateProtection({ position: long, takeProfit: 130, isLong: true }).ok).toBe(true)
    expect(validateProtection({ position: short, takeProfit: 80, isLong: false }).ok).toBe(true)
  })

  it('takes the direction from the position when it is not passed explicitly', () => {
    expect(validateProtection({ position: long, stopLoss: 95 }).ok).toBe(true)
    expect(validateProtection({ position: short, stopLoss: 95 }).code).toBe(VALIDATION_CODE.STOP_WRONG_SIDE)
    expect(validateProtection({ position: { ...long, isLong: true, direction: undefined }, stopLoss: 95 }).ok).toBe(true)
  })

  it('refuses when the direction cannot be read — a direction-blind check is worse than none', () => {
    const r = validateProtection({ position: { markPrice: 100, liquidationPrice: 90 }, stopLoss: 95 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(VALIDATION_CODE.DIRECTION_UNKNOWN)
  })

  it('refuses when no price for the market can be read', () => {
    const r = validateProtection({ position: { direction: 'long' }, stopLoss: 95 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe(VALIDATION_CODE.PRICE_UNKNOWN)
  })

  it('measures against the CURRENT price, not entry, on a position that has moved', () => {
    // Long, entry 100, now 80, liquidation 60. A stop at 90 is above the market: it would fire the
    // moment it is set. Judged against entry alone it would have looked fine.
    const moved = { direction: 'long', entryPrice: 100, markPrice: 80, liquidationPrice: 60 }
    expect(validateProtection({ position: moved, stopLoss: 90 }).code).toBe(VALIDATION_CODE.STOP_WRONG_SIDE)
    expect(validateProtection({ position: moved, stopLoss: 70 }).ok).toBe(true)
  })

  it('allows clearing protection — 0 and blank are how the venues spell "no stop"', () => {
    expect(validateProtection({ position: long, stopLoss: null, takeProfit: null }).ok).toBe(true)
    expect(validateProtection({ position: long, stopLoss: 0, takeProfit: 0 }).ok).toBe(true)
    expect(validateProtection({ position: long, stopLoss: '', takeProfit: '' }).ok).toBe(true)
    expect(validateProtection({ position: long, stopLoss: 0n, takeProfit: 0n }).ok).toBe(true)
  })

  it('refuses a junk price rather than treating it as a removal', () => {
    for (const bad of ['abc', -5, NaN, Infinity]) {
      expect(validateProtection({ position: long, stopLoss: bad }).code).toBe(VALIDATION_CODE.PRICE_INVALID)
    }
  })

  it('WARNS rather than refuses when the liquidation price is unreadable', () => {
    // Refusing here would leave a live position with no stop at all over a number we could not
    // fetch. The gap is disclosed instead of hidden.
    const noLiq = { direction: 'long', markPrice: 100 }
    const r = validateProtection({ position: noLiq, stopLoss: 95 })
    expect(r.ok).toBe(true)
    expect(r.warning).toMatch(/liquidation price/i)
  })

  it('SC-004: protection is an exit-side control — no restriction is an input to it', () => {
    const gated = validateProtection({
      position: long,
      stopLoss: 95,
      isLong: true,
      screeningBlocked: true,
      killswitch: true,
      attested: false,
      venueStatus: 'PAUSED',
    })
    expect(gated.ok).toBe(true)
  })
})

describe('perps validation — totality', () => {
  it('junk in → a refusal, never a throw and never a silent pass', () => {
    for (const junk of JUNK) {
      for (const call of [
        () => validateOpen(junk),
        () => validateClose(junk),
        () => validateProtection(junk),
        () => validateOpen({ collateralAmount: junk, balance: junk, leverage: junk, venueLimits: junk }),
        () => validateClose({ position: junk, closeFraction: junk }),
        () => validateProtection({ position: junk, stopLoss: junk, takeProfit: junk, isLong: junk }),
      ]) {
        expect(call).not.toThrow()
        const r = call()
        expect(r.ok).toBe(false)
        expect(typeof r.reason).toBe('string')
      }
    }
  })

  it('survives a hostile object whose getters throw', () => {
    const hostile = {
      get sizeUsd() {
        throw new Error('boom')
      },
      get markPrice() {
        throw new Error('boom')
      },
      get direction() {
        throw new Error('boom')
      },
    }
    expect(() => validateClose({ position: hostile, closeFraction: 1 })).not.toThrow()
    expect(validateClose({ position: hostile, closeFraction: 1 }).ok).toBe(false)
    expect(() => validateProtection({ position: hostile, stopLoss: 95 })).not.toThrow()
    expect(validateProtection({ position: hostile, stopLoss: 95 }).ok).toBe(false)
    expect(() => validateOpen({ collateralAmount: 1, balance: 2, leverage: 5, venueLimits: hostile })).not.toThrow()
  })

  it('called with no arguments at all', () => {
    expect(validateOpen().ok).toBe(false)
    expect(validateClose().ok).toBe(false)
    expect(validateProtection().ok).toBe(false)
  })
})
