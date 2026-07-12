import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the address resolver + ethers Contract so we can drive resolve/tagOf return values.
const mockResolve = vi.fn()
const mockTagOf = vi.fn()

vi.mock('../../../config/contracts', () => ({
  getContractAddressForChain: (name) => (name === 'wagerTagRegistry' ? '0x00000000000000000000000000000000000000AA' : undefined),
}))

vi.mock('ethers', () => ({
  // Regular function (not an arrow) so it is usable with `new`.
  Contract: vi.fn(function () {
    this.resolve = mockResolve
    this.tagOf = mockTagOf
  }),
}))

import { resolveTag, lookupTagOf, isResolvableForValue, TagStatus } from '../resolveTag'

const provider = {} // opaque; the mocked Contract ignores it
const opts = { provider, chainId: 137 }
const ACTIVE = {
  owner: '0x1111111111111111111111111111111111111111',
  tag: 'chipprbots',
  status: 1n,
  verified: true,
  pendingOwner: '0x0000000000000000000000000000000000000000',
  repointEffectiveAt: 0n,
  quarantinedUntil: 0n,
}

beforeEach(() => {
  mockResolve.mockReset()
  mockTagOf.mockReset()
})

describe('resolveTag', () => {
  it('forward-resolves a valid tag to owner + ACTIVE status', async () => {
    mockResolve.mockResolvedValue(ACTIVE)
    const info = await resolveTag('%ChipprBots', opts)
    expect(info.address).toBe(ACTIVE.owner)
    expect(info.status).toBe(TagStatus.ACTIVE)
    expect(isResolvableForValue(info)).toBe(true)
    // normalized before the call
    expect(mockResolve).toHaveBeenCalledWith('chipprbots')
  })

  it('returns null for a non-tag input (e.g. a 42-char address) without calling the contract', async () => {
    const info = await resolveTag('0x1234567890abcdef1234567890abcdef12345678', opts)
    expect(info).toBeNull()
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('soft-fails to null when the contract read throws (FR-013)', async () => {
    mockResolve.mockRejectedValue(new Error('rpc down'))
    expect(await resolveTag('chipprbots', opts)).toBeNull()
  })

  it('non-ACTIVE status is not resolvable for value', async () => {
    mockResolve.mockResolvedValue({ ...ACTIVE, status: 3n }) // QUARANTINED
    const info = await resolveTag('chipprbots', opts)
    expect(info.status).toBe(TagStatus.QUARANTINED)
    expect(isResolvableForValue(info)).toBe(false)
  })
})

describe('lookupTagOf', () => {
  it('returns the active tag + verification for an address', async () => {
    mockTagOf.mockResolvedValue('chipprbots')
    mockResolve.mockResolvedValue(ACTIVE)
    const res = await lookupTagOf(ACTIVE.owner, opts)
    expect(res).toEqual({ tag: 'chipprbots', verified: true })
  })

  it('returns null when the address has no active tag', async () => {
    mockTagOf.mockResolvedValue('')
    expect(await lookupTagOf(ACTIVE.owner, opts)).toBeNull()
  })

  it('soft-fails to null on read error', async () => {
    mockTagOf.mockRejectedValue(new Error('rpc down'))
    expect(await lookupTagOf(ACTIVE.owner, opts)).toBeNull()
  })
})
