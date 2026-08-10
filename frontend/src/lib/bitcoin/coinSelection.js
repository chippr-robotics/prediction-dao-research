/**
 * Stamps-aware Bitcoin coin selection (spec 061, tasks T021) — implements
 * research.md R6/R7 and the FR-013/FR-018/FR-019 rules:
 *
 *  - Only coins classified 'spendable' are ever selected. 'protected'
 *    (stamps-bearing), 'unverified' (stamps recognition degraded — fail-safe),
 *    'pending' (unconfirmed), and locally locked coins (in-flight sends) are
 *    excluded from selection AND from the spendable balance.
 *  - Fee = feeRate (sat/vB) × estimated vsize, deterministic per input/output
 *    type; estimates round up (member-visible quotes are upper bounds).
 *  - Change below the dust threshold is folded into the fee — the flow never
 *    creates uneconomical outputs (FR-013).
 *  - MAX = everything spendable minus the no-change fee.
 *
 * Pure module: no IO, no React, integer satoshi math only.
 */

// Deterministic vsize contributions (vbytes, conservative round-ups).
// Inputs we own are P2WPKH or P2TR key-path only (contracts/key-derivation-btc.md).
const INPUT_VBYTES = Object.freeze({
  p2wpkh: 68, // 41 base + ~107 WU witness (sig+pubkey)
  p2tr: 58, //   41 base + ~66 WU witness (64B schnorr sig + count)
})

// Any standard destination type is payable (FR-011).
const OUTPUT_VBYTES = Object.freeze({
  p2pkh: 34,
  p2sh: 32,
  p2wpkh: 31,
  p2wsh: 43,
  p2tr: 43,
})

// Fixed transaction overhead: version + locktime + varint counts, plus the
// segwit marker/flag (all our inputs are witness inputs). Rounded up.
const TX_OVERHEAD_VBYTES = 11

// Dust thresholds per research.md R7: sub-dust change is folded into the fee;
// sub-dust recipient amounts are rejected outright.
export const DUST_SATS = Object.freeze({
  p2pkh: 546,
  p2sh: 546,
  p2wpkh: 330,
  p2wsh: 330,
  p2tr: 330,
})

export function dustThreshold(outputType) {
  const dust = DUST_SATS[outputType]
  if (!dust) throw new Error(`coinSelection: unknown output type "${outputType}"`)
  return dust
}

function inputVbytes(coin) {
  const v = INPUT_VBYTES[coin.scriptType]
  if (!v) throw new Error(`coinSelection: unspendable input script type "${coin.scriptType}"`)
  return v
}

function outputVbytes(outputType) {
  const v = OUTPUT_VBYTES[outputType]
  if (!v) throw new Error(`coinSelection: unknown output type "${outputType}"`)
  return v
}

/** Estimated vsize for a tx spending `coins` to one recipient (+ optional change). */
export function estimateVsize(coins, recipientType, withChange, changeType = 'p2wpkh') {
  const inputs = coins.reduce((sum, c) => sum + inputVbytes(c), 0)
  const outputs = outputVbytes(recipientType) + (withChange ? outputVbytes(changeType) : 0)
  return TX_OVERHEAD_VBYTES + inputs + outputs
}

function assertFeeRate(feeRate) {
  if (!Number.isInteger(feeRate) || feeRate < 1) {
    throw new Error('coinSelection: feeRate must be an integer ≥ 1 sat/vB')
  }
}

/**
 * A coin may fund an ordinary send only when it is positively classified
 * spendable and not locked by an in-flight transaction (FR-014/FR-018/FR-019).
 * Everything else — protected, unverified, pending, unknown — fails safe.
 */
export function isSelectable(coin) {
  return coin.classification === 'spendable' && !coin.lockedByTx
}

/** Balance components per data-model.md (all integer sats). */
export function balanceComponents(utxos) {
  const sum = (coins) => coins.reduce((s, c) => s + c.valueSats, 0)
  const confirmed = utxos.filter((c) => c.classification !== 'pending')
  const spendable = utxos.filter(isSelectable)
  return {
    confirmedSats: sum(confirmed),
    pendingSats: sum(utxos.filter((c) => c.classification === 'pending')),
    protectedSats: sum(
      confirmed.filter((c) => c.classification === 'protected' || c.classification === 'unverified')
    ),
    spendableSats: sum(spendable),
  }
}

/**
 * Accumulative largest-first selection with change (research R7).
 *
 * Returns:
 *  { ok: true, inputs, feeSats, changeSats, vsize }  — changeSats 0 when the
 *    remainder was sub-dust and folded into feeSats (reported honestly).
 *  { ok: false, error: 'amount_below_dust' | 'insufficient_funds',
 *    shortfallSats?, spendableSats? }
 */
export function selectCoins({ utxos, targetSats, feeRate, recipientType, changeType = 'p2wpkh' }) {
  assertFeeRate(feeRate)
  if (!Number.isInteger(targetSats) || targetSats <= 0) {
    throw new Error('coinSelection: targetSats must be a positive integer')
  }
  if (targetSats < dustThreshold(recipientType)) {
    return { ok: false, error: 'amount_below_dust', dustSats: dustThreshold(recipientType) }
  }

  const candidates = utxos.filter(isSelectable).sort((a, b) => b.valueSats - a.valueSats)
  const spendableSats = candidates.reduce((s, c) => s + c.valueSats, 0)

  const selected = []
  let inputSats = 0
  for (const coin of candidates) {
    selected.push(coin)
    inputSats += coin.valueSats

    // Try with a change output first; fall back to no-change (remainder → fee).
    const feeWithChange = feeRate * estimateVsize(selected, recipientType, true, changeType)
    const changeSats = inputSats - targetSats - feeWithChange
    if (changeSats >= dustThreshold(changeType)) {
      return {
        ok: true,
        inputs: selected.slice(),
        feeSats: feeWithChange,
        changeSats,
        vsize: estimateVsize(selected, recipientType, true, changeType),
      }
    }

    const feeNoChange = feeRate * estimateVsize(selected, recipientType, false)
    const remainder = inputSats - targetSats - feeNoChange
    if (remainder >= 0) {
      // Sub-dust remainder is folded into the fee — never a dust output.
      return {
        ok: true,
        inputs: selected.slice(),
        feeSats: feeNoChange + remainder,
        changeSats: 0,
        vsize: estimateVsize(selected, recipientType, false),
      }
    }
  }

  const feeAllNoChange =
    candidates.length > 0 ? feeRate * estimateVsize(candidates, recipientType, false) : 0
  return {
    ok: false,
    error: 'insufficient_funds',
    spendableSats,
    shortfallSats: targetSats + feeAllNoChange - spendableSats,
  }
}

/**
 * MAX (FR-013): largest sendable amount = all spendable coins, no change,
 * fee at the given rate. Returns { ok, amountSats, feeSats, inputs, vsize }
 * or { ok: false, error: 'insufficient_funds' | 'amount_below_dust' } when
 * nothing (or only dust) would remain.
 */
export function maxSendable({ utxos, feeRate, recipientType }) {
  assertFeeRate(feeRate)
  const inputs = utxos.filter(isSelectable)
  if (inputs.length === 0) {
    return { ok: false, error: 'insufficient_funds', spendableSats: 0, shortfallSats: null }
  }
  const vsize = estimateVsize(inputs, recipientType, false)
  const feeSats = feeRate * vsize
  const amountSats = inputs.reduce((s, c) => s + c.valueSats, 0) - feeSats
  if (amountSats < dustThreshold(recipientType)) {
    return { ok: false, error: amountSats > 0 ? 'amount_below_dust' : 'insufficient_funds', spendableSats: amountSats > 0 ? amountSats : 0 }
  }
  return { ok: true, amountSats, feeSats, inputs, vsize }
}
