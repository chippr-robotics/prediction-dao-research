/**
 * Perps fee unit conversions (spec 083, contracts/fee-rails.md).
 *
 * One rate — 5 bps of notional — has to be expressed three different ways, because each venue
 * invented its own unit:
 *
 *   GMX v2       `uiFeeFactor`  = bps × 1e26  (5 bps = 5e26), ceiling 1e27 = 10 bps
 *   Hyperliquid  builder `f`    = bps × 10    (TENTHS of a bp), ceiling 100 = 10 bps
 *   Hyperliquid  `maxFeeRate`   = "<bps/100>%" — a percent STRING, and the `%` is required
 *
 * This module exists so that arithmetic lives in exactly one place. A single missing ×10 on the
 * Hyperliquid conversion is a 10× overcharge the venue would happily enforce and the member would
 * actually pay, which is why the tests pin both directions and both ceilings.
 *
 * TOTALITY (the lib/perps/format.js convention): these run inside disclosure rendering, where a
 * throw takes the whole sheet down. Junk in → `null` out, never a throw. `null` is the documented
 * sentinel for "no answer": callers must render '—' / "the fee could not be confirmed" and, on the
 * opening path, block — never substitute a number (fee-rails.md disclosure rule 4).
 *
 * CLAMPING IS NEVER SILENT. Each bps → venue-unit converter returns
 * `{ <unit>, bps, requestedBps, clamped }`, so a caller that asked for 25 bps can see it is
 * charging 10 and say so, instead of a ceiling quietly rewriting the rate behind the disclosure.
 * The read directions (venue unit → bps) deliberately do NOT clamp: they report what the venue
 * actually said, and a value above the ceiling is a fact worth surfacing, not one worth hiding.
 *
 * The GMX DataStore key derivation lives here too (`abis/perps/gmxDataStore.js` points at this
 * module for it): it is arithmetic over a rate, and reading the rate from the contract that
 * ENFORCES it is the whole of fee-rails.md's authority rule (FR-011). Without it the DataStore ABI
 * has no caller and every fee surface would have to re-derive the key locally — the second-source
 * failure this repo keeps paying for.
 */
import { AbiCoder, getAddress, isAddress, keccak256 } from 'ethers'

/** GMX `Keys.uiFeeFactor` is a 1e30-precision float; 1 bps of it is 1e26. */
export const GMX_UI_FEE_FACTOR_PER_BPS = 10n ** 26n
/** GMX `MAX_UI_FEE_FACTOR` — the venue rejects anything above this. */
export const GMX_MAX_UI_FEE_FACTOR = 10n ** 27n
export const GMX_MAX_UI_FEE_BPS = 10

/** Hyperliquid builder `f` is in TENTHS of a basis point — this ×10 is the whole trap. */
export const HL_BUILDER_F_PER_BPS = 10
/** Hyperliquid's perps builder-fee ceiling: `f ≤ 100`. */
export const HL_MAX_BUILDER_F = 100
export const HL_MAX_BUILDER_BPS = 10
/** The clamped form of `maxFeeRate`, spelled exactly as the venue expects it. */
export const HL_MAX_FEE_RATE = '0.1%'

const BPS_DENOMINATOR = 10_000n

/* ------------------------------------------------------------------------------------------- *
 * GMX DataStore keys — where the rate that will actually be charged lives
 *
 * GMX's DataStore is a flat `bytes32 → uint256` map, so a key is the only thing standing between a
 * read and the WRONG number: a mis-derived key returns 0, which reads as "no fee" and is
 * indistinguishable from a genuinely unset rate. Both constants below were checked against the
 * deployed Arbitrum DataStore (0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8) on 2026-08-11 —
 * MAX_UI_FEE_FACTOR read back 1e27 (10 bps), and the FairWins receiver's key read back 5e26 (5 bps),
 * the factor the spec-083 ops transaction set.
 * ------------------------------------------------------------------------------------------- */

const ABI_CODER = AbiCoder.defaultAbiCoder()

/** `Keys.MAX_UI_FEE_FACTOR` — the ceiling, read live rather than assumed to stay 1e27. */
export const GMX_MAX_UI_FEE_FACTOR_KEY = keccak256(ABI_CODER.encode(['string'], ['MAX_UI_FEE_FACTOR']))

/** `Keys.UI_FEE_FACTOR` — the base the per-account key is derived from, never read directly. */
const GMX_UI_FEE_FACTOR_BASE_KEY = keccak256(ABI_CODER.encode(['string'], ['UI_FEE_FACTOR']))

/**
 * `Keys.uiFeeFactorKey(account)` = `keccak256(abi.encode(UI_FEE_FACTOR, account))`.
 *
 * The account is FairWins' UI-fee RECEIVER, which is `msg.sender` of `setUiFeeFactor` — the same
 * address the app puts in `addresses.uiFeeReceiver`. Reading any other address's key would report a
 * rate GMX will not charge on our orders.
 *
 * TOTAL: a junk or absent address yields null, and the caller discloses that the rate could not be
 * confirmed (fee-rails.md rule 4 — which blocks OPENING only, never a close).
 */
export function gmxUiFeeFactorKey(account) {
  if (typeof account !== 'string' || !isAddress(account)) return null
  try {
    return keccak256(ABI_CODER.encode(['bytes32', 'address'], [GMX_UI_FEE_FACTOR_BASE_KEY, getAddress(account)]))
  } catch {
    return null
  }
}

/**
 * bps are carried through BigInt math at 6 decimal places. Rates off the FeeRouter are integers,
 * but a rate recovered from a GMX factor need not be, and a float product would put dust into a
 * number the member is charged on.
 */
const MICRO = 1_000_000
const MICRO_BIG = 1_000_000n

/**
 * A non-negative finite bps value, or null. Accepts bigint because ethers v6 hands back bigint for
 * every uint — the FeeRouter's `feeBps` arrives that way and a Number() coercion elsewhere is how
 * this would silently become NaN.
 */
function toBps(value) {
  if (typeof value === 'bigint') return value < 0n ? null : Number(value)
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * A non-negative BigInt, or null. bigint and decimal strings are EXACT; a Number above 2^53 is
 * not (BigInt(5e26) is 5e26 + 6.6e11), so prefer the exact forms for venue-sourced values.
 */
function toBigIntish(value) {
  if (typeof value === 'bigint') return value < 0n ? null : value
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null
  if (typeof value === 'string') {
    const s = value.trim()
    if (!/^\d+$/.test(s)) return null
    return BigInt(s)
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return BigInt(Math.floor(value))
}

/** bps → micro-bps as BigInt, the common scale for every conversion below. */
function toMicroBps(bps) {
  return BigInt(Math.round(bps * MICRO))
}

/**
 * bps → GMX `uiFeeFactor`, clamped at `MAX_UI_FEE_FACTOR`.
 *
 * BigInt throughout: 1e26 is past `Number.MAX_SAFE_INTEGER`, so a float factor would be wrong by
 * hundreds of billions of wei-equivalents before it ever reached calldata.
 *
 * → `{ factor: bigint, bps, requestedBps, clamped }` or null.
 */
export function bpsToGmxUiFeeFactor(bps) {
  const requestedBps = toBps(bps)
  if (requestedBps === null) return null
  const clamped = requestedBps > GMX_MAX_UI_FEE_BPS
  const effective = clamped ? GMX_MAX_UI_FEE_BPS : requestedBps
  const factor = (toMicroBps(effective) * GMX_UI_FEE_FACTOR_PER_BPS) / MICRO_BIG
  return { factor, bps: effective, requestedBps, clamped }
}

/**
 * GMX `uiFeeFactor` → bps, for disclosing the rate read from the DataStore (the contract that
 * enforces it). Not clamped — an over-ceiling factor is reported as it was read.
 *
 * → Number bps (up to 6 decimals) or null.
 */
export function gmxUiFeeFactorToBps(factor) {
  const f = toBigIntish(factor)
  if (f === null) return null
  return Number((f * MICRO_BIG) / GMX_UI_FEE_FACTOR_PER_BPS) / MICRO
}

/**
 * bps → Hyperliquid builder `f`, clamped at 100.
 *
 * `f` IS TENTHS OF A BASIS POINT: 5 bps is `f = 50`, not 5. Dropping this ×10 charges the member
 * a tenth of the rate; adding it twice charges ten times. Fractional tenths floor — the member's
 * favour, matching the money rule below.
 *
 * → `{ f: number, bps, requestedBps, clamped }` or null.
 */
export function bpsToHyperliquidBuilderFee(bps) {
  const requestedBps = toBps(bps)
  if (requestedBps === null) return null
  // Via micro-bps rather than `requestedBps * 10`: the float product of 0.7 bps is 6.99999…,
  // which floors to 6 and undercharges by a tenth of a bp for no reason anyone could find later.
  const requestedF = Number((toMicroBps(requestedBps) * BigInt(HL_BUILDER_F_PER_BPS)) / MICRO_BIG)
  const clamped = requestedF > HL_MAX_BUILDER_F
  const f = clamped ? HL_MAX_BUILDER_F : requestedF
  return { f, bps: f / HL_BUILDER_F_PER_BPS, requestedBps, clamped }
}

/** Hyperliquid builder `f` → bps (÷10). Not clamped: it reports what the venue said. */
export function hyperliquidBuilderFeeToBps(f) {
  const n = toBps(f)
  if (n === null) return null
  return n / HL_BUILDER_F_PER_BPS
}

/**
 * bps → Hyperliquid `maxFeeRate`, the ceiling the MEMBER signs in `approveBuilderFee`.
 *
 * It is a percent STRING and THE `%` IS REQUIRED — the venue rejects a bare number. 5 bps →
 * "0.05%". Trailing zeros are trimmed so the ceiling renders as the venue spells it ("0.1%",
 * not "0.10%"). Shares Hyperliquid's 10 bps ceiling with `bpsToHyperliquidBuilderFee`.
 *
 * → `{ maxFeeRate: string, bps, requestedBps, clamped }` or null.
 */
export function bpsToHyperliquidMaxFeeRate(bps) {
  const requestedBps = toBps(bps)
  if (requestedBps === null) return null
  const clamped = requestedBps > HL_MAX_BUILDER_BPS
  const effective = clamped ? HL_MAX_BUILDER_BPS : requestedBps
  return { maxFeeRate: `${trimZeros((effective / 100).toFixed(6))}%`, bps: effective, requestedBps, clamped }
}

function trimZeros(s) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/**
 * notional × bps → the fee in the notional's own base units, FLOORED (the member's favour, and the
 * same direction the FeeRouter's integer division takes).
 *
 * `notional` is base units — GMX `sizeDeltaUsd` at 1e30, or a collateral amount at the token's own
 * decimals — so pass a bigint or a decimal string; the answer is exact.
 *
 * → bigint or null.
 */
export function feeAmountFromNotional(notional, bps) {
  const n = toBigIntish(notional)
  const b = toBps(bps)
  if (n === null || b === null) return null
  return (n * toMicroBps(b)) / (BPS_DENOMINATOR * MICRO_BIG)
}

/**
 * The same product for a USD float, for the disclosure line ("perps fees are charged on notional,
 * not on the amount you put in"). DISPLAY ONLY — the charged amount is the venue's own integer
 * math; use `feeAmountFromNotional` wherever the number has to agree with a transaction.
 *
 * → Number or null.
 */
export function feeUsdFromNotional(notionalUsd, bps) {
  const n = toBps(notionalUsd)
  const b = toBps(bps)
  if (n === null || b === null) return null
  return (n * b) / 10_000
}
