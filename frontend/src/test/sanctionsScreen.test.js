import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screenWithContract, isClear, screenAddress } from '../utils/sanctionsScreen.js'

// Mock the contracts config so screenAddress's "not configured" path is deterministic.
// (The populated-address path is covered via screenWithContract with a fake contract,
//  avoiding any need to mock ethers — see frontend-test-gotchas.)
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(),
}))
import { getContractAddress } from '../config/contracts'

const ADDR = '0x1111111111111111111111111111111111111111'

describe('sanctionsScreen — screenWithContract (T022)', () => {
  it('returns allowed:true / available:true for a clean address', async () => {
    const guard = { isAllowed: vi.fn().mockResolvedValue(true) }
    expect(await screenWithContract(guard, ADDR)).toEqual({ allowed: true, available: true })
  })

  it('returns allowed:false / available:true for a sanctioned/denied address', async () => {
    const guard = { isAllowed: vi.fn().mockResolvedValue(false) }
    expect(await screenWithContract(guard, ADDR)).toEqual({ allowed: false, available: true })
  })

  it('fail-closed (available:false) when the read throws', async () => {
    const guard = { isAllowed: vi.fn().mockRejectedValue(new Error('rpc down')) }
    expect(await screenWithContract(guard, ADDR)).toEqual({ allowed: false, available: false })
  })
})

describe('sanctionsScreen — isClear', () => {
  it('is true only when available AND allowed', () => {
    expect(isClear({ available: true, allowed: true })).toBe(true)
  })
  it('is false when unavailable, even if allowed flag is set', () => {
    expect(isClear({ available: false, allowed: true })).toBe(false)
  })
  it('is false when available but not allowed, and for nullish input', () => {
    expect(isClear({ available: true, allowed: false })).toBe(false)
    expect(isClear(null)).toBe(false)
    expect(isClear(undefined)).toBe(false)
  })
})

describe('sanctionsScreen — screenAddress (not configured)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns available:false when no guard address is configured (fail-closed)', async () => {
    getContractAddress.mockReturnValue('')
    expect(await screenAddress(ADDR, {})).toEqual({ allowed: false, available: false })
  })
})
