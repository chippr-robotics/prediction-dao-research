/**
 * The PositionSheet's venue work (spec 083, T034 + T040) — the descriptors an exit or a protection
 * change is made of, and the live fee rate that is disclosed before either.
 *
 * Its own module because `PositionSheet.jsx` may only export components
 * (`react-refresh/only-export-components`, the `components/perps/pendingOrderRecovery.js`
 * convention) — and because these are the parts worth testing directly rather than only through
 * the DOM: the ownership fields they never touch, the index space they never cross, and the
 * refusals they produce BEFORE a wallet prompt are the whole safety story of the exit path.
 *
 * NOTHING HERE MAY BECOME A GATE. This module is on the exit path, so it does not import the
 * attestation, the management kill switch, or the venue's open-permission check, and a sibling
 * test greps this file for each of those names.
 *
 * TOTALITY: every export runs from a click handler or a render, over whatever the venue reported.
 * Junk in yields a refusal with a member-facing sentence — never a throw, and never a silent pass.
 */

import { Contract } from 'ethers'

import { GMX_DATA_STORE_ABI } from '../../abis/perps/gmxDataStore'
import { gmxAddressesFor, perpsUiFeeReceiver } from '../../config/perps'
import { defaultSlippage } from '../../lib/perps/defaults'
import { gmxUiFeeFactorKey, gmxUiFeeFactorToBps } from '../../lib/perps/feeUnits'
import { isTradeIndex, tradeIndex as brandTradeIndex } from '../../lib/perps/venues/gains'
import { getReadProvider } from '../../utils/rpcProvider'

/* ------------------------------------------------------------------------------------------- *
 * Descriptor builders — pure, exported, and the only place venue params are assembled
 *
 * They return `{ ok: false, reason }` rather than throwing: a member-facing sentence BEFORE any
 * wallet prompt is the whole of FR-022, and a builder throw at signing time would be a developer
 * message in front of someone's money. Where a value genuinely cannot be established, the refusal
 * names the venue's own surface as the way through — an exit is never simply withheld.
 * ------------------------------------------------------------------------------------------- */

function refuse(reason) {
  return { ok: false, reason }
}

/** A branded Gains TRADE index, or null. Only ever read from the field NAMED `tradeIndex`. */
function gainsTradeIndexOf(position) {
  const raw = position?.venueRef?.tradeIndex
  if (raw == null) return null
  // Already branded by `usePerpsPositions` in the normal path. A raw value is branded here rather
  // than refused, because `venueRef.tradeIndex` is a NAMED crossing of the boundary — the same one
  // the positions hook makes. What must never happen is reading `index` / `pendingOrderIndex` into
  // this: that is the index trap, and it acts on a different object (contracts/venue-calldata.md).
  if (isTradeIndex(raw)) return raw
  try {
    return brandTradeIndex(raw)
  } catch {
    return null
  }
}

/** `value × percent / 100`, exact in venue units. */
function shareOf(value, percent) {
  if (typeof value !== 'bigint') return null
  if (percent >= 100) return value
  return (value * BigInt(Math.round(percent))) / 100n
}

/**
 * The price bound for a DECREASE, in human units.
 *
 * A decrease of a LONG is a sell, so `acceptablePrice` is a MINIMUM; a decrease of a SHORT is a
 * buy, so it is a MAXIMUM. This asymmetry is the trap: `0` is a perfectly safe "any price" bound
 * for a long and an order that can NEVER fill for a short.
 */
function decreaseAcceptablePrice(price, isLong, slippagePct) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return null
  const s = Math.max(0, Number(slippagePct) || 0) / 100
  const bound = isLong ? p * (1 - s) : p * (1 + s)
  return bound > 0 ? bound : null
}

/**
 * The descriptor for closing or reducing a position.
 *
 * `percent` is the share the member asked to close; 100 is a full close (`action: 'close'`) and
 * anything less is a reduce (`action: 'reduce'`) — two different venue calls on Gains, the same
 * call with a smaller size on GMX.
 */
export function buildExitDescriptor(input) {
  const {
    position,
    percent = 100,
    markPrice = null,
    slippagePct = defaultSlippage(),
    quote = null,
    uiFeeReceiver = null,
  } = input ?? {}
  const venue = position?.venue ?? null
  const chainId = Number(position?.chainId ?? position?.venueRef?.chainId)
  const isLong = directionOf(position)
  const full = Number(percent) >= 100
  const action = full ? 'close' : 'reduce'
  const validate = { position, closeFraction: Number(percent) / 100 }

  if (!Number.isInteger(chainId) || chainId <= 0) {
    return refuse('This position’s network could not be determined, so it cannot be closed from here. You can close it on the venue.')
  }
  if (isLong === null) {
    return refuse('Whether this position is long or short could not be read, so a close cannot be prepared here. You can close it on the venue.')
  }

  if (venue === 'gains') {
    const index = gainsTradeIndexOf(position)
    if (!index) {
      return refuse('Gains’ own handle for this position could not be read, so it cannot be closed from here. You can close it on Gains.')
    }
    const price = positiveNumber(markPrice)
    if (price === null) {
      // `closeTradeMarket` takes the price its slippage bound is measured from; a zero would make
      // the venue cancel the close. Refusing is more honest than a signature that cannot execute.
      return refuse('The current price for this market could not be read just now, so a close cannot be priced here. You can close it on Gains.')
    }
    if (full) {
      return {
        ok: true,
        descriptor: {
          action: 'close',
          venue,
          chainId,
          validate,
          params: { tradeIndex: index, expectedPrice: price, maxSlippageP: slippagePct },
        },
      }
    }
    // A PARTIAL exit on Gains has two levers, and which one is available depends on what the venue
    // told us. Proportional (collateral out, leverage unchanged) is the one members expect, and it
    // needs the collateral in the token's OWN base units — a figure the gateway does not currently
    // publish. Deriving it from `collateralUsd` would mean assuming a $1 peg for a collateral that
    // may be WETH: a fabricated number in front of a leveraged position. So the leverage lever is
    // the honest fallback, it reduces the size by exactly the share asked for, and the sheet SAYS
    // that the collateral stays in the position.
    const collateralAmount = bigintOrNull(position?.venueRef?.collateralAmount ?? position?.collateralAmount)
    if (collateralAmount !== null && collateralAmount > 0n) {
      return {
        ok: true,
        descriptor: {
          action: 'reduce',
          venue,
          chainId,
          validate,
          params: {
            tradeIndex: index,
            collateralDelta: shareOf(collateralAmount, Number(percent)),
            leverageDelta: 0,
            expectedPrice: price,
          },
        },
      }
    }
    const leverage = positiveNumber(position?.leverage)
    if (leverage === null) {
      return refuse('This position’s size could not be read from Gains, so part of it cannot be closed here. You can close it on Gains.')
    }
    return {
      ok: true,
      descriptor: {
        action: 'reduce',
        venue,
        chainId,
        validate,
        params: {
          tradeIndex: index,
          collateralDelta: 0n,
          leverageDelta: roundLeverage((leverage * Number(percent)) / 100),
          expectedPrice: price,
        },
      },
    }
  }

  if (venue === 'gmx') {
    const ref = position?.venueRef ?? {}
    const raw = position?.raw ?? {}
    const sizeInUsd = bigintOrNull(raw.sizeInUsd ?? ref.sizeInUsd)
    if (sizeInUsd === null || sizeInUsd <= 0n) {
      return refuse('GMX did not report this position’s size, so a close cannot be prepared here. You can close it on GMX.')
    }
    if (!ref.market || !ref.collateralToken) {
      return refuse('GMX’s own handle for this position could not be read, so it cannot be closed from here. You can close it on GMX.')
    }
    const executionFee = bigintOrNull(quote?.executionFee)
    if (executionFee === null || executionFee <= 0n) {
      // GMX orders are settled by keepers the member pays for, and the fee comes from GMX's own
      // DataStore configuration. Guessing it either strands the order unexecuted or overcharges.
      return refuse('GMX’s keeper fee for this order could not be read just now, so a close cannot be prepared here. You can close it on GMX.')
    }
    const acceptablePrice =
      quote?.acceptablePrice ?? decreaseAcceptablePrice(markPrice, isLong, slippagePct)
    if (acceptablePrice == null) {
      return refuse('The current price for this market could not be read just now, so a close cannot be priced here. You can close it on GMX.')
    }
    const collateralAmount = bigintOrNull(raw.collateralAmount) ?? 0n
    return {
      ok: true,
      descriptor: {
        action,
        venue,
        chainId,
        validate,
        params: {
          market: ref.market,
          collateralToken: ref.collateralToken,
          isLong,
          sizeDeltaUsd: shareOf(sizeInUsd, Number(percent)),
          collateralAmount: shareOf(collateralAmount, Number(percent)) ?? 0n,
          acceptablePrice,
          executionFee,
          uiFeeReceiver,
        },
      },
    }
  }

  return refuse('Positions on this venue are managed on the venue’s own app.')
}

/**
 * The descriptor for setting, changing or removing protection.
 *
 * `stopLoss` / `takeProfit` are the levels the member wants, `null` meaning "remove it". Only the
 * legs that actually CHANGED are sent: an unchanged take-profit re-sent alongside a new stop is a
 * second signature that buys the member nothing.
 */
export function buildProtectDescriptor(input) {
  const {
    position,
    stopLoss = null,
    takeProfit = null,
    stored = null,
    markPrice = null,
    slippagePct = defaultSlippage(),
    quote = null,
    uiFeeReceiver = null,
  } = input ?? {}
  const venue = position?.venue ?? null
  const chainId = Number(position?.chainId ?? position?.venueRef?.chainId)
  const isLong = directionOf(position)
  const slChanged = !sameLevel(stopLoss, stored?.stopLoss)
  const tpChanged = !sameLevel(takeProfit, stored?.takeProfit)

  if (!slChanged && !tpChanged) {
    return refuse('These are already the levels the venue has stored for this position.')
  }
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return refuse('This position’s network could not be determined, so protection cannot be set from here.')
  }
  if (isLong === null) {
    return refuse('Whether this position is long or short could not be read, so protection cannot be checked against it.')
  }

  const validate = {
    position: {
      markPrice,
      entryPrice: position?.entryPrice ?? null,
      isLong,
      liquidationPrice: position?.liquidationPrice ?? null,
    },
    stopLoss,
    takeProfit,
    liquidationPrice: position?.liquidationPrice ?? null,
    isLong,
  }

  if (venue === 'gains') {
    const index = gainsTradeIndexOf(position)
    if (!index) {
      return refuse('Gains’ own handle for this position could not be read, so protection cannot be set from here.')
    }
    // `sl` / `tp` PRESENT means "write this leg"; absent means "leave it alone". A null VALUE is
    // how both venues spell "remove it", so the two must not be collapsed into one another.
    const params = { tradeIndex: index }
    if (slChanged) params.sl = stopLoss
    if (tpChanged) params.tp = takeProfit
    return { ok: true, descriptor: { action: 'protect', venue, chainId, validate, params } }
  }

  if (venue === 'gmx') {
    const ref = position?.venueRef ?? {}
    const raw = position?.raw ?? {}
    const sizeInUsd = bigintOrNull(raw.sizeInUsd ?? ref.sizeInUsd)
    if (sizeInUsd === null || sizeInUsd <= 0n) {
      return refuse('GMX did not report this position’s size, so protection cannot be prepared here.')
    }
    if (!ref.market || !ref.collateralToken) {
      return refuse('GMX’s own handle for this position could not be read, so protection cannot be set from here.')
    }
    const executionFee = bigintOrNull(quote?.executionFee)
    if (executionFee === null || executionFee <= 0n) {
      return refuse('GMX’s keeper fee for a trigger order could not be read just now, so protection cannot be prepared here.')
    }
    // GMX expresses protection as separate trigger orders, so REMOVING a level is cancelling that
    // order — a different call, keyed by the order's own key, which this sheet does not hold.
    // Saying so is better than silently writing a new order and leaving the old one live.
    if ((slChanged && stopLoss == null) || (tpChanged && takeProfit == null)) {
      return refuse('On GMX a stop or target is its own order — remove it from the pending orders list rather than here.')
    }
    const leg = (trigger) => ({
      sizeDeltaUsd: sizeInUsd,
      triggerPrice: trigger,
      acceptablePrice: decreaseAcceptablePrice(trigger, isLong, slippagePct) ?? 0,
      executionFee,
    })
    return {
      ok: true,
      descriptor: {
        action: 'protect',
        venue,
        chainId,
        validate,
        params: {
          market: ref.market,
          collateralToken: ref.collateralToken,
          isLong,
          executionFee,
          uiFeeReceiver,
          // `autoCancel: true` is not passed — the builder hardcodes it, so a trigger order can
          // never outlive its position as stale exposure (US2 acceptance 4).
          stopLoss: slChanged && stopLoss != null ? leg(stopLoss) : null,
          takeProfit: tpChanged && takeProfit != null ? leg(takeProfit) : null,
        },
      },
    }
  }

  return refuse('Positions on this venue are managed on the venue’s own app.')
}

/* ------------------------------------------------------------------------------------------- *
 * The FairWins fee rate — read from the contract that enforces it
 * ------------------------------------------------------------------------------------------- */

/**
 * The live FairWins rate for a venue, in bps.
 *
 *  - **GMX** enforces it from its own DataStore (`uiFeeFactorKey(receiver)`), so that is where it
 *    is read. An unset receiver is a STRUCTURAL zero — GMX early-returns a zero UI fee for
 *    `address(0)` — so it reports 0 rather than "unknown".
 *  - **Gains** has no FairWins-priced fee at all (fee-rails.md): the referral share is paid by the
 *    venue out of its own fees and is not a member cost, so a fee line there would invent one.
 *
 * → `{ bps }` when the rate is known, or `{ failed: true }`. **A failure never blocks a close** —
 * the caller renders the honest note and leaves the exit exactly where it was (rule 4 of
 * fee-rails.md, which blocks OPENING only).
 */
export async function defaultReadFeeBps({ venue, chainId, getProvider = getReadProvider } = {}) {
  if (venue !== 'gmx') return { bps: 0 }
  try {
    const receiver = perpsUiFeeReceiver()
    if (!receiver) return { bps: 0 } // address(0) ⇒ GMX charges nothing, structurally
    const key = gmxUiFeeFactorKey(receiver)
    const addresses = gmxAddressesFor(chainId)
    if (!key || !addresses?.dataStore) return { failed: true }
    const provider = getProvider(chainId)
    if (!provider) return { failed: true }
    const store = new Contract(addresses.dataStore, GMX_DATA_STORE_ABI, provider)
    const bps = gmxUiFeeFactorToBps(await store.getUint(key))
    return bps === null ? { failed: true } : { bps }
  } catch {
    return { failed: true }
  }
}


/* ------------------------------------------------------------------------------------------- *
 * Shared total coercions — exported because the sheet renders the same values it sends
 * ------------------------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------------------------- *
 * Total coercions — these run during render, so junk in yields null, never a throw
 * ------------------------------------------------------------------------------------------- */

export function directionOf(position) {
  if (position?.isLong === true || position?.isLong === false) return position.isLong
  const dir = typeof position?.direction === 'string' ? position.direction.trim().toLowerCase() : null
  if (dir === 'long') return true
  if (dir === 'short') return false
  if (position?.venueRef?.isLong === true || position?.venueRef?.isLong === false) return position.venueRef.isLong
  return null
}

export function numberOrNull(value) {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function positiveNumber(value) {
  const n = numberOrNull(value)
  return n !== null && n > 0 ? n : null
}

export function bigintOrNull(value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim())
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return BigInt(value)
  return null
}

/** Gains leverage is 1e3-scaled by the builder; 3 decimals is all the venue can hold. */
function roundLeverage(value) {
  return Math.round(value * 1000) / 1000
}

/** Two levels are the same when both are absent or both are the same price. */
function sameLevel(a, b) {
  const left = positiveNumber(a)
  const right = positiveNumber(b)
  if (left === null && right === null) return true
  if (left === null || right === null) return false
  return Math.abs(left - right) < 1e-9
}
