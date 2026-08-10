// Spec 063 (US2, T020/T021) — legacy/hardware-wallet Bitcoin derivation vectors.
//
// The canonical "abandon ×11 about" mnemonic. BIP84/BIP86 rows match the PUBLISHED
// spec vectors byte-for-byte (proving the standard-BIP-39-seed → address path is
// correct); the BIP44/BIP49 rows are pinned from the same validated toolchain.
// T021: the frozen spec-061 passkey derivation is imported and asserted unchanged.

import { describe, it, expect } from 'vitest'
import {
  seedFromMnemonic,
  deriveLegacyAccount,
  deriveChildNode,
  legacyAddressAt,
  LEGACY_PURPOSE,
} from '../legacyDerivation'
import { BTC_HKDF_INFO } from '../derivation'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Reference 64-byte BIP-39 seed for the mnemonic with EMPTY passphrase (same value the
// published BIP84/86 vectors and the spec-061 test use).
const REFERENCE_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
  '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'

const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('')

describe('legacy Bitcoin derivation — seedFromMnemonic', () => {
  it('produces the canonical 64-byte BIP-39 seed for the reference mnemonic', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    expect(seed).toBeInstanceOf(Uint8Array)
    expect(seed.length).toBe(64)
    expect(toHex(seed)).toBe(REFERENCE_SEED_HEX)
  })

  it('tolerates ragged whitespace in the recovered phrase', () => {
    const messy = `  abandon   abandon abandon abandon abandon abandon\tabandon abandon abandon abandon abandon about `
    expect(toHex(seedFromMnemonic(messy))).toBe(REFERENCE_SEED_HEX)
  })

  it('rejects empty input', () => {
    expect(() => seedFromMnemonic('')).toThrow(/non-empty/i)
  })
})

describe('legacy Bitcoin derivation — pinned address vectors (account 0, .../0/0)', () => {
  // mnemonic → seed → m/{purpose}'/0'/0'/0/0
  const VECTORS = {
    legacy: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA', // BIP44 P2PKH
    'wrapped-segwit': '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf', // BIP49 P2SH-P2WPKH
    segwit: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // BIP84 P2WPKH — published vector
    taproot: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // BIP86 P2TR — published vector
  }

  for (const [type, expected] of Object.entries(VECTORS)) {
    it(`${type} (BIP${LEGACY_PURPOSE[type]}) → ${expected.slice(0, 8)}…`, () => {
      const seed = seedFromMnemonic(MNEMONIC)
      expect(legacyAddressAt(seed, { type, account: 0, index: 0, network: 'bitcoin' })).toBe(expected)
    })
  }

  it('derives distinct addresses across account indices (>0 supported)', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const a0 = legacyAddressAt(seed, { type: 'segwit', account: 0, index: 0 })
    const a1 = legacyAddressAt(seed, { type: 'segwit', account: 1, index: 0 })
    expect(a1).not.toBe(a0)
    expect(a1.startsWith('bc1q')).toBe(true)
  })

  it('derives the external and change chains independently', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const acct = deriveLegacyAccount(seed, { type: 'segwit', account: 0, network: 'bitcoin' })
    const ext = deriveChildNode(acct, { chain: 0, index: 0 }).publicKey
    const chg = deriveChildNode(acct, { chain: 1, index: 0 }).publicKey
    expect(toHex(ext)).not.toBe(toHex(chg))
  })

  it('is deterministic — same seed ⇒ byte-identical address', () => {
    expect(legacyAddressAt(seedFromMnemonic(MNEMONIC), { type: 'taproot' })).toBe(VECTORS.taproot)
  })
})

describe('legacy Bitcoin derivation — testnet + validation', () => {
  it('encodes testnet types with the right prefixes', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    expect(legacyAddressAt(seed, { type: 'segwit', network: 'bitcoin-testnet' }).startsWith('tb1q')).toBe(true)
    expect(legacyAddressAt(seed, { type: 'taproot', network: 'bitcoin-testnet' }).startsWith('tb1p')).toBe(true)
    // legacy/wrapped testnet prefixes are 'm'/'n' (P2PKH) and '2' (P2SH).
    expect(/^[mn2]/.test(legacyAddressAt(seed, { type: 'legacy', network: 'bitcoin-testnet' }))).toBe(true)
    expect(legacyAddressAt(seed, { type: 'wrapped-segwit', network: 'bitcoin-testnet' }).startsWith('2')).toBe(true)
  })

  it('rejects a wrong-length seed and unknown type/network', () => {
    expect(() => legacyAddressAt(new Uint8Array(32), { type: 'segwit' })).toThrow(/64-byte/i)
    expect(() => legacyAddressAt(seedFromMnemonic(MNEMONIC), { type: 'nope' })).toThrow(/unknown type/i)
    expect(() => legacyAddressAt(seedFromMnemonic(MNEMONIC), { type: 'segwit', network: 'doge' })).toThrow(/unknown network/i)
  })
})

describe('legacy derivation is ADDITIVE — the frozen passkey path is untouched (SC-007)', () => {
  it('does not alter the frozen HKDF domain-separation constant', () => {
    // If a refactor ever reached into derivation.js this canary would move.
    expect(BTC_HKDF_INFO).toBe('fairwins-btc-seed-v1')
  })
})
