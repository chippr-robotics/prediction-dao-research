/**
 * Bitcoin key derivation (spec 061, T004) — implements
 * specs/061-bitcoin-transactions/contracts/key-derivation-btc.md exactly:
 *
 *   btcSeed     = HKDF-SHA256(ikm = masterSeed(32B, spec 041),
 *                             salt = 32 zero bytes,
 *                             info = "fairwins-btc-seed-v1", length = 64)
 *   root        = HDKey.fromMasterSeed(btcSeed)            // @scure/bip32
 *   segwitAcct  = root.derive("m/84'/{coin}'/0'")          // BIP84 → bc1q…
 *   taprootAcct = root.derive("m/86'/{coin}'/0'")          // BIP86 → bc1p…
 *   coin        = 0' for 'bitcoin' (mainnet), 1' for 'bitcoin-testnet' (testnet4)
 *   receive(i)  = acct/0/i                                 // external chain ONLY (v1)
 *
 * These constants are WALLET-BREAKING if changed — funds live at the derived
 * addresses; any change requires a versioned migration path.
 *
 * Invariants (tested in __tests__/derivation.test.js):
 *  - Determinism: same masterSeed ⇒ byte-identical addresses, everywhere, forever
 *    (pinned FairWins vectors + published BIP84/BIP86 reference vectors);
 *  - Domain separation: info "fairwins-btc-seed-v1" is exclusive to this tree —
 *    it can never collide with the spec-041 KEK path ("fairwins-kek-v1") or any
 *    other masterSeed consumer;
 *  - Memory-only: btcSeed, the root, account nodes, and child private keys are
 *    NEVER persisted, logged, serialized, or transmitted. Everything returned
 *    here lives only as long as the unlocked wallet session;
 *  - External chain only: receive keys are …/0/i; the change chain (…/1/i) is
 *    reserved and unused in v1;
 *  - No wrong keys: callers must hold a real spec-041 masterSeed — wrong-length
 *    input throws instead of silently deriving a different wallet.
 */

import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { HDKey } from '@scure/bip32'
import { encodeAddress } from './addresses'

/**
 * Domain-separation constant for the Bitcoin subtree of the spec-041 master
 * seed. Normative (contracts/key-derivation-btc.md); no other consumer of the
 * master seed may ever use this info string.
 */
export const BTC_HKDF_INFO = 'fairwins-btc-seed-v1'

const HKDF_INFO_BYTES = new TextEncoder().encode(BTC_HKDF_INFO)
const HKDF_SALT = new Uint8Array(32) // 32 zero bytes, per contract
const BTC_SEED_LENGTH = 64

/** BIP purpose per address type (BIP84 native segwit, BIP86 taproot). */
const PURPOSE = { segwit: 84, taproot: 86 }

/** BIP44 coin type per FairWins network id (hardened at derivation time). */
const COIN_TYPE = { bitcoin: 0, 'bitcoin-testnet': 1 }

function assertMasterSeed(masterSeed) {
  if (!(masterSeed instanceof Uint8Array) || masterSeed.length !== 32) {
    throw new Error('deriveBtcSeed: masterSeed must be a 32-byte Uint8Array (spec-041 master seed)')
  }
}

function assertIndex(index) {
  // Non-hardened external-chain index: 0 ≤ i < 2^31.
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error(`bitcoin derivation: index must be a non-negative integer < 2^31, got ${String(index)}`)
  }
}

function assertNetworkAndType(network, type) {
  if (!(network in COIN_TYPE)) {
    throw new Error(`bitcoin derivation: unknown network '${String(network)}' (expected 'bitcoin' or 'bitcoin-testnet')`)
  }
  if (!(type in PURPOSE)) {
    throw new Error(`bitcoin derivation: unknown address type '${String(type)}' (expected 'segwit' or 'taproot')`)
  }
}

/**
 * The 64-byte BIP32 seed for the Bitcoin tree — HKDF-SHA256 over the spec-041
 * master seed with the domain-separating info string. Memory-only: never
 * persist, log, or transmit the result.
 *
 * @param {Uint8Array} masterSeed 32-byte spec-041 master seed
 * @returns {Uint8Array} 64-byte btcSeed
 */
export function deriveBtcSeed(masterSeed) {
  assertMasterSeed(masterSeed)
  return hkdf(sha256, masterSeed, HKDF_SALT, HKDF_INFO_BYTES, BTC_SEED_LENGTH)
}

/**
 * Derive an account node: m/84'/{coin}'/0' (segwit) or m/86'/{coin}'/0'
 * (taproot). The returned HDKey holds the account xprv — memory-only; its
 * xpub may be used for address derivation but MUST NOT be persisted or sent
 * to any service (xpub confinement, contract invariant 4).
 *
 * @param {Uint8Array} masterSeed 32-byte spec-041 master seed
 * @param {{network: 'bitcoin'|'bitcoin-testnet', type: 'segwit'|'taproot'}} opts
 * @returns {HDKey} account node
 */
export function deriveAccount(masterSeed, { network, type } = {}) {
  assertNetworkAndType(network, type)
  const root = HDKey.fromMasterSeed(deriveBtcSeed(masterSeed))
  return root.derive(`m/${PURPOSE[type]}'/${COIN_TYPE[network]}'/0'`)
}

/**
 * Public key for external-chain receive index i (account/0/i). Safe to hold
 * for address derivation; bare addresses (never keys) go to the gateway.
 *
 * @param {HDKey} account node from deriveAccount
 * @param {number} index non-negative integer
 * @returns {{pubkey: Uint8Array, index: number}} 33-byte compressed pubkey
 */
export function receivePubkey(account, index) {
  assertIndex(index)
  const node = account.deriveChild(0).deriveChild(index)
  return { pubkey: node.publicKey, index }
}

/**
 * Private key for external-chain receive index i (account/0/i) — for PSBT
 * signing ONLY. MEMORY-ONLY invariant: the returned key must never be
 * persisted, logged, serialized, or transmitted; callers hold it strictly for
 * the duration of a signing operation and drop the reference (zeroize where
 * the runtime allows) immediately after.
 *
 * @param {HDKey} account node from deriveAccount
 * @param {number} index non-negative integer
 * @returns {{privkey: Uint8Array, pubkey: Uint8Array, index: number}}
 */
export function receivePrivkey(account, index) {
  assertIndex(index)
  const node = account.deriveChild(0).deriveChild(index)
  return { privkey: node.privateKey, pubkey: node.publicKey, index }
}

/**
 * Convenience: the receive address at (network, type, index) straight from the
 * master seed. Derives transiently — nothing is retained.
 *
 * @param {Uint8Array} masterSeed 32-byte spec-041 master seed
 * @param {{network: 'bitcoin'|'bitcoin-testnet', type: 'segwit'|'taproot', index: number}} opts
 * @returns {string} bech32 (bc1q…/tb1q…) or bech32m (bc1p…/tb1p…) address
 */
export function addressAt(masterSeed, { network, type, index } = {}) {
  assertNetworkAndType(network, type)
  assertIndex(index)
  const account = deriveAccount(masterSeed, { network, type })
  const { pubkey } = receivePubkey(account, index)
  return encodeAddress(pubkey, { type, network })
}
