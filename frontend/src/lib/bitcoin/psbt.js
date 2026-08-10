/**
 * Bitcoin transaction build + sign (spec 061, task T023) — research.md R7.
 *
 * Contract:
 *  - Inputs are always our own P2WPKH or P2TR key-path coins
 *    (contracts/key-derivation-btc.md); outputs may be any standard type —
 *    the destination address string drives the output script.
 *  - RBF signaled on every input (sequence 0xfffffffd).
 *  - FR-012 fee honesty: the ACTUAL fee (inputs − outputs) is checked against
 *    the quote the member confirmed (`maxFeeSats`); an overrun refuses to
 *    sign — the caller must re-quote and re-confirm. Never sign first and
 *    apologize later.
 *  - Key material is used in-call and never stored/logged (memory-only
 *    invariant from the derivation contract).
 *
 * Pure module: no IO, no React. BigInt sats at the @scure boundary, integer
 * sats in our own API.
 */

import * as btc from '@scure/btc-signer'

const RBF_SEQUENCE = 0xfffffffd

function scureNetwork(networkId) {
  if (networkId === 'bitcoin') return btc.NETWORK
  if (networkId === 'bitcoin-testnet') return btc.TEST_NETWORK
  throw new Error(`psbt: unknown bitcoin network "${networkId}"`)
}

/** Script + spend info for one of our own coins. */
function ownSpend(input, network) {
  if (input.scriptType === 'p2wpkh') {
    return { payment: btc.p2wpkh(input.publicKey, network), tapInternalKey: undefined }
  }
  if (input.scriptType === 'p2tr') {
    // x-only internal key; BIP-341 tweak applied by p2tr()/signIdx.
    const xonly = input.publicKey.length === 33 ? input.publicKey.slice(1) : input.publicKey
    return { payment: btc.p2tr(xonly, undefined, network), tapInternalKey: xonly }
  }
  throw new Error(`psbt: unsupported input script type "${input.scriptType}"`)
}

export class FeeOverrunError extends Error {
  constructor(feeSats, maxFeeSats) {
    super(
      `psbt: actual fee ${feeSats} sats exceeds the confirmed quote ${maxFeeSats} sats — re-quote and re-confirm (FR-012)`
    )
    this.name = 'FeeOverrunError'
    this.feeSats = feeSats
    this.maxFeeSats = maxFeeSats
  }
}

/**
 * Build and sign a transaction.
 *
 * @param {object} p
 * @param {Array} p.inputs   [{ txid, vout, valueSats, scriptType: 'p2wpkh'|'p2tr',
 *                              publicKey: Uint8Array, privateKey: Uint8Array }]
 * @param {object} p.recipient { address, valueSats }
 * @param {object|null} p.change { address, valueSats } — omit/null for no-change
 * @param {string} p.networkId 'bitcoin' | 'bitcoin-testnet'
 * @param {number} p.maxFeeSats the member-confirmed fee ceiling (FR-012)
 * @returns {{ rawTxHex: string, txid: string, feeSats: number, vsize: number }}
 * @throws {FeeOverrunError} when the actual fee exceeds maxFeeSats
 */
export function buildAndSignTx({ inputs, recipient, change = null, networkId, maxFeeSats }) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('psbt: no inputs')
  if (!Number.isInteger(maxFeeSats) || maxFeeSats < 0) throw new Error('psbt: maxFeeSats required')
  const network = scureNetwork(networkId)

  // Fee is fully determined before signing — refuse overruns up front.
  const inSats = inputs.reduce((s, i) => s + i.valueSats, 0)
  const outSats = recipient.valueSats + (change ? change.valueSats : 0)
  const feeSats = inSats - outSats
  if (feeSats < 0) throw new Error('psbt: outputs exceed inputs')
  if (feeSats > maxFeeSats) throw new FeeOverrunError(feeSats, maxFeeSats)

  const tx = new btc.Transaction()
  for (const input of inputs) {
    const { payment, tapInternalKey } = ownSpend(input, network)
    tx.addInput({
      txid: input.txid,
      index: input.vout,
      witnessUtxo: { script: payment.script, amount: BigInt(input.valueSats) },
      sequence: RBF_SEQUENCE,
      ...(tapInternalKey ? { tapInternalKey } : {}),
    })
  }

  // addOutputAddress validates the destination against the network and
  // supports every standard script type (P2PKH/P2SH/bech32/bech32m).
  tx.addOutputAddress(recipient.address, BigInt(recipient.valueSats), network)
  if (change) tx.addOutputAddress(change.address, BigInt(change.valueSats), network)

  inputs.forEach((input, idx) => {
    tx.signIdx(input.privateKey, idx)
  })
  tx.finalize()

  return { rawTxHex: tx.hex, txid: tx.id, feeSats: Number(tx.fee), vsize: tx.vsize }
}
