/**
 * Spec 061 T007 — address codec accept/reject matrix (FR-011/FR-016).
 *
 * Accepts every standard destination type on the right network; every
 * rejection carries a SPECIFIC reason slug (wrong_network is never collapsed
 * into "invalid", EVM 0x input gets its own verdict). BIP-350 vectors pin the
 * bech32m behavior; BIP-21 round-trips pin the exact sats↔BTC-decimal math.
 */
import { describe, it, expect } from 'vitest'
import { encodeAddress, classifyAddress, parseBip21, formatBip21 } from '../addresses'

// Known-good fixtures (BIP84/86 published vectors + FairWins pinned vectors).
const MAIN_P2WPKH = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const MAIN_P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
const MAIN_P2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
const MAIN_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
const MAIN_P2WSH = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3' // BIP-173 valid vector
const TEST_P2WPKH = 'tb1qmdwadm7qp82845m76s0d0ejuf9g7w97q8spp4t'
const TEST_P2TR = 'tb1pk7ztpjdrm9dqac9mdwjg5rr4264cpe76l8900x5l968u20pd46ks4jrnct'
const TEST_P2PKH = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'
const TEST_P2SH = '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'

describe('encodeAddress', () => {
  // A fixed compressed pubkey (BIP84 vector 0/0 key would also do — any valid point works).
  const pubkey = Uint8Array.from([
    0x03, 0x30, 0xd5, 0x4f, 0xd0, 0xdd, 0x42, 0x0a, 0x6e, 0x5f, 0x8d, 0x36, 0x24, 0xf5, 0xf3, 0x48, 0x2c,
    0xae, 0x35, 0x0f, 0x79, 0xd5, 0xf0, 0x75, 0x3b, 0xf5, 0xbe, 0xef, 0x9c, 0x2d, 0x91, 0xaf, 0x3c,
  ])

  it('emits the right prefix per (type, network) and round-trips through classifyAddress', () => {
    const cases = [
      ['segwit', 'bitcoin', /^bc1q/, 'p2wpkh'],
      ['taproot', 'bitcoin', /^bc1p/, 'p2tr'],
      ['segwit', 'bitcoin-testnet', /^tb1q/, 'p2wpkh'],
      ['taproot', 'bitcoin-testnet', /^tb1p/, 'p2tr'],
    ]
    for (const [type, network, prefix, classified] of cases) {
      const address = encodeAddress(pubkey, { type, network })
      expect(address).toMatch(prefix)
      expect(classifyAddress(address, network)).toEqual({ valid: true, type: classified, network })
    }
  })

  it('rejects malformed inputs (wrong key size, unknown type/network)', () => {
    expect(() => encodeAddress(pubkey.slice(0, 20), { type: 'segwit', network: 'bitcoin' })).toThrow(/33-byte/)
    expect(() => encodeAddress(pubkey, { type: 'p2pkh', network: 'bitcoin' })).toThrow(/unknown type/)
    expect(() => encodeAddress(pubkey, { type: 'segwit', network: 'dogecoin' })).toThrow(/unknown network/)
    expect(() => encodeAddress('not-bytes', { type: 'segwit', network: 'bitcoin' })).toThrow(/Uint8Array/)
  })
})

describe('classifyAddress — accept matrix', () => {
  const accepts = [
    [MAIN_P2PKH, 'bitcoin', 'p2pkh'],
    [MAIN_P2SH, 'bitcoin', 'p2sh'],
    [MAIN_P2WPKH, 'bitcoin', 'p2wpkh'],
    [MAIN_P2WSH, 'bitcoin', 'p2wsh'], // 32-byte v0 program
    [MAIN_P2TR, 'bitcoin', 'p2tr'], // bech32m v1
    [TEST_P2PKH, 'bitcoin-testnet', 'p2pkh'], // m… legacy testnet
    [TEST_P2SH, 'bitcoin-testnet', 'p2sh'], // 2… testnet
    [TEST_P2WPKH, 'bitcoin-testnet', 'p2wpkh'],
    [TEST_P2TR, 'bitcoin-testnet', 'p2tr'],
  ]
  for (const [address, network, type] of accepts) {
    it(`accepts ${type} ${address.slice(0, 12)}… on ${network}`, () => {
      expect(classifyAddress(address, network)).toEqual({ valid: true, type, network })
    })
  }

  it('accepts all-uppercase bech32 (QR alphanumeric mode)', () => {
    expect(classifyAddress(MAIN_P2WPKH.toUpperCase(), 'bitcoin')).toEqual({
      valid: true,
      type: 'p2wpkh',
      network: 'bitcoin',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(classifyAddress(`  ${MAIN_P2TR}\n`, 'bitcoin').valid).toBe(true)
  })
})

describe('classifyAddress — reject matrix', () => {
  const reason = (str, network) => {
    const verdict = classifyAddress(str, network)
    expect(verdict.valid).toBe(false)
    expect(verdict.message).toBeTruthy()
    return verdict.reason
  }

  it('wrong network is a DISTINCT verdict, both directions and both encodings', () => {
    expect(reason(TEST_P2WPKH, 'bitcoin')).toBe('wrong_network') // tb1q on mainnet
    expect(reason(TEST_P2TR, 'bitcoin')).toBe('wrong_network') // tb1p on mainnet
    expect(reason(MAIN_P2WPKH, 'bitcoin-testnet')).toBe('wrong_network') // bc1q on testnet
    expect(reason(MAIN_P2PKH, 'bitcoin-testnet')).toBe('wrong_network') // 1… on testnet
    expect(reason(TEST_P2PKH, 'bitcoin')).toBe('wrong_network') // m… on mainnet
    expect(reason(TEST_P2SH, 'bitcoin')).toBe('wrong_network') // 2… on mainnet
  })

  it('EVM 0x addresses get their own reason', () => {
    expect(reason('0x52908400098527886E0F7030069857D2E4169EE7', 'bitcoin')).toBe('evm_address')
    expect(reason('0x52908400098527886E0F7030069857D2E4169EE7', 'bitcoin-testnet')).toBe('evm_address')
  })

  it('single-character mutations fail the checksum, bech32 and base58 alike', () => {
    expect(reason(MAIN_P2WPKH.slice(0, -1) + 'v', 'bitcoin')).toBe('bad_checksum')
    expect(reason(MAIN_P2TR.slice(0, -1) + 'q', 'bitcoin')).toBe('bad_checksum')
    expect(reason('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3', 'bitcoin')).toBe('bad_checksum') // last char 2→3
  })

  it('BIP-350: bech32m checksum on v1 is enforced (v1 with bech32 checksum rejected)', () => {
    // BIP-350 invalid vector: v1 program with bech32 (not bech32m) checksum.
    expect(reason('bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4', 'bitcoin')).toBe('bad_checksum')
  })

  it('witness versions above 1 are rejected (BIP-173/350 forward versions)', () => {
    // v2 program (valid bech32 string, unknown witness template).
    expect(reason('bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs', 'bitcoin')).toBe('unsupported_witness')
    // v16 OP_1-style short program from the BIP-173 vector set.
    expect(reason('BC1SW50QGDZ25J', 'bitcoin')).toBe('unsupported_witness')
  })

  it('mixed-case bech32 is rejected with its own reason', () => {
    expect(reason(MAIN_P2WPKH.slice(0, -1) + MAIN_P2WPKH.slice(-1).toUpperCase(), 'bitcoin')).toBe('mixed_case')
    expect(reason('tb1qMdwadm7qp82845m76s0d0ejuf9g7w97q8spp4t', 'bitcoin-testnet')).toBe('mixed_case')
  })

  it('empty and garbage inputs', () => {
    expect(reason('', 'bitcoin')).toBe('empty')
    expect(reason('   ', 'bitcoin')).toBe('empty')
    expect(classifyAddress(undefined, 'bitcoin').reason).toBe('empty')
    expect(reason('notanaddress', 'bitcoin')).toBe('unrecognized')
    expect(reason('bitcoin is great', 'bitcoin')).toBe('unrecognized')
  })

  it('never throws on member input, only on a bad networkId (programmer error)', () => {
    expect(() => classifyAddress(MAIN_P2WPKH, 'litecoin')).toThrow(/unknown network/)
  })
})

describe('BIP-21 URIs', () => {
  it('formats address-only, then round-trips through parse', () => {
    const uri = formatBip21(MAIN_P2WPKH)
    expect(uri).toBe(`bitcoin:${MAIN_P2WPKH}`)
    expect(parseBip21(uri, 'bitcoin')).toEqual({ address: MAIN_P2WPKH, type: 'p2wpkh' })
  })

  it('amount is BTC decimal per BIP-21, exact to the satoshi', () => {
    expect(formatBip21(MAIN_P2WPKH, { amountSats: 100_000_000 })).toBe(`bitcoin:${MAIN_P2WPKH}?amount=1`)
    expect(formatBip21(MAIN_P2WPKH, { amountSats: 1 })).toBe(`bitcoin:${MAIN_P2WPKH}?amount=0.00000001`)
    expect(formatBip21(MAIN_P2WPKH, { amountSats: 100_000_001 })).toBe(`bitcoin:${MAIN_P2WPKH}?amount=1.00000001`)
    expect(formatBip21(MAIN_P2WPKH, { amountSats: 12_345 })).toBe(`bitcoin:${MAIN_P2WPKH}?amount=0.00012345`)
    // A value where naive float math drifts (0.1 + satoshi-scale fractions).
    expect(formatBip21(MAIN_P2WPKH, { amountSats: 10_000_003 })).toBe(`bitcoin:${MAIN_P2WPKH}?amount=0.10000003`)
  })

  it('round-trips amounts sats → BTC string → sats without rounding loss', () => {
    for (const sats of [1, 546, 12_345, 10_000_003, 100_000_000, 2_100_000_000_000_000]) {
      const parsed = parseBip21(formatBip21(MAIN_P2WPKH, { amountSats: sats }), 'bitcoin')
      expect(parsed.amountSats).toBe(sats)
    }
  })

  it('parses amount + label together', () => {
    const parsed = parseBip21(`bitcoin:${MAIN_P2TR}?amount=0.001&label=Rent%20share`, 'bitcoin')
    expect(parsed).toEqual({ address: MAIN_P2TR, type: 'p2tr', amountSats: 100_000, label: 'Rent share' })
  })

  it('scheme is case-insensitive; non-bitcoin schemes are rejected', () => {
    expect(parseBip21(`BITCOIN:${MAIN_P2WPKH}`, 'bitcoin')).toEqual({ address: MAIN_P2WPKH, type: 'p2wpkh' })
    expect(parseBip21(`Bitcoin:${MAIN_P2WPKH}?amount=1`, 'bitcoin').amountSats).toBe(100_000_000)
    expect(parseBip21(`ethereum:${MAIN_P2WPKH}`, 'bitcoin').error).toBe('unsupported_scheme')
    expect(parseBip21(MAIN_P2WPKH, 'bitcoin').error).toBe('unsupported_scheme') // bare address is not a URI
  })

  it('rejects sub-satoshi and malformed amounts', () => {
    expect(parseBip21(`bitcoin:${MAIN_P2WPKH}?amount=0.000000001`, 'bitcoin').error).toBe('invalid_amount') // 9 dp
    expect(parseBip21(`bitcoin:${MAIN_P2WPKH}?amount=1e-8`, 'bitcoin').error).toBe('invalid_amount')
    expect(parseBip21(`bitcoin:${MAIN_P2WPKH}?amount=-1`, 'bitcoin').error).toBe('invalid_amount')
    expect(parseBip21(`bitcoin:${MAIN_P2WPKH}?amount=abc`, 'bitcoin').error).toBe('invalid_amount')
  })

  it('propagates address verdicts: wrong network stays distinct, invalid is invalid', () => {
    expect(parseBip21(`bitcoin:${TEST_P2WPKH}`, 'bitcoin').error).toBe('wrong_network')
    expect(parseBip21(`bitcoin:${MAIN_P2WPKH}`, 'bitcoin-testnet').error).toBe('wrong_network')
    expect(parseBip21('bitcoin:nonsense', 'bitcoin').error).toBe('invalid_address')
  })

  it('rejects unknown req-* parameters (BIP-21 MUST)', () => {
    expect(parseBip21(`bitcoin:${MAIN_P2WPKH}?req-payjoin=1`, 'bitcoin').error).toBe('unsupported_required_param')
  })

  it('formatBip21 guards its inputs', () => {
    expect(() => formatBip21('')).toThrow(/address is required/)
    expect(() => formatBip21(MAIN_P2WPKH, { amountSats: 1.5 })).toThrow(/non-negative integer/)
    expect(() => formatBip21(MAIN_P2WPKH, { amountSats: -1 })).toThrow(/non-negative integer/)
  })
})
