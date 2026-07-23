/**
 * Bitcoin legacy-purpose address encoders (spec 063, US2 / T024).
 *
 * The spec-061 wallet only ever issues its own BIP84 (segwit) + BIP86 (taproot)
 * receive addresses. Recovering funds from a hardware/older wallet additionally
 * requires the OLDER output types those wallets used:
 *   - BIP44 legacy   → P2PKH  ('1…' mainnet, 'm/n…' testnet)
 *   - BIP49 wrapped   → P2SH-P2WPKH ('3…' mainnet, '2…' testnet)
 * plus BIP84/BIP86, which delegate to the existing (frozen) encodeAddress.
 *
 * All encoding rides @scure/btc-signer's audited codecs — no hand-rolled
 * checksum/base58 code (mirrors addresses.js invariant 1). This module is
 * ADDITIVE: it does not touch the frozen spec-061 derivation/encoding path.
 */

import { p2pkh, p2sh, p2wpkh, NETWORK, TEST_NETWORK } from '@scure/btc-signer'
import { encodeAddress } from './addresses'

const BTC_SIGNER_NETWORK = { bitcoin: NETWORK, 'bitcoin-testnet': TEST_NETWORK }

/** Derivation purpose → address type. */
export const LEGACY_ADDRESS_TYPES = ['legacy', 'wrapped-segwit', 'segwit', 'taproot']

/**
 * Encode a receive address for any of the four hardware-wallet output types.
 *
 * @param {Uint8Array} pubkey 33-byte compressed secp256k1 pubkey
 * @param {{type:'legacy'|'wrapped-segwit'|'segwit'|'taproot', network:'bitcoin'|'bitcoin-testnet'}} opts
 * @returns {string} the address for `type` on `network`
 */
export function encodeLegacyAddress(pubkey, { type, network } = {}) {
  const net = BTC_SIGNER_NETWORK[network]
  if (!net) {
    throw new Error(`encodeLegacyAddress: unknown network '${String(network)}' (expected 'bitcoin' or 'bitcoin-testnet')`)
  }
  // segwit/taproot reuse the frozen encoder (accepts 33-byte; slices for taproot).
  if (type === 'segwit' || type === 'taproot') return encodeAddress(pubkey, { type, network })
  if (!(pubkey instanceof Uint8Array) || pubkey.length !== 33) {
    throw new Error('encodeLegacyAddress: legacy/wrapped-segwit require a 33-byte compressed pubkey')
  }
  if (type === 'legacy') return p2pkh(pubkey, net).address
  if (type === 'wrapped-segwit') return p2sh(p2wpkh(pubkey, net), net).address
  throw new Error(`encodeLegacyAddress: unknown type '${String(type)}' (expected one of ${LEGACY_ADDRESS_TYPES.join(', ')})`)
}
