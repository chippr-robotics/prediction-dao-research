/**
 * Issue #1286 (part 2) — a failed key read must never render as a fact about another member.
 *
 * `lookupPublicKey` used to return `null` for BOTH "the registry holds no key for them" and
 * "we could not read the registry", and the wager create path turned that single `null` into
 * "your opponent has not registered their encryption key yet" — a definite claim about someone
 * else, manufactured by our own RPC failing. `lookupPublicKeyState` separates the two, in the
 * same shape the estate reads use: a value exists only in state `read`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getPublicKey, registryAddress } = vi.hoisted(() => ({
  getPublicKey: vi.fn(),
  registryAddress: { value: '0x00000000000000000000000000000000000000ff' },
}))

vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => registryAddress.value),
  getContractAddressForChain: vi.fn(() => registryAddress.value),
}))

vi.mock('ethers', async (orig) => {
  const actual = await orig()
  const FakeCtor = vi.fn(() => ({ getPublicKey }))
  return { ...actual, Contract: FakeCtor, ethers: { ...actual.ethers, Contract: FakeCtor } }
})

import { lookupPublicKeyState, lookupPublicKey, KEY_LOOKUP, clearKeyCache } from '../utils/keyRegistryService'

const ADDRESS = '0x0000000000000000000000000000000000000abc'
const KEY = '0x' + '1e'.repeat(32)
const provider = { getNetwork: async () => ({ chainId: 80002n }) }

beforeEach(() => {
  clearKeyCache()
  getPublicKey.mockReset()
  registryAddress.value = '0x00000000000000000000000000000000000000ff'
})

describe('lookupPublicKeyState — three states, never two', () => {
  it('read: a 32-byte key comes back as a value', async () => {
    getPublicKey.mockResolvedValue(KEY)
    const result = await lookupPublicKeyState(ADDRESS, provider)
    expect(result.state).toBe(KEY_LOOKUP.READ)
    expect(result.publicKey).toHaveLength(32)
  })

  it('not-registered: the registry ANSWERED and holds nothing — the one negative we may state', async () => {
    getPublicKey.mockResolvedValue('0x')
    const result = await lookupPublicKeyState(ADDRESS, provider)
    expect(result.state).toBe(KEY_LOOKUP.NOT_REGISTERED)
    expect(result.publicKey).toBeUndefined() // a value exists only in state `read`
  })

  it('unreadable: an RPC failure is NOT evidence that the member has no key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getPublicKey.mockRejectedValue(new Error('missing revert data'))
    const result = await lookupPublicKeyState(ADDRESS, provider)
    expect(result.state).toBe(KEY_LOOKUP.UNREADABLE)
    expect(result.publicKey).toBeUndefined()
    console.error.mockRestore()
  })

  it('unreadable: bytes that are not an X25519 key say nothing about registration', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getPublicKey.mockResolvedValue('0x' + 'ab'.repeat(16))
    expect((await lookupPublicKeyState(ADDRESS, provider)).state).toBe(KEY_LOOKUP.UNREADABLE)
    console.warn.mockRestore()
  })

  it('unreadable: no registry configured on this chain is a failure to read, not a negative', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    registryAddress.value = undefined
    expect((await lookupPublicKeyState(ADDRESS, provider)).state).toBe(KEY_LOOKUP.UNREADABLE)
    console.error.mockRestore()
  })

  it('never caches a failed read as a miss', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getPublicKey.mockRejectedValueOnce(new Error('timeout'))
    expect((await lookupPublicKeyState(ADDRESS, provider)).state).toBe(KEY_LOOKUP.UNREADABLE)
    // The next read must actually go back to the chain — a cached "no key" would keep
    // accusing the member for the whole TTL.
    getPublicKey.mockResolvedValue(KEY)
    expect((await lookupPublicKeyState(ADDRESS, provider)).state).toBe(KEY_LOOKUP.READ)
    console.error.mockRestore()
  })

  it('lookupPublicKey stays a bytes-or-null wrapper for callers that cannot act on the difference', async () => {
    getPublicKey.mockResolvedValue(KEY)
    expect(await lookupPublicKey(ADDRESS, provider)).toHaveLength(32)
    clearKeyCache()
    getPublicKey.mockResolvedValue('0x')
    expect(await lookupPublicKey(ADDRESS, provider)).toBeNull()
  })
})
