/**
 * Perps input validation (spec 083, T016) — the checks that run BEFORE any wallet prompt.
 *
 * FR-022: every state-changing perps action refuses with a plain reason rather than letting the
 * member sign something the venue will reject. The reasons here are MEMBER-FACING sentences, never
 * a revert selector and never a venue error string: `Paused()`, `BelowMinPositionSizeUsd` and
 * `WaitTimeout()` tell a member nothing, and by the time they appear the member has already paid
 * gas to learn it.
 *
 * TOTALITY (the lib/perps/format.js convention). These run on every keystroke to drive a disabled
 * submit button and its inline explanation, so a throw takes the sheet down mid-typing. Every
 * export returns `{ ok, reason, code }` — never throws, and `ok: false` is the answer for junk
 * input too. An input we could not READ is a refusal with an honest "could not be checked" reason,
 * never a pass: a validator that shrugs at a missing balance is a validator that lets a member
 * sign a transaction that will revert with their gas.
 *
 * WHAT IS DELIBERATELY ABSENT. `validateClose` and `validateProtection` accept no screening,
 * jurisdiction, killswitch or venue-status input at all — not "accept and ignore", but no
 * parameter to pass. FR-014/FR-015/SC-004: nothing may stand between a member and exiting or
 * limiting the downside of a position they already hold. The gates live on the OPENING path only,
 * and `validateOpen` is the only function here that could ever grow one.
 */
import { formatPairPrice } from './format'

/** Stable codes for tests and for UI that wants to style a specific refusal. Text may be reworded. */
export const VALIDATION_CODE = Object.freeze({
  OK: 'ok',
  UNCHECKED: 'unchecked',
  AMOUNT_MISSING: 'amount_missing',
  BALANCE_UNKNOWN: 'balance_unknown',
  INSUFFICIENT_BALANCE: 'insufficient_balance',
  BELOW_VENUE_MINIMUM: 'below_venue_minimum',
  ABOVE_VENUE_MAXIMUM: 'above_venue_maximum',
  LIMITS_UNKNOWN: 'limits_unknown',
  LEVERAGE_MISSING: 'leverage_missing',
  LEVERAGE_BELOW_MIN: 'leverage_below_min',
  LEVERAGE_ABOVE_MAX: 'leverage_above_max',
  NOTIONAL_UNKNOWN: 'notional_unknown',
  BELOW_MIN_NOTIONAL: 'below_min_notional',
  ABOVE_MAX_NOTIONAL: 'above_max_notional',
  POSITION_UNREADABLE: 'position_unreadable',
  FRACTION_MISSING: 'fraction_missing',
  FRACTION_INVALID: 'fraction_invalid',
  FRACTION_TOO_LARGE: 'fraction_too_large',
  DIRECTION_UNKNOWN: 'direction_unknown',
  PRICE_UNKNOWN: 'price_unknown',
  PRICE_INVALID: 'price_invalid',
  STOP_BEYOND_LIQUIDATION: 'stop_beyond_liquidation',
  STOP_WRONG_SIDE: 'stop_wrong_side',
  TAKE_PROFIT_WRONG_SIDE: 'take_profit_wrong_side',
})

const OK = Object.freeze({ ok: true, reason: null, code: VALIDATION_CODE.OK })

function ok(extra) {
  return extra ? { ...OK, ...extra } : OK
}

function refuse(code, reason) {
  return { ok: false, reason, code }
}

/**
 * Last-resort guard. A validator that throws would take down the sheet it is meant to protect, so
 * an unforeseen shape refuses honestly instead of crashing — and refuses rather than passes,
 * because "we could not check this" must never become "this is fine".
 */
function total(fn) {
  try {
    return fn()
  } catch {
    return refuse(VALIDATION_CODE.UNCHECKED, 'This could not be checked just now. Please try again.')
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Amounts
 *
 * Token amounts arrive here in two incompatible forms: exact base units (bigint, straight off the
 * chain or out of parseUnits) and human units (a Number from an input field). They are NEVER
 * compared across forms. 100 USDC as a human float and 100 base units as a bigint both read as
 * "100", and comparing them would pass a member holding 0.0001 USDC as having enough for a 100
 * USDC position. A mismatch is a refusal, not a coercion.
 * ------------------------------------------------------------------------------------------- */

/** → `{ kind: 'bigint'|'number', value }` or null. Digit-only strings stay EXACT as bigint. */
function amount(value) {
  if (typeof value === 'bigint') return value < 0n ? null : { kind: 'bigint', value }
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null
  if (typeof value === 'string') {
    const s = value.trim()
    if (s === '') return null
    if (/^\d+$/.test(s)) return { kind: 'bigint', value: BigInt(s) }
  }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return { kind: 'number', value: n }
}

function isPositive(a) {
  if (!a) return false
  return a.kind === 'bigint' ? a.value > 0n : a.value > 0
}

/** -1 / 0 / 1, or null when the two are not comparable (different units, or unreadable). */
function compare(a, b) {
  if (!a || !b || a.kind !== b.kind) return null
  if (a.value === b.value) return 0
  return a.value < b.value ? -1 : 1
}

/** A finite positive Number, or null. Prices and leverages are always human-unit floats here. */
function positiveNumber(value) {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/* ------------------------------------------------------------------------------------------- *
 * Opening
 * ------------------------------------------------------------------------------------------- */

/**
 * Everything that must hold before a member is asked to sign an opening order.
 *
 * @param collateralAmount  what the member is committing — bigint base units or a human Number
 * @param balance           what they hold, IN THE SAME UNIT as `collateralAmount`
 * @param leverage          the multiplier as a plain number (10 = 10x), never the 1e3 venue scale
 * @param venueLimits       `{ minLeverage?, maxLeverage, minCollateral?, maxCollateral?, maxNotional? }`
 *                          — the venue's own published bounds, in the venue's own units
 * @param notional          collateral x leverage, in whatever unit `minNotional` is quoted in
 * @param minNotional       the venue's minimum position size, or null/undefined when the venue
 *                          publishes none. ABSENT is not the same as UNKNOWN: a venue with no
 *                          published minimum is a fact, and skipping a check nobody imposes is not
 *                          a silent pass.
 */
export function validateOpen(input) {
  return total(() => {
    // Destructured INSIDE the guard: `validateOpen(null)` throws in a parameter-list destructure,
    // and a validator that crashes on a null argument is not total.
    const { collateralAmount, balance, leverage, venueLimits, notional, minNotional } = input ?? {}
    const collateral = amount(collateralAmount)
    if (!isPositive(collateral)) {
      return refuse(VALIDATION_CODE.AMOUNT_MISSING, 'Enter how much you want to put into this position.')
    }

    const held = amount(balance)
    if (!held) {
      return refuse(
        VALIDATION_CODE.BALANCE_UNKNOWN,
        'Your balance could not be read, so this cannot be checked yet. Please try again in a moment.',
      )
    }
    const vsBalance = compare(collateral, held)
    if (vsBalance === null) {
      return refuse(
        VALIDATION_CODE.BALANCE_UNKNOWN,
        'Your balance could not be checked against this amount. Please try again in a moment.',
      )
    }
    if (vsBalance > 0) {
      return refuse(VALIDATION_CODE.INSUFFICIENT_BALANCE, 'That is more than the balance you hold.')
    }

    if (!venueLimits || typeof venueLimits !== 'object') {
      return refuse(
        VALIDATION_CODE.LIMITS_UNKNOWN,
        'The venue’s trading limits could not be read, so this cannot be checked yet.',
      )
    }

    const minCollateral = amount(venueLimits.minCollateral)
    if (minCollateral && isPositive(minCollateral)) {
      const vs = compare(collateral, minCollateral)
      if (vs === null) {
        return refuse(VALIDATION_CODE.LIMITS_UNKNOWN, 'The venue’s minimum could not be checked against this amount.')
      }
      if (vs < 0) return refuse(VALIDATION_CODE.BELOW_VENUE_MINIMUM, 'That is below the venue’s minimum for this market.')
    }

    const maxCollateral = amount(venueLimits.maxCollateral)
    if (maxCollateral && isPositive(maxCollateral)) {
      const vs = compare(collateral, maxCollateral)
      if (vs === null) {
        return refuse(VALIDATION_CODE.LIMITS_UNKNOWN, 'The venue’s maximum could not be checked against this amount.')
      }
      if (vs > 0) return refuse(VALIDATION_CODE.ABOVE_VENUE_MAXIMUM, 'That is above the venue’s maximum for this market.')
    }

    const lev = positiveNumber(leverage)
    if (lev === null) return refuse(VALIDATION_CODE.LEVERAGE_MISSING, 'Choose a leverage for this position.')

    const maxLeverage = positiveNumber(venueLimits.maxLeverage)
    if (maxLeverage === null) {
      return refuse(
        VALIDATION_CODE.LIMITS_UNKNOWN,
        'The venue’s maximum leverage could not be read, so this cannot be checked yet.',
      )
    }
    // Below 1x is not a leveraged position at all — no venue accepts it, and it is the tell of a
    // 1e3-scaled value that lost its scale somewhere upstream.
    const minLeverage = positiveNumber(venueLimits.minLeverage) ?? 1
    if (lev < minLeverage) {
      return refuse(
        VALIDATION_CODE.LEVERAGE_BELOW_MIN,
        `The venue’s lowest leverage for this market is ${formatMultiplier(minLeverage)}.`,
      )
    }
    if (lev > maxLeverage) {
      return refuse(
        VALIDATION_CODE.LEVERAGE_ABOVE_MAX,
        `The venue allows at most ${formatMultiplier(maxLeverage)} on this market.`,
      )
    }

    const size = amount(notional)
    const floor = amount(minNotional)
    const ceiling = amount(venueLimits.maxNotional)

    // A minimum/maximum the venue DOES impose and a size we cannot compute is the unknown case: we
    // would be submitting into a bound we cannot verify.
    if ((floor && isPositive(floor)) || (ceiling && isPositive(ceiling))) {
      if (!isPositive(size)) {
        return refuse(
          VALIDATION_CODE.NOTIONAL_UNKNOWN,
          'The size of this position could not be worked out, so it cannot be checked against the venue’s limits.',
        )
      }
    }
    if (floor && isPositive(floor) && isPositive(size)) {
      const vs = compare(size, floor)
      if (vs === null) {
        return refuse(VALIDATION_CODE.NOTIONAL_UNKNOWN, 'This position’s size could not be checked against the venue’s minimum.')
      }
      if (vs < 0) {
        return refuse(
          VALIDATION_CODE.BELOW_MIN_NOTIONAL,
          'This position is smaller than the venue’s minimum. Increase the amount or the leverage.',
        )
      }
    }
    if (ceiling && isPositive(ceiling) && isPositive(size)) {
      const vs = compare(size, ceiling)
      if (vs === null) {
        return refuse(VALIDATION_CODE.NOTIONAL_UNKNOWN, 'This position’s size could not be checked against the venue’s maximum.')
      }
      if (vs > 0) {
        return refuse(
          VALIDATION_CODE.ABOVE_MAX_NOTIONAL,
          'This position is larger than the venue’s maximum. Reduce the amount or the leverage.',
        )
      }
    }

    return ok()
  })
}

/* ------------------------------------------------------------------------------------------- *
 * Closing / reducing
 * ------------------------------------------------------------------------------------------- */

/**
 * The ONLY checks on the exit path: that there is a position to act on, and that the member asked
 * for a sensible share of it. Nothing else may be added here (SC-004).
 *
 * @param position       the venue's position record — any of `sizeUsd` / `sizeInUsd` / `size`
 * @param closeFraction  the share to close, 0 < f <= 1 (1 = close it all)
 */
export function validateClose(input) {
  return total(() => {
    const { position, closeFraction } = input ?? {}
    const size = positionSize(position)
    if (!isPositive(size)) {
      return refuse(
        VALIDATION_CODE.POSITION_UNREADABLE,
        'This position could not be read from the venue, so it cannot be closed from here yet. You can also manage it on the venue.',
      )
    }

    if (closeFraction == null || closeFraction === '') {
      return refuse(VALIDATION_CODE.FRACTION_MISSING, 'Choose how much of this position to close.')
    }
    const fraction = Number(closeFraction)
    if (!Number.isFinite(fraction) || fraction <= 0) {
      return refuse(VALIDATION_CODE.FRACTION_INVALID, 'Choose how much of this position to close.')
    }
    if (fraction > 1) {
      return refuse(VALIDATION_CODE.FRACTION_TOO_LARGE, 'You cannot close more than the whole position.')
    }

    return ok()
  })
}

/** Position size in whatever unit the venue reported it — bigint 1e30 on GMX, USD float on Gains. */
function positionSize(position) {
  if (!position || typeof position !== 'object') return null
  for (const key of ['sizeUsd', 'sizeInUsd', 'size']) {
    const a = amount(position[key])
    if (isPositive(a)) return a
  }
  return null
}

/* ------------------------------------------------------------------------------------------- *
 * Protection (stop-loss / take-profit)
 * ------------------------------------------------------------------------------------------- */

/**
 * US2 acceptance 2 — a stop-loss BEYOND the liquidation price must be refused before the wallet
 * prompt, because the venue would liquidate the position before the stop could ever close it. The
 * member's stop would look like protection and provide none.
 *
 * Direction-aware, and there is no symmetric shortcut: for a LONG the safe window is
 * `liquidation < stop < mark` and take-profit sits above the mark; for a SHORT every one of those
 * flips. Getting the sign wrong here inverts the safety check into a hazard, which is why the
 * tests exercise both directions rather than one and a mirror.
 *
 * Clearing protection (`null` / `0` / `''`) is always allowed — 0 is how both venues spell "no
 * stop", and removing a stop is not an action anyone should have to argue past a validator.
 *
 * @param position         the venue's position record (supplies mark/entry, direction, liquidation)
 * @param stopLoss         requested stop price, or null/0 to clear
 * @param takeProfit       requested take-profit price, or null/0 to clear
 * @param liquidationPrice the venue's liquidation price; falls back to `position.liquidationPrice`
 * @param isLong           direction; falls back to the position's own
 */
export function validateProtection(input) {
  return total(() => {
    const { position, stopLoss, takeProfit, liquidationPrice, isLong } = input ?? {}
    const long = resolveDirection(isLong, position)
    if (long === null) {
      return refuse(
        VALIDATION_CODE.DIRECTION_UNKNOWN,
        'Whether this position is long or short could not be read, so a stop cannot be checked against it.',
      )
    }

    const sl = optionalPrice(stopLoss)
    const tp = optionalPrice(takeProfit)
    if (sl === 'invalid' || tp === 'invalid') {
      return refuse(VALIDATION_CODE.PRICE_INVALID, 'Enter a price above zero, or leave it blank to remove it.')
    }
    if (sl === null && tp === null) return ok() // clearing both — nothing left to check

    const mark = referencePrice(position)
    if (mark === null) {
      return refuse(
        VALIDATION_CODE.PRICE_UNKNOWN,
        'The current price for this market could not be read, so these levels cannot be checked yet.',
      )
    }

    const liq = positiveNumber(liquidationPrice) ?? positiveNumber(position?.liquidationPrice)

    if (sl !== null) {
      if (long && sl >= mark) {
        return refuse(
          VALIDATION_CODE.STOP_WRONG_SIDE,
          `A stop-loss on a long has to sit below the current price (${formatPairPrice(mark)}) — above it, the venue would close the position straight away.`,
        )
      }
      if (!long && sl <= mark) {
        return refuse(
          VALIDATION_CODE.STOP_WRONG_SIDE,
          `A stop-loss on a short has to sit above the current price (${formatPairPrice(mark)}) — below it, the venue would close the position straight away.`,
        )
      }
      // THE LIQUIDATION BOUND. A long is liquidated as price FALLS, so a stop at or below the
      // liquidation price never fires; a short is liquidated as price RISES, so the bound is above.
      if (liq !== null) {
        const beyond = long ? sl <= liq : sl >= liq
        if (beyond) {
          return refuse(
            VALIDATION_CODE.STOP_BEYOND_LIQUIDATION,
            `That stop is ${long ? 'at or below' : 'at or above'} the liquidation price (${formatPairPrice(liq)}), so the position would be liquidated before the stop could close it. Choose a price ${long ? 'above' : 'below'} it.`,
          )
        }
      }
    }

    if (tp !== null) {
      if (long && tp <= mark) {
        return refuse(
          VALIDATION_CODE.TAKE_PROFIT_WRONG_SIDE,
          `A take-profit on a long has to sit above the current price (${formatPairPrice(mark)}).`,
        )
      }
      if (!long && tp >= mark) {
        return refuse(
          VALIDATION_CODE.TAKE_PROFIT_WRONG_SIDE,
          `A take-profit on a short has to sit below the current price (${formatPairPrice(mark)}).`,
        )
      }
    }

    // An unreadable liquidation price WARNS rather than refuses. Refusing would leave a live
    // position with no stop at all over a number we could not fetch — strictly worse than an
    // unverified stop, and the venue rejects a genuinely impossible one itself (Gains cancels with
    // LIQ_REACHED). The warning is surfaced, so this is disclosed, not silent.
    if (sl !== null && liq === null) {
      return ok({
        warning:
          'The liquidation price for this position could not be read, so we could not confirm your stop sits inside it.',
      })
    }

    return ok()
  })
}

/** true / false / null. `isLong` wins; otherwise the position's own direction. */
function resolveDirection(isLong, position) {
  if (isLong === true || isLong === false) return isLong
  if (position && typeof position === 'object') {
    if (position.isLong === true || position.isLong === false) return position.isLong
    const dir = typeof position.direction === 'string' ? position.direction.trim().toLowerCase() : null
    if (dir === 'long') return true
    if (dir === 'short') return false
  }
  return null
}

/**
 * The price a trigger is measured against. `entryPrice` is the last resort rather than the first
 * choice: it is a real venue-reported number (never fabricated), but a stop is compared against
 * where the market is NOW, and on a position that has moved, entry is the wrong yardstick.
 */
function referencePrice(position) {
  if (!position || typeof position !== 'object') return null
  for (const key of ['markPrice', 'currentPrice', 'price', 'entryPrice']) {
    const p = positiveNumber(position[key])
    if (p !== null) return p
  }
  return null
}

/** null = "remove this level" (blank / 0 — how both venues spell it); 'invalid' = junk. */
function optionalPrice(value) {
  if (value == null || value === '' || value === 0 || value === 0n) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const p = positiveNumber(value)
  return p === null ? 'invalid' : p
}

/** '10×' / '1.5×' — leverage inside a sentence, matching format.js's formatLeverage rendering. */
function formatMultiplier(n) {
  return `${n % 1 === 0 ? n : Number(n.toFixed(1))}×`
}
