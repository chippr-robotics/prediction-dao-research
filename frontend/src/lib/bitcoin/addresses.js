/**
 * Bitcoin address codecs & validation (spec 061, T006).
 *
 * Contract (research R7 / FR-011 / FR-016):
 *  - encode our OWN receive addresses: P2WPKH (bech32, BIP84) and P2TR
 *    (bech32m, BIP-341 key-path tweak via @scure/btc-signer p2tr) — nothing else;
 *  - classify ANY destination string: accept every standard output type
 *    (P2PKH, P2SH, P2WPKH, P2WSH, P2TR) on the CORRECT network, reject
 *    everything else with a specific machine slug + human message
 *    ('wrong_network' is always distinct — tb1… on mainnet is not "invalid",
 *    it is honestly the wrong network; EVM 0x input gets its own reason);
 *  - BIP-21 'bitcoin:' URI parse/format (amount in BTC decimal, converted
 *    to/from integer satoshis with exact string math — never floats on the
 *    fractional part).
 *
 * Invariants (tested in __tests__/addresses.test.js):
 *  - all decoding rides @scure/btc-signer's audited Address/bech32m/base58check
 *    codecs — no hand-rolled checksum code;
 *  - witness versions > 1 (and v0/v1 with non-standard program sizes) are
 *    rejected, never silently truncated (BIP-350 semantics);
 *  - mixed-case bech32 is rejected; all-uppercase (QR alphanumeric mode) is
 *    accepted;
 *  - classifyAddress never throws on member input — every failure is a
 *    { valid: false, reason, message } verdict.
 */

import { Address, p2wpkh, p2tr, NETWORK, TEST_NETWORK } from '@scure/btc-signer'

/** networkId → @scure/btc-signer network params ('bitcoin-testnet' = testnet4; same encoding as testnet3). */
const BTC_SIGNER_NETWORK = { bitcoin: NETWORK, 'bitcoin-testnet': TEST_NETWORK }

/** btc-signer decoded type → spec-061 classification type. */
const TYPE_LABEL = { pkh: 'p2pkh', sh: 'p2sh', wpkh: 'p2wpkh', wsh: 'p2wsh', tr: 'p2tr' }

const NETWORK_LABEL = { bitcoin: 'Bitcoin mainnet', 'bitcoin-testnet': 'Bitcoin testnet' }

function signerNetwork(networkId) {
  const net = BTC_SIGNER_NETWORK[networkId]
  if (!net) {
    throw new Error(`bitcoin addresses: unknown network '${String(networkId)}' (expected 'bitcoin' or 'bitcoin-testnet')`)
  }
  return net
}

function otherNetworkId(networkId) {
  return networkId === 'bitcoin' ? 'bitcoin-testnet' : 'bitcoin'
}

/**
 * Encode one of OUR receive addresses from a public key.
 *
 * @param {Uint8Array} pubkey 33-byte compressed secp256k1 pubkey (a 32-byte
 *   x-only key is also accepted for taproot)
 * @param {{type: 'segwit'|'taproot', network: 'bitcoin'|'bitcoin-testnet'}} opts
 * @returns {string} bc1q…/tb1q… (segwit) or bc1p…/tb1p… (taproot, BIP-341 tweaked)
 */
export function encodeAddress(pubkey, { type, network } = {}) {
  const net = signerNetwork(network)
  if (!(pubkey instanceof Uint8Array)) {
    throw new Error('encodeAddress: pubkey must be a Uint8Array')
  }
  if (type === 'segwit') {
    if (pubkey.length !== 33) throw new Error('encodeAddress: segwit requires a 33-byte compressed pubkey')
    return p2wpkh(pubkey, net).address
  }
  if (type === 'taproot') {
    // p2tr takes the 32-byte x-only internal key and applies the BIP-341 tweak.
    const internal = pubkey.length === 33 ? pubkey.slice(1) : pubkey
    if (internal.length !== 32) throw new Error('encodeAddress: taproot requires a 32/33-byte pubkey')
    return p2tr(internal, undefined, net).address
  }
  throw new Error(`encodeAddress: unknown type '${String(type)}' (expected 'segwit' or 'taproot')`)
}

function invalid(reason, message) {
  return { valid: false, reason, message }
}

/**
 * Classify a destination address for `networkId`.
 *
 * @param {string} str candidate address (member input — never throws on it)
 * @param {'bitcoin'|'bitcoin-testnet'} networkId active network
 * @returns {{valid: true, type: 'p2pkh'|'p2sh'|'p2wpkh'|'p2wsh'|'p2tr', network: string}
 *         | {valid: false, reason: string, message: string}}
 *   reasons: 'empty' | 'evm_address' | 'mixed_case' | 'wrong_network'
 *          | 'bad_checksum' | 'unsupported_witness' | 'unrecognized'
 */
export function classifyAddress(str, networkId) {
  const net = signerNetwork(networkId) // programmer error to pass a bad networkId — throws
  if (typeof str !== 'string' || str.trim() === '') {
    return invalid('empty', 'Enter a Bitcoin address.')
  }
  const s = str.trim()

  if (/^0x[0-9a-fA-F]*$/.test(s)) {
    return invalid('evm_address', 'This is an Ethereum-style (0x…) address — Bitcoin addresses look like bc1…, 1… or 3….')
  }

  // Bech32 case rule (BIP-173/350): all-lower or all-upper only. Check before
  // decoding so the member gets the precise reason rather than a generic error.
  if (/^(bc|tb|bcrt)1/i.test(s) && s !== s.toLowerCase() && s !== s.toUpperCase()) {
    return invalid('mixed_case', 'Bitcoin bech32 addresses must be all-lowercase or all-uppercase, not mixed case.')
  }

  let decodeError
  try {
    const decoded = Address(net).decode(s)
    const type = TYPE_LABEL[decoded.type]
    if (!type) return invalid('unrecognized', 'Unsupported Bitcoin address type.')
    return { valid: true, type, network: networkId }
  } catch (e) {
    decodeError = e
  }

  // Valid on the OTHER Bitcoin network ⇒ honest wrong-network verdict, never
  // a generic "invalid address" (FR-011/FR-021).
  const otherId = otherNetworkId(networkId)
  try {
    const other = Address(BTC_SIGNER_NETWORK[otherId]).decode(s)
    if (TYPE_LABEL[other.type]) {
      return invalid(
        'wrong_network',
        `This is a ${NETWORK_LABEL[otherId]} address — you are sending on ${NETWORK_LABEL[networkId]}.`
      )
    }
  } catch {
    /* not valid on the other network either — fall through to specifics */
  }

  const message = String(decodeError?.message || '')
  if (/witness/i.test(message)) {
    return invalid('unsupported_witness', 'Unsupported witness version or program — only known Bitcoin address formats can receive funds safely.')
  }
  if (/^(bc|tb|bcrt)1/i.test(s) || /checksum/i.test(message)) {
    return invalid('bad_checksum', 'Address checksum failed — check for typos.')
  }
  return invalid('unrecognized', 'Not a recognized Bitcoin address.')
}

const SATS_PER_BTC = 100_000_000n

/** Exact BTC-decimal string for integer satoshis (trailing zeros trimmed, per BIP-21 style). */
function satsToBtcString(amountSats) {
  const sats = BigInt(amountSats)
  const whole = sats / SATS_PER_BTC
  const frac = (sats % SATS_PER_BTC).toString().padStart(8, '0').replace(/0+$/, '')
  return frac === '' ? whole.toString() : `${whole.toString()}.${frac}`
}

/** Exact satoshis for a BTC-decimal string, or null when malformed (>8 dp, signs, exponents…). */
function btcStringToSats(amount) {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(amount)
  if (!m) return null
  const sats = BigInt(m[1]) * SATS_PER_BTC + BigInt((m[2] || '').padEnd(8, '0'))
  if (sats > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(sats)
}

/**
 * Parse a BIP-21 payment URI (case-insensitive `bitcoin:` scheme).
 *
 * @param {string} uri e.g. 'bitcoin:bc1q…?amount=0.001&label=Rent'
 * @param {'bitcoin'|'bitcoin-testnet'} networkId active network
 * @returns {{address: string, type: string, amountSats?: number, label?: string}
 *         | {error: 'unsupported_scheme'|'invalid_address'|'wrong_network'|'invalid_amount'|'unsupported_required_param', message: string}}
 */
export function parseBip21(uri, networkId) {
  if (typeof uri !== 'string') return { error: 'unsupported_scheme', message: 'Not a bitcoin: URI.' }
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/.exec(uri.trim())
  if (!m || m[1].toLowerCase() !== 'bitcoin') {
    return { error: 'unsupported_scheme', message: 'Only bitcoin: payment links are supported here.' }
  }
  const [addressPart, queryPart = ''] = m[2].split('?', 2)

  const verdict = classifyAddress(addressPart, networkId)
  if (!verdict.valid) {
    if (verdict.reason === 'wrong_network') return { error: 'wrong_network', message: verdict.message }
    return { error: 'invalid_address', message: verdict.message }
  }

  const params = new URLSearchParams(queryPart)
  for (const key of params.keys()) {
    // BIP-21: an unrecognized req-* parameter MUST invalidate the whole URI.
    if (key.toLowerCase().startsWith('req-')) {
      return { error: 'unsupported_required_param', message: `This payment link requires '${key}', which is not supported.` }
    }
  }

  const result = { address: addressPart, type: verdict.type }
  if (params.has('amount')) {
    const amountSats = btcStringToSats(params.get('amount'))
    if (amountSats === null) return { error: 'invalid_amount', message: 'The payment link carries an invalid BTC amount.' }
    result.amountSats = amountSats
  }
  if (params.has('label')) result.label = params.get('label')
  return result
}

/**
 * Format a BIP-21 payment URI (amount in BTC decimal per the BIP).
 *
 * @param {string} address already-validated Bitcoin address
 * @param {{amountSats?: number, label?: string}} [opts]
 * @returns {string} 'bitcoin:<address>[?amount=…][&label=…]'
 */
export function formatBip21(address, { amountSats, label } = {}) {
  if (typeof address !== 'string' || address === '') {
    throw new Error('formatBip21: address is required')
  }
  const params = new URLSearchParams()
  if (amountSats !== undefined) {
    if (!Number.isInteger(amountSats) || amountSats < 0) {
      throw new Error('formatBip21: amountSats must be a non-negative integer')
    }
    params.set('amount', satsToBtcString(amountSats))
  }
  if (label !== undefined && label !== '') params.set('label', label)
  const query = params.toString()
  return query === '' ? `bitcoin:${address}` : `bitcoin:${address}?${query}`
}
