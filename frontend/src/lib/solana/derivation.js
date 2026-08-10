/**
 * Solana key derivation from a recovered BIP-39 seed (spec 063, US3 / T031).
 *
 * Solana uses ed25519, so derivation is SLIP-0010 ed25519 — which supports ONLY
 * hardened children (non-hardened ed25519 CKD is mathematically undefined). Every
 * path segment is therefore hardened, which is why the canonical path is written
 * `m/44'/501'/0'/0'` (all four hardened). We hand-roll SLIP-0010 on the audited
 * @noble primitives (HMAC-SHA512 + ed25519) — zero new dependencies, and crucially
 * NOT @scure/bip32 (that is secp256k1/BIP-32 and would derive the WRONG keys).
 *
 * Schemes a recovery scan must cover (what real wallets used):
 *   bip44Change  m/44'/501'/i'/0'   Phantom / current Solflare default
 *   bip44        m/44'/501'/i'       Ledger (Ledger Live), older Solflare
 *   bareSeed     Keypair.fromSeed(seed[0:32])   solana-keygen / paper wallets
 *
 * MEMORY-ONLY (FR-017/018): the seed and every derived private key are never
 * persisted, logged, serialized, or transmitted.
 *
 * Vector (pinned in __tests__/derivation.test.js): the canonical "abandon ×11
 * about" mnemonic at m/44'/501'/0'/0' →
 *   HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk
 */

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { ed25519 } from '@noble/curves/ed25519'
import { encodeSolanaAddress } from './address'

export const SOLANA_COIN_TYPE = 501
export const SOLANA_SCHEMES = ['bip44Change', 'bip44', 'bareSeed']

const ED25519_HMAC_KEY = new TextEncoder().encode('ed25519 seed')
const HARDENED = 0x80000000

function assertSeed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length < 16) {
    throw new Error('solana derivation: seed must be a BIP-39 seed (Uint8Array, >= 16 bytes)')
  }
}

function assertAccount(account) {
  if (!Number.isInteger(account) || account < 0 || account >= HARDENED) {
    throw new Error(`solana derivation: account must be a non-negative integer < 2^31, got ${String(account)}`)
  }
}

/** SLIP-0010 ed25519 master node from a seed: { key, chainCode }. */
function masterNode(seed) {
  const I = hmac(sha512, ED25519_HMAC_KEY, seed)
  return { key: I.slice(0, 32), chainCode: I.slice(32) }
}

/** SLIP-0010 ed25519 hardened child derivation. `index` is the raw (unhardened) index. */
function deriveHardened(node, index) {
  const data = new Uint8Array(37)
  // 0x00 || parentKey(32) || ser32(index + 2^31)
  data[0] = 0
  data.set(node.key, 1)
  const hi = (index + HARDENED) >>> 0
  data[33] = (hi >>> 24) & 0xff
  data[34] = (hi >>> 16) & 0xff
  data[35] = (hi >>> 8) & 0xff
  data[36] = hi & 0xff
  const I = hmac(sha512, node.chainCode, data)
  return { key: I.slice(0, 32), chainCode: I.slice(32) }
}

/** Walk a fully-hardened path (array of raw indices) from the seed. */
function derivePath(seed, indices) {
  let node = masterNode(seed)
  for (const i of indices) node = deriveHardened(node, i)
  return node
}

/**
 * Derive a Solana keypair for a scheme + account index.
 * @param {Uint8Array} seed BIP-39 seed
 * @param {{scheme?:'bip44Change'|'bip44'|'bareSeed', account?:number}} opts
 * @returns {{ secret: Uint8Array, pubkey: Uint8Array, address: string }}
 *   `secret` is the 32-byte ed25519 private key (memory-only).
 */
export function deriveSolanaKeypair(seed, { scheme = 'bip44Change', account = 0 } = {}) {
  assertSeed(seed)
  assertAccount(account)
  let priv
  if (scheme === 'bareSeed') {
    // solana-keygen: the ed25519 seed is the first 32 bytes of the BIP-39 seed, no BIP-44.
    priv = seed.slice(0, 32)
  } else if (scheme === 'bip44') {
    priv = derivePath(seed, [44, SOLANA_COIN_TYPE, account]).key
  } else if (scheme === 'bip44Change') {
    priv = derivePath(seed, [44, SOLANA_COIN_TYPE, account, 0]).key
  } else {
    throw new Error(`solana derivation: unknown scheme '${String(scheme)}' (expected ${SOLANA_SCHEMES.join(', ')})`)
  }
  const pubkey = ed25519.getPublicKey(priv)
  return { secret: priv, pubkey, address: encodeSolanaAddress(pubkey) }
}

/**
 * Sign a message with a derived Solana secret key.
 * @param {Uint8Array} message
 * @param {Uint8Array} secret 32-byte ed25519 private key
 * @returns {Uint8Array} 64-byte signature
 */
export function signSolana(message, secret) {
  return ed25519.sign(message, secret)
}
