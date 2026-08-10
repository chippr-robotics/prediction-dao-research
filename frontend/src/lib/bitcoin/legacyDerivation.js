/**
 * Bitcoin legacy/hardware-wallet derivation (spec 063, US2 / T023).
 *
 * ADDITIVE, HKDF-FREE entry point for recovering Bitcoin a legacy BIP-39 seed
 * controls. This does NOT touch the frozen spec-061 passkey path in
 * derivation.js (which HKDF-derives its own btcSeed from the spec-041 master
 * seed and is WALLET-BREAKING if changed, SC-007). Here the input is a STANDARD
 * BIP-39 seed (from a recovered mnemonic), fed straight into BIP-32 like every
 * other wallet does:
 *
 *   seed  = mnemonicToSeed(mnemonic)                 // 64 bytes, standard BIP-39
 *   root  = HDKey.fromMasterSeed(seed)               // @scure/bip32
 *   acct  = root.derive(`m/{purpose}'/{coin}'/{account}'`)
 *   addr  = encode( acct/{chain}/{index} )           // chain 0 external, 1 change
 *
 * Purposes cover what hardware/older wallets actually used, across MULTIPLE
 * accounts (not just account 0):
 *   legacy         BIP44  m/44'  → P2PKH  '1…'
 *   wrapped-segwit BIP49  m/49'  → P2SH   '3…'
 *   segwit         BIP84  m/84'  → P2WPKH 'bc1q…'
 *   taproot        BIP86  m/86'  → P2TR   'bc1p…'
 *
 * MEMORY-ONLY (FR-017/018): the seed, root, account nodes, and any private keys
 * derived here are never persisted, logged, serialized, or transmitted. Callers
 * hold them only for the duration of a discovery/signing operation.
 *
 * Vectors (canonical "abandon ×11 about" mnemonic, account 0, .../0/0) pinned in
 * __tests__/legacyDerivation.test.js — BIP84/BIP86 match the published spec
 * vectors byte-for-byte, which validates the BIP44/BIP49 rows derived the same way.
 */

import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { encodeLegacyAddress } from './legacyAddresses'

/** Address type → BIP purpose. */
export const LEGACY_PURPOSE = Object.freeze({
  legacy: 44,
  'wrapped-segwit': 49,
  segwit: 84,
  taproot: 86,
})

/** FairWins network id → BIP44 coin type (hardened at derivation time). */
const COIN_TYPE = { bitcoin: 0, 'bitcoin-testnet': 1 }

/** External (receive) and internal (change) chains, per BIP44. */
export const CHAIN = Object.freeze({ external: 0, change: 1 })

function assertSeed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 64) {
    throw new Error('bitcoin legacy derivation: seed must be a 64-byte BIP-39 seed (Uint8Array)')
  }
}

function assertTypeNetwork(type, network) {
  if (!(type in LEGACY_PURPOSE)) {
    throw new Error(`bitcoin legacy derivation: unknown type '${String(type)}' (expected one of ${Object.keys(LEGACY_PURPOSE).join(', ')})`)
  }
  if (!(network in COIN_TYPE)) {
    throw new Error(`bitcoin legacy derivation: unknown network '${String(network)}' (expected 'bitcoin' or 'bitcoin-testnet')`)
  }
}

function assertUint31(n, label) {
  if (!Number.isInteger(n) || n < 0 || n >= 0x80000000) {
    throw new Error(`bitcoin legacy derivation: ${label} must be a non-negative integer < 2^31, got ${String(n)}`)
  }
}

/**
 * Convert a recovered BIP-39 mnemonic to its 64-byte seed. Memory-only.
 * @param {string} mnemonic space-separated word list
 * @param {string} [passphrase] optional BIP-39 passphrase ("25th word")
 * @returns {Uint8Array} 64-byte seed
 */
export function seedFromMnemonic(mnemonic, passphrase = '') {
  if (typeof mnemonic !== 'string' || !mnemonic.trim()) {
    throw new Error('seedFromMnemonic: mnemonic must be a non-empty string')
  }
  return mnemonicToSeedSync(mnemonic.trim().replace(/\s+/g, ' '), passphrase)
}

/**
 * Derive an account node m/{purpose}'/{coin}'/{account}'. Returns an HDKey holding
 * the account xprv — memory-only; never persist/transmit its xprv/xpub.
 *
 * @param {Uint8Array} seed 64-byte BIP-39 seed
 * @param {{type:string, account?:number, network?:'bitcoin'|'bitcoin-testnet'}} opts
 * @returns {import('@scure/bip32').HDKey}
 */
export function deriveLegacyAccount(seed, { type, account = 0, network = 'bitcoin' } = {}) {
  assertSeed(seed)
  assertTypeNetwork(type, network)
  assertUint31(account, 'account')
  const root = HDKey.fromMasterSeed(seed)
  return root.derive(`m/${LEGACY_PURPOSE[type]}'/${COIN_TYPE[network]}'/${account}'`)
}

/**
 * Child node at {chain}/{index} of an account (chain 0 = external/receive, 1 = change).
 * @returns {import('@scure/bip32').HDKey}
 */
export function deriveChildNode(account, { chain = CHAIN.external, index }) {
  assertUint31(chain, 'chain')
  assertUint31(index, 'index')
  return account.deriveChild(chain).deriveChild(index)
}

/**
 * The address at (type, account, chain, index) straight from the seed. Derives
 * transiently — nothing is retained.
 *
 * @param {Uint8Array} seed 64-byte BIP-39 seed
 * @param {{type:string, account?:number, chain?:number, index?:number, network?:string}} opts
 * @returns {string} address of `type` on `network`
 */
export function legacyAddressAt(seed, { type, account = 0, chain = CHAIN.external, index = 0, network = 'bitcoin' } = {}) {
  const acct = deriveLegacyAccount(seed, { type, account, network })
  const node = deriveChildNode(acct, { chain, index })
  return encodeLegacyAddress(node.publicKey, { type, network })
}

/**
 * The private+public key at (type, account, chain, index) — for PSBT signing ONLY.
 * MEMORY-ONLY: the returned private key must never be persisted, logged, or
 * transmitted; drop the reference immediately after signing.
 *
 * @returns {{privkey:Uint8Array, pubkey:Uint8Array}}
 */
export function legacySigningKeyAt(seed, { type, account = 0, chain = CHAIN.external, index = 0, network = 'bitcoin' } = {}) {
  const acct = deriveLegacyAccount(seed, { type, account, network })
  const node = deriveChildNode(acct, { chain, index })
  return { privkey: node.privateKey, pubkey: node.publicKey }
}
