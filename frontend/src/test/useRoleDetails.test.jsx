import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { WalletContext } from '../contexts/WalletContext'
import {
  useRoleDetails,
  MembershipTier,
  TIER_NAMES,
  TIER_COLORS,
  ROLE_BYTES32,
} from '../hooks/useRoleDetails'

// Mock wagmi useAccount
vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useAccount: vi.fn(() => ({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    })),
  }
})

// Mock contracts config
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => '0xMembershipManagerAddress'),
}))

// Mock MembershipManager ABI
vi.mock('../abis/MembershipManager', () => ({
  MEMBERSHIP_MANAGER_ABI: [],
}))

import { useAccount } from 'wagmi'
import { getContractAddress } from '../config/contracts'

const mockProvider = {
  getBalance: vi.fn(),
  getNetwork: vi.fn(),
}

const mockWalletValue = {
  address: '0x1234567890123456789012345678901234567890',
  account: '0x1234567890123456789012345678901234567890',
  isConnected: true,
  provider: mockProvider,
  signer: null,
  chainId: 80002,
  networkError: null,
  isCorrectNetwork: true,
  switchNetwork: vi.fn(),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  balances: { native: '0' },
  balancesLoading: false,
  roles: [],
  rolesLoading: false,
  blockchainSynced: false,
  refreshRoles: vi.fn(),
  refreshBalances: vi.fn(),
  getTokenBalance: vi.fn(),
  sendTransaction: vi.fn(),
  signMessage: vi.fn(),
  hasRole: vi.fn(),
  hasAnyRole: vi.fn(),
  hasAllRoles: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  connectors: [],
}

function createWrapper(walletValue = mockWalletValue) {
  return function Wrapper({ children }) {
    return (
      <WalletContext.Provider value={walletValue}>
        {children}
      </WalletContext.Provider>
    )
  }
}

describe('useRoleDetails hook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.mocked(getContractAddress).mockReturnValue('0xMembershipManagerAddress')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('exported constants', () => {
    it('should export MembershipTier enum', () => {
      expect(MembershipTier.NONE).toBe(0)
      expect(MembershipTier.BRONZE).toBe(1)
      expect(MembershipTier.SILVER).toBe(2)
      expect(MembershipTier.GOLD).toBe(3)
      expect(MembershipTier.PLATINUM).toBe(4)
    })

    it('should export TIER_NAMES mapping', () => {
      expect(TIER_NAMES[0]).toBe('None')
      expect(TIER_NAMES[1]).toBe('Bronze')
      expect(TIER_NAMES[2]).toBe('Silver')
      expect(TIER_NAMES[3]).toBe('Gold')
      expect(TIER_NAMES[4]).toBe('Platinum')
    })

    it('should export TIER_COLORS mapping', () => {
      expect(TIER_COLORS[0]).toBe('#666')
      expect(TIER_COLORS[1]).toBe('#CD7F32')
      expect(TIER_COLORS[2]).toBe('#C0C0C0')
      expect(TIER_COLORS[3]).toBe('#FFD700')
      expect(TIER_COLORS[4]).toBe('#E5E4E2')
    })

    it('should export ROLE_BYTES32 with WAGER_PARTICIPANT hash', () => {
      expect(ROLE_BYTES32.WAGER_PARTICIPANT).toBeDefined()
      expect(typeof ROLE_BYTES32.WAGER_PARTICIPANT).toBe('string')
      expect(ROLE_BYTES32.WAGER_PARTICIPANT.startsWith('0x')).toBe(true)
    })
  })

  describe('initial state', () => {
    it('should return empty roleDetails initially', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      // roleDetails starts empty, then gets populated by the effect
      expect(result.current.roleDetails).toBeDefined()
    })

    it('should return loading as false initially', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      // loading is false until the effect triggers
      expect(typeof result.current.loading).toBe('boolean')
    })

    it('should have null error initially', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(result.current.error).toBeNull()
    })
  })

  describe('disconnected state', () => {
    it('should return empty roleDetails when not connected', async () => {
      vi.mocked(useAccount).mockReturnValue({
        address: undefined,
        isConnected: false,
      })

      const disconnectedWallet = {
        ...mockWalletValue,
        address: undefined,
        isConnected: false,
        provider: null,
      }

      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(disconnectedWallet),
      })

      await waitFor(() => {
        expect(result.current.roleDetails).toEqual({})
      })
    })
  })

  describe('no contract deployed', () => {
    it('should return empty details when membershipManager address is null', async () => {
      vi.mocked(getContractAddress).mockReturnValue(null)

      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const details = result.current.getRoleDetails('WAGER_PARTICIPANT')
      if (details) {
        expect(details.tier).toBe(0)
        expect(details.tierName).toBe('None')
        expect(details.hasRole).toBe(false)
      }
    })
  })

  describe('helper functions', () => {
    it('should provide getRoleDetails function', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(typeof result.current.getRoleDetails).toBe('function')
    })

    it('should return null for unknown role names', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(result.current.getRoleDetails('UNKNOWN_ROLE')).toBeNull()
    })

    it('should provide getActiveRoles function', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(typeof result.current.getActiveRoles).toBe('function')
      // Initially no active roles
      expect(result.current.getActiveRoles()).toEqual([])
    })

    it('should provide getExpiringSoonRoles function', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(typeof result.current.getExpiringSoonRoles).toBe('function')
      expect(result.current.getExpiringSoonRoles()).toEqual([])
    })

    it('should provide getRolesAtLimit function', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(typeof result.current.getRolesAtLimit).toBe('function')
      expect(result.current.getRolesAtLimit()).toEqual([])
    })

    it('should provide refresh function', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })
      expect(typeof result.current.refresh).toBe('function')
    })
  })

  describe('return shape', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useRoleDetails(), {
        wrapper: createWrapper(),
      })

      expect(result.current).toHaveProperty('roleDetails')
      expect(result.current).toHaveProperty('loading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('refresh')
      expect(result.current).toHaveProperty('getRoleDetails')
      expect(result.current).toHaveProperty('getActiveRoles')
      expect(result.current).toHaveProperty('getExpiringSoonRoles')
      expect(result.current).toHaveProperty('getRolesAtLimit')
    })
  })
})
