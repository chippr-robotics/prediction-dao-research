/**
 * Spec 041 — buildRegisterKeyCalls: the sendCalls batch a passkey session uses to
 * publish its X25519 key on-chain (no ethers signer). Mirrors registerEncryptionKey's
 * method selection (registerKeyWithEligibility when a terms hash is present, else
 * registerKey). We stub the contract resolver so no chain is touched, and decode the
 * emitted calldata with the real KeyRegistry ABI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolverMock } = vi.hoisted(() => ({ resolverMock: vi.fn() }))
vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getContractAddressForChain: resolverMock }
})

import { buildRegisterKeyCalls } from '../utils/keyRegistryService'
import { KEY_REGISTRY_ABI } from '../abis/KeyRegistry'
import { ethers } from 'ethers'

const KR_ADDR = '0x00000000000000000000000000000000000000Ec'
const iface = new ethers.Interface(KEY_REGISTRY_ABI)
const pubkey = new Uint8Array(32).fill(0x11)
const pubkeyHex = '0x' + '11'.repeat(32)

beforeEach(() => {
  resolverMock.mockReset()
  resolverMock.mockReturnValue(KR_ADDR)
})

describe('buildRegisterKeyCalls', () => {
  it('encodes registerKeyWithEligibility(pubkey, termsRef) when a terms hash is supplied', () => {
    const terms = 'ab'.repeat(32)
    const calls = buildRegisterKeyCalls(pubkey, 137, terms)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe(KR_ADDR)
    expect(calls[0].value).toBe(0n)
    const decoded = iface.decodeFunctionData('registerKeyWithEligibility', calls[0].data)
    expect(decoded[0]).toBe(pubkeyHex)
    expect(decoded[1]).toBe('0x' + terms)
  })

  it('encodes plain registerKey(pubkey) when no terms hash is supplied', () => {
    const calls = buildRegisterKeyCalls(pubkey, 137, null)
    const decoded = iface.decodeFunctionData('registerKey', calls[0].data)
    expect(decoded[0]).toBe(pubkeyHex)
  })

  it('normalizes a 0x-prefixed terms hash without double-prefixing', () => {
    const terms = '0x' + 'cd'.repeat(32)
    const calls = buildRegisterKeyCalls(pubkey, 137, terms)
    const decoded = iface.decodeFunctionData('registerKeyWithEligibility', calls[0].data)
    expect(decoded[1]).toBe(terms)
  })

  it('throws on a non-32-byte public key', () => {
    expect(() => buildRegisterKeyCalls(new Uint8Array(16), 137, null)).toThrow(/32 bytes/i)
  })

  it('throws when no KeyRegistry is configured on the chain', () => {
    resolverMock.mockReturnValue(undefined)
    expect(() => buildRegisterKeyCalls(pubkey, 137, null)).toThrow(/not configured/i)
  })
})
