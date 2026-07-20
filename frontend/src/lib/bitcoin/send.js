/**
 * Bitcoin send pipeline (spec 061, task T025 — research R7, FR-011…FR-015).
 *
 * Two pure stages, wired by useBitcoinWallet:
 *
 *   prepareSend()  — validate destination, classify coins, select inputs,
 *                    price the fee. Produces the PLAN the member confirms:
 *                    the fee shown at confirm time IS the ceiling passed to
 *                    signing (FR-012 — the member can never pay more).
 *   executeSend()  — derive input keys (memory-only), build + sign, broadcast
 *                    through the gateway, and report the outpoints to lock
 *                    (FR-014 — no double-commitment across concurrent sends).
 *
 * Fee-quote freshness (60s window) is enforced here so a stale quote can
 * never silently price a send (edge case: fee spike between quote and
 * confirm).
 */

import { classifyAddress } from './addresses'
import { selectCoins, maxSendable } from './coinSelection'
import { buildAndSignTx } from './psbt'

export const FEE_QUOTE_TTL_MS = 60_000

export function isQuoteFresh(quote, nowMs = Date.now()) {
  return Boolean(quote) && nowMs - quote.fetchedAt <= FEE_QUOTE_TTL_MS
}

/**
 * Build the send plan the member confirms.
 *
 * @returns {{ ok:true, plan }} where plan =
 *   { destination, destinationType, amountSats, feeSats, vsize, feeRate,
 *     inputs, changeSats, changeAddress, networkId }
 * or { ok:false, error, ... } with a member-explainable reason:
 *   invalid_destination (with reason slug from classifyAddress),
 *   stale_fee_quote, amount_below_dust, insufficient_funds.
 */
export function prepareSend({
  coins,
  destination,
  amountSats, // integer sats, or the string 'max'
  feeRate, // integer sat/vB (member-selected tier from the quote)
  quote, // { rates, fetchedAt } — freshness enforced here
  changeAddress, // next unissued address of the preferred type
  changeType = 'p2wpkh',
  networkId,
  nowMs = Date.now(),
}) {
  const dest = classifyAddress(destination, networkId)
  if (!dest.valid) {
    return { ok: false, error: 'invalid_destination', reason: dest.reason, message: dest.message }
  }
  if (!isQuoteFresh(quote, nowMs)) {
    return { ok: false, error: 'stale_fee_quote' }
  }

  if (amountSats === 'max') {
    const max = maxSendable({ utxos: coins, feeRate, recipientType: dest.type })
    if (!max.ok) return { ok: false, ...max }
    return {
      ok: true,
      plan: {
        destination,
        destinationType: dest.type,
        amountSats: max.amountSats,
        feeSats: max.feeSats,
        vsize: max.vsize,
        feeRate,
        inputs: max.inputs,
        changeSats: 0,
        changeAddress: null,
        networkId,
        isMax: true,
      },
    }
  }

  const sel = selectCoins({
    utxos: coins,
    targetSats: amountSats,
    feeRate,
    recipientType: dest.type,
    changeType,
  })
  if (!sel.ok) return { ok: false, ...sel }
  return {
    ok: true,
    plan: {
      destination,
      destinationType: dest.type,
      amountSats,
      feeSats: sel.feeSats,
      vsize: sel.vsize,
      feeRate,
      inputs: sel.inputs,
      changeSats: sel.changeSats,
      changeAddress: sel.changeSats > 0 ? changeAddress : null,
      networkId,
      isMax: false,
    },
  }
}

/**
 * Sign and broadcast a confirmed plan.
 *
 * @param {object} p
 * @param {object} p.plan       from prepareSend (member-confirmed)
 * @param {(address:string) => {publicKey:Uint8Array, privateKey:Uint8Array, scriptType:string}} p.keyFor
 *   resolves the signing key for one of OUR addresses via the ledger
 *   (memory-only material; never retained here)
 * @param {object} p.gateway    bitcoin gateway client
 * @returns {Promise<{ok:true, txid, feeSats, lockedOutpoints:string[]}
 *   | {ok:false, error, message?}>}
 */
export async function executeSend({ plan, keyFor, gateway }) {
  if (plan.changeSats > 0 && !plan.changeAddress) {
    return { ok: false, error: 'missing_change_address' }
  }

  let signed
  try {
    const inputs = plan.inputs.map((coin) => {
      const key = keyFor(coin.address)
      if (!key) throw new Error(`no key for input address ${coin.address}`)
      return {
        txid: coin.txid,
        vout: coin.vout,
        valueSats: coin.valueSats,
        scriptType: key.scriptType,
        publicKey: key.publicKey,
        privateKey: key.privateKey,
      }
    })
    signed = buildAndSignTx({
      inputs,
      recipient: { address: plan.destination, valueSats: plan.amountSats },
      change: plan.changeSats > 0 ? { address: plan.changeAddress, valueSats: plan.changeSats } : null,
      networkId: plan.networkId,
      // The confirmed plan fee is the hard ceiling (FR-012).
      maxFeeSats: plan.feeSats,
    })
  } catch (err) {
    return { ok: false, error: 'signing_failed', message: err?.message }
  }

  const res = await gateway.broadcast(plan.networkId, signed.rawTxHex)
  if (!res.ok) {
    return { ok: false, error: res.error || 'broadcast_failed', message: res.message }
  }
  return {
    ok: true,
    txid: res.txid ?? signed.txid,
    feeSats: signed.feeSats,
    lockedOutpoints: plan.inputs.map((c) => `${c.txid}:${c.vout}`),
  }
}
