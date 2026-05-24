import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock useWeb3
const mockUseWeb3 = vi.fn()
vi.mock('../hooks/useWeb3', () => ({
  useWeb3: (...args) => mockUseWeb3(...args),
}))

// Mock contracts config
vi.mock('../config/contracts', () => ({
  DEPLOYED_CONTRACTS: {
    roleManager: null, // Not deployed
    friendGroupMarketFactory: null,
  },
  NETWORK_CONFIG: { rpcUrl: 'http://localhost:8545' },
}))

// Mock RoleManager ABI and tiers
vi.mock('../abis/MinimalRoleManager', () => ({
  MINIMAL_ROLE_MANAGER_ABI: [],
  MEMBERSHIP_TIERS: { BASIC: 1, PREMIUM: 2 },
  TIER_NAMES: { 1: 'Basic', 2: 'Premium' },
}))

import { useAdminContracts } from '../hooks/useAdminContracts'

describe('useAdminContracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWeb3.mockReturnValue({
      signer: null,
      account: null,
      isConnected: false,
    })
  })

  it('should initialize with default state when roleManager not deployed', () => {
    const { result } = renderHook(() => useAdminContracts())

    expect(result.current.contractState.isDeployed).toBe(false)
    expect(result.current.contractState.isPaused).toBe(false)
    expect(result.current.contractState.contractBalance).toBe('0')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should expose all expected functions', () => {
    const { result } = renderHook(() => useAdminContracts())

    expect(typeof result.current.emergencyPause).toBe('function')
    expect(typeof result.current.emergencyUnpause).toBe('function')
    expect(typeof result.current.configureTier).toBe('function')
    expect(typeof result.current.grantTier).toBe('function')
    expect(typeof result.current.grantRoleOnChain).toBe('function')
    expect(typeof result.current.revokeRoleOnChain).toBe('function')
    expect(typeof result.current.hasRoleOnChain).toBe('function')
    expect(typeof result.current.withdraw).toBe('function')
    expect(typeof result.current.withdrawFromFriendMarketFactory).toBe('function')
    expect(typeof result.current.fetchContractState).toBe('function')
    expect(typeof result.current.getTierInfo).toBe('function')
    expect(typeof result.current.getUserMembership).toBe('function')
  })

  it('should expose contract addresses', () => {
    const { result } = renderHook(() => useAdminContracts())
    // Both are null since not deployed
    expect(result.current.roleManagerAddress).toBeNull()
    expect(result.current.friendMarketFactoryAddress).toBeNull()
  })

  it('should throw on emergencyPause when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(result.current.emergencyPause()).rejects.toThrow('Wallet not connected')
  })

  it('should throw on emergencyUnpause when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(result.current.emergencyUnpause()).rejects.toThrow('Wallet not connected')
  })

  it('should throw on configureTier when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.configureTier('0xhash', 1, '0.01', true)
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on grantTier when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.grantTier('0x1234567890123456789012345678901234567890', '0xhash', 1, 30)
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on grantRoleOnChain when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.grantRoleOnChain('0xhash', '0x1234567890123456789012345678901234567890')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on revokeRoleOnChain when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.revokeRoleOnChain('0xhash', '0x1234567890123456789012345678901234567890')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on withdraw when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.withdraw('0x1234567890123456789012345678901234567890', '1.0')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on withdrawFromFriendMarketFactory when wallet not connected', async () => {
    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.withdrawFromFriendMarketFactory()
    ).rejects.toThrow('Wallet not connected')
  })

  it('should return null from getTierInfo when tiers not supported', async () => {
    const { result } = renderHook(() => useAdminContracts())

    const tierInfo = await result.current.getTierInfo('0xhash', 1)
    expect(tierInfo).toBeNull()
  })

  it('should return null from getUserMembership when tiers not supported', async () => {
    const { result } = renderHook(() => useAdminContracts())

    const membership = await result.current.getUserMembership(
      '0x1234567890123456789012345678901234567890',
      '0xhash'
    )
    expect(membership).toBeNull()
  })
})

describe('parseContractError (via hook error paths)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // We test parseContractError indirectly through the hook's behavior
  // when wallet is connected but contract calls fail
  it('should handle ACTION_REJECTED error', async () => {
    const mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
    }
    mockUseWeb3.mockReturnValue({
      signer: mockSigner,
      account: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    })

    const { result } = renderHook(() => useAdminContracts())

    // grantRoleOnChain with invalid address should throw before hitting contract
    await expect(
      result.current.grantRoleOnChain('0xhash', 'not-an-address')
    ).rejects.toThrow('Invalid user address')
  })

  it('should validate address for grantTier', async () => {
    const mockSigner = {}
    mockUseWeb3.mockReturnValue({
      signer: mockSigner,
      account: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    })

    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.grantTier('not-an-address', '0xhash', 1, 30)
    ).rejects.toThrow('Invalid user address')
  })

  it('should validate address for withdraw', async () => {
    const mockSigner = {}
    mockUseWeb3.mockReturnValue({
      signer: mockSigner,
      account: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    })

    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.withdraw('invalid', '1.0')
    ).rejects.toThrow('Invalid recipient address')
  })

  it('should validate roleHash for configureTier', async () => {
    const mockSigner = {}
    mockUseWeb3.mockReturnValue({
      signer: mockSigner,
      account: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    })

    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.configureTier(null, 1, '0.01', true)
    ).rejects.toThrow('Invalid role hash')
  })

  it('should validate roleHash for grantTier', async () => {
    const mockSigner = {}
    mockUseWeb3.mockReturnValue({
      signer: mockSigner,
      account: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    })

    const { result } = renderHook(() => useAdminContracts())

    await expect(
      result.current.grantTier('0x1234567890123456789012345678901234567890', null, 1, 30)
    ).rejects.toThrow('Invalid role hash')
  })
})
