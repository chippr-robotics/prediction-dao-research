/**
 * Spec 061 T005 — Bitcoin key derivation contract freeze.
 *
 * Three layers of vectors:
 *  1. Published BIP84/BIP86 reference vectors (mnemonic "abandon ×11 about",
 *     empty passphrase) validate the underlying @scure/bip32 + address
 *     encoding stack against the wider ecosystem.
 *  2. Pinned FairWins vectors (fixed 32-byte test seeds → first 3 addresses
 *     per network × type) FREEZE the full HKDF→BIP32 derivation contract —
 *     if any of these ever change, deployed wallets lose their funds' paths.
 *     Generated once from contracts/key-derivation-btc.md and hardcoded.
 *  3. Invariants: domain separation vs the spec-041 KEK info string,
 *     determinism, and wrong-length rejection (no-silent-wrong-keys).
 */
import { describe, it, expect } from 'vitest'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { HDKey } from '@scure/bip32'
import {
  BTC_HKDF_INFO,
  deriveBtcSeed,
  deriveAccount,
  receivePubkey,
  receivePrivkey,
  addressAt,
} from '../derivation'
import { encodeAddress } from '../addresses'

const hex = (s) => Uint8Array.from(s.match(/../g).map((b) => parseInt(b, 16)))

// BIP39 seed for "abandon abandon abandon abandon abandon abandon abandon
// abandon abandon abandon abandon about" with EMPTY passphrase — the seed the
// published BIP84/BIP86 test vectors derive from (verified by reproducing the
// published first addresses below).
const BIP_REFERENCE_SEED = hex(
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
    '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
)

// FairWins pinned test seeds (contracts/key-derivation-btc.md invariant 1).
const SEED_A = new Uint8Array(32).fill(0x07)
const SEED_B = Uint8Array.from({ length: 32 }, (_, i) => i + 1)

describe('BIP84/BIP86 published reference vectors (underlying stack)', () => {
  const receive = (purpose, i) =>
    HDKey.fromMasterSeed(BIP_REFERENCE_SEED).derive(`m/${purpose}'/0'/0'`).deriveChild(0).deriveChild(i).publicKey

  it('BIP84: m/84h/0h/0h/0/0 and 0/1 give the published bc1q addresses', () => {
    expect(encodeAddress(receive(84, 0), { type: 'segwit', network: 'bitcoin' })).toBe(
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
    )
    expect(encodeAddress(receive(84, 1), { type: 'segwit', network: 'bitcoin' })).toBe(
      'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g'
    )
  })

  it('BIP86: m/86h/0h/0h/0/0 and 0/1 give the published bc1p addresses (BIP-341 tweak applied)', () => {
    expect(encodeAddress(receive(86, 0), { type: 'taproot', network: 'bitcoin' })).toBe(
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
    )
    expect(encodeAddress(receive(86, 1), { type: 'taproot', network: 'bitcoin' })).toBe(
      'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh'
    )
  })
})

describe('pinned FairWins vectors — the frozen derivation contract', () => {
  // btcSeed = HKDF-SHA256(masterSeed, salt=32 zero bytes, info="fairwins-btc-seed-v1", L=64)
  it('deriveBtcSeed pins the HKDF output for both test seeds', () => {
    expect(bytesToHex(deriveBtcSeed(SEED_A))).toBe(
      '027de0485c46bb62e5b3b3fd77878dc755256a85c9b334d5a0d7dad89a3eb739' +
        'd6811fce8c4029acda0e3574b288832c0c6f52d5c5cb8f1d6603a9cb6a209cde'
    )
    expect(bytesToHex(deriveBtcSeed(SEED_B))).toBe(
      'ae9468938d3ab6deffddcf93e454913c399bb2f8f8d96d9ea5a846790be738cd' +
        '8efc44bb7464bb0c3c09ac745969c6f20a5a9943de227985ca2df0d55a0e882f'
    )
  })

  const PINNED = {
    seedA: {
      seed: SEED_A,
      'bitcoin/segwit': [
        'bc1q87l6dzq2tzcsrwyllwgdzy8a63xtmda9306k07',
        'bc1q6sv75chekyztl9nxrjak2u4snjus000neg5dyf',
        'bc1qz53c3xvq6yk4x0kkhgggw3p05tz6fzz7ngcwae',
      ],
      'bitcoin/taproot': [
        'bc1p4tw9390sr8yc4k7sqgvl6eg27a06a006rhucxpfeefka3r8l5n7sxa5zvj',
        'bc1pv3m4cy953spd9ywx5g5j3luwyg0jmu98dk2xv4nvt2cjage2jljsccw2vd',
        'bc1p5avgskp6n258yyaf2lz8ay7j6yf3d6ufggnzdcp0f5kse8f2l08shrq6c3',
      ],
      'bitcoin-testnet/segwit': [
        'tb1qahs87cz3mcdw30yrl3e4uwe50phqe6y9w8pmhe',
        'tb1qzns90hltlt97fgu8dtrp928tslxm6guhsnspwz',
        'tb1qxgjzpz6up5lh5vlapu3qwaf292qhr79x065yl0',
      ],
      'bitcoin-testnet/taproot': [
        'tb1p7h7d7wm9q39w2dd0ejehr5eppkj2kg0p83dhqdzyvgvvpcw2zphq6wa9km',
        'tb1p6kd5q9q4sgl6qk8wlw6qudlzseu589ultjaegfdzzhtyrxumeevq2ugsqx',
        'tb1pfalv8wj62ezdz7pwe4fuqzupu5et82hu672elgf92gnxxaczrquqqws9hr',
      ],
    },
    seedB: {
      seed: SEED_B,
      'bitcoin/segwit': [
        'bc1qfzp7p2gp3pphyhg0aaxzd8m3d2y2x8e9k8f39z',
        'bc1qkganaxrke4f3xask8rg9yqvwtgmjp8a4l7eqyy',
        'bc1qexdq30fe5cx0sm3luxkgc7zmynawx5uy8xa9jp',
      ],
      'bitcoin/taproot': [
        'bc1padh6sdu0tc23qr5qy3vgw20klgy0zkrnvejh47cu8d5554shlnqq959v8d',
        'bc1pjxs0jh4dymuvvszckkxe0a0njlg9h2nvvaternst2mkqmdjcftdsgm0mgf',
        'bc1pqevyvdv3ky53uut49zrkl3mjd6j2v55pvdxc06nh3e325fzga69sk3phxu',
      ],
      'bitcoin-testnet/segwit': [
        'tb1qmdwadm7qp82845m76s0d0ejuf9g7w97q8spp4t',
        'tb1q8kglrgrx0rncrwg0ug60zs0u2kq2jd7m2cq9vj',
        'tb1qsmpsazzxwvfysmpe42xrx34m5w6jkdnklfeem3',
      ],
      'bitcoin-testnet/taproot': [
        'tb1pk7ztpjdrm9dqac9mdwjg5rr4264cpe76l8900x5l968u20pd46ks4jrnct',
        'tb1pjz4x38nl2gvetspqxhrz4vm0scqfwvctxppxd3r57hzh4ljtgewqypfrh7',
        'tb1pavl4yf6zcvn96ks2eel4avxtvle6uzrl85luwkkwml8y8up5jjtsm24y2c',
      ],
    },
  }

  for (const [name, vectors] of Object.entries(PINNED)) {
    for (const combo of ['bitcoin/segwit', 'bitcoin/taproot', 'bitcoin-testnet/segwit', 'bitcoin-testnet/taproot']) {
      const [network, type] = combo.split('/')
      it(`${name} → ${combo}: first 3 receive addresses match the pinned vectors`, () => {
        const derived = [0, 1, 2].map((index) => addressAt(vectors.seed, { network, type, index }))
        expect(derived).toEqual(vectors[combo])
      })
    }
  }

  it('address prefixes match (network, type): bc1q/bc1p vs tb1q/tb1p', () => {
    expect(addressAt(SEED_A, { network: 'bitcoin', type: 'segwit', index: 0 })).toMatch(/^bc1q/)
    expect(addressAt(SEED_A, { network: 'bitcoin', type: 'taproot', index: 0 })).toMatch(/^bc1p/)
    expect(addressAt(SEED_A, { network: 'bitcoin-testnet', type: 'segwit', index: 0 })).toMatch(/^tb1q/)
    expect(addressAt(SEED_A, { network: 'bitcoin-testnet', type: 'taproot', index: 0 })).toMatch(/^tb1p/)
  })
})

describe('domain separation (contract invariant 2)', () => {
  it('exports the normative info string', () => {
    expect(BTC_HKDF_INFO).toBe('fairwins-btc-seed-v1')
  })

  it('btcSeed differs from the raw masterSeed (never used directly)', () => {
    const btcSeed = deriveBtcSeed(SEED_A)
    expect(btcSeed).toHaveLength(64)
    expect(bytesToHex(btcSeed.slice(0, 32))).not.toBe(bytesToHex(SEED_A))
  })

  it('btcSeed differs from an HKDF under the spec-041 KEK info string (tree isolation)', () => {
    const kekPath = hkdf(sha256, SEED_A, new Uint8Array(32), new TextEncoder().encode('fairwins-kek-v1'), 64)
    expect(bytesToHex(deriveBtcSeed(SEED_A))).not.toBe(bytesToHex(kekPath))
  })

  it('different master seeds yield unrelated trees', () => {
    expect(bytesToHex(deriveBtcSeed(SEED_A))).not.toBe(bytesToHex(deriveBtcSeed(SEED_B)))
  })
})

describe('determinism & input guards (contract invariants 1 and 5)', () => {
  it('two independent derivations are byte-identical', () => {
    expect(bytesToHex(deriveBtcSeed(SEED_A))).toBe(bytesToHex(deriveBtcSeed(new Uint8Array(32).fill(0x07))))
    const a1 = addressAt(SEED_B, { network: 'bitcoin', type: 'taproot', index: 2 })
    const a2 = addressAt(Uint8Array.from(SEED_B), { network: 'bitcoin', type: 'taproot', index: 2 })
    expect(a1).toBe(a2)
  })

  it('wrong-length or non-Uint8Array master seed throws — never silently derives a different wallet', () => {
    expect(() => deriveBtcSeed(new Uint8Array(31))).toThrow(/32-byte/)
    expect(() => deriveBtcSeed(new Uint8Array(33))).toThrow(/32-byte/)
    expect(() => deriveBtcSeed(new Uint8Array(0))).toThrow(/32-byte/)
    expect(() => deriveBtcSeed('07'.repeat(32))).toThrow(/32-byte/)
    expect(() => deriveBtcSeed(undefined)).toThrow(/32-byte/)
  })

  it('unknown network or type throws', () => {
    expect(() => deriveAccount(SEED_A, { network: 'bitcoin-regtest', type: 'segwit' })).toThrow(/unknown network/)
    expect(() => deriveAccount(SEED_A, { network: 'bitcoin', type: 'legacy' })).toThrow(/unknown address type/)
    expect(() => addressAt(SEED_A, { network: 'polygon', type: 'segwit', index: 0 })).toThrow(/unknown network/)
  })

  it('index must be a non-negative integer < 2^31', () => {
    const account = deriveAccount(SEED_A, { network: 'bitcoin', type: 'segwit' })
    expect(() => receivePubkey(account, -1)).toThrow(/non-negative integer/)
    expect(() => receivePubkey(account, 1.5)).toThrow(/non-negative integer/)
    expect(() => receivePubkey(account, '0')).toThrow(/non-negative integer/)
    expect(() => receivePubkey(account, 0x80000000)).toThrow(/non-negative integer/)
    expect(() => receivePrivkey(account, -1)).toThrow(/non-negative integer/)
    expect(() => addressAt(SEED_A, { network: 'bitcoin', type: 'segwit', index: NaN })).toThrow(/non-negative integer/)
  })
})

describe('receive keys (external chain 0/i only)', () => {
  it('receivePubkey returns a 33-byte compressed key with its index', () => {
    const account = deriveAccount(SEED_A, { network: 'bitcoin', type: 'segwit' })
    const { pubkey, index } = receivePubkey(account, 5)
    expect(index).toBe(5)
    expect(pubkey).toBeInstanceOf(Uint8Array)
    expect(pubkey).toHaveLength(33)
    expect([2, 3]).toContain(pubkey[0])
  })

  it('receivePrivkey pairs with receivePubkey at the same index (memory-only signing key)', () => {
    const account = deriveAccount(SEED_B, { network: 'bitcoin-testnet', type: 'taproot' })
    const { privkey, pubkey, index } = receivePrivkey(account, 3)
    expect(index).toBe(3)
    expect(privkey).toBeInstanceOf(Uint8Array)
    expect(privkey).toHaveLength(32)
    expect(bytesToHex(pubkey)).toBe(bytesToHex(receivePubkey(account, 3).pubkey))
    // Different indexes hold different keys (no key reuse across rotation).
    expect(bytesToHex(privkey)).not.toBe(bytesToHex(receivePrivkey(account, 4).privkey))
  })

  it('receive chain is the EXTERNAL chain: matches manual account/0/i derivation, not account/1/i', () => {
    const account = deriveAccount(SEED_A, { network: 'bitcoin', type: 'segwit' })
    const external = account.deriveChild(0).deriveChild(7).publicKey
    const change = account.deriveChild(1).deriveChild(7).publicKey
    expect(bytesToHex(receivePubkey(account, 7).pubkey)).toBe(bytesToHex(external))
    expect(bytesToHex(receivePubkey(account, 7).pubkey)).not.toBe(bytesToHex(change))
  })
})
