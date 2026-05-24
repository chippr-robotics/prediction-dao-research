import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { WalletContext } from '../contexts/WalletContext'
import {
  useWallet,
  useWalletAddress,
  useWalletBalances,
  useWalletTransactions,
  useWalletRoles,
  useWalletNetwork,
  useWalletConnection,
} from '../hooks/useWalletManagement'

const mockWalletValue = {
  address: '0x1234567890123456789012345678901234567890',
  account: '0x1234567890123456789012345678901234567890',
  isConnected: true,
  chainId: 80002,
  connectors: [{ id: 'injected', name: 'MetaMask' }],
  provider: { getBalance: vi.fn() },
  signer: { signMessage: vi.fn(), sendTransaction: vi.fn() },
  networkError: null,
  isCorrectNetwork: true,
  balances: { native: '1.5', wnative: '0', tokens: {} },
  balancesLoading: false,
  roles: ['WAGER_PARTICIPANT'],
  rolesLoading: false,
  blockchainSynced: true,
  refreshRoles: vi.fn(),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  switchNetwork: vi.fn(),
  sendTransaction: vi.fn(),
  signMessage: vi.fn(),
  refreshBalances: vi.fn(),
  getTokenBalance: vi.fn(),
  hasRole: vi.fn((role) => role === 'WAGER_PARTICIPANT'),
  hasAnyRole: vi.fn((roles) => roles.includes('WAGER_PARTICIPANT')),
  hasAllRoles: vi.fn((roles) => roles.every(r => r === 'WAGER_PARTICIPANT')),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}

function createWrapper(value = mockWalletValue) {
  return function Wrapper({ children }) {
    return (
      <WalletContext.Provider value={value}>
        {children}
      </WalletContext.Provider>
    )
  }
}

describe('useWallet hook (extended)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw when used outside WalletProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useWallet())
    }).toThrow('useWallet must be used within a WalletProvider')
    consoleError.mockRestore()
  })

  it('should return the full wallet context', () => {
    const { result } = renderHook(() => useWallet(), {
      wrapper: createWrapper(),
    })
    expect(result.current.address).toBe('0x1234567890123456789012345678901234567890')
    expect(result.current.isConnected).toBe(true)
    expect(result.current.chainId).toBe(80002)
  })

  it('should reflect disconnected state', () => {
    const disconnected = {
      ...mockWalletValue,
      address: null,
      account: null,
      isConnected: false,
      provider: null,
      signer: null,
      balances: { native: '0', wnative: '0', tokens: {} },
      roles: [],
    }
    const { result } = renderHook(() => useWallet(), {
      wrapper: createWrapper(disconnected),
    })
    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBeNull()
    expect(result.current.roles).toEqual([])
  })
})

describe('useWalletAddress hook', () => {
  it('should return address and connection state', () => {
    const { result } = renderHook(() => useWalletAddress(), {
      wrapper: createWrapper(),
    })
    expect(result.current.address).toBe('0x1234567890123456789012345678901234567890')
    expect(result.current.account).toBe('0x1234567890123456789012345678901234567890')
    expect(result.current.isConnected).toBe(true)
  })

  it('should reflect disconnected state', () => {
    const disconnected = {
      ...mockWalletValue,
      address: null,
      account: null,
      isConnected: false,
    }
    const { result } = renderHook(() => useWalletAddress(), {
      wrapper: createWrapper(disconnected),
    })
    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it('should only expose address-related properties', () => {
    const { result } = renderHook(() => useWalletAddress(), {
      wrapper: createWrapper(),
    })
    expect(Object.keys(result.current)).toEqual(['address', 'account', 'isConnected'])
  })
})

describe('useWalletBalances hook', () => {
  it('should return balance state and functions', () => {
    const { result } = renderHook(() => useWalletBalances(), {
      wrapper: createWrapper(),
    })
    expect(result.current.balances).toEqual({ native: '1.5', wnative: '0', tokens: {} })
    expect(result.current.balancesLoading).toBe(false)
    expect(typeof result.current.refreshBalances).toBe('function')
    expect(typeof result.current.getTokenBalance).toBe('function')
  })

  it('should call refreshBalances', () => {
    const { result } = renderHook(() => useWalletBalances(), {
      wrapper: createWrapper(),
    })
    result.current.refreshBalances()
    expect(mockWalletValue.refreshBalances).toHaveBeenCalled()
  })

  it('should call getTokenBalance', () => {
    const { result } = renderHook(() => useWalletBalances(), {
      wrapper: createWrapper(),
    })
    result.current.getTokenBalance('0xTokenAddress')
    expect(mockWalletValue.getTokenBalance).toHaveBeenCalledWith('0xTokenAddress')
  })

  it('should reflect loading state', () => {
    const loading = { ...mockWalletValue, balancesLoading: true }
    const { result } = renderHook(() => useWalletBalances(), {
      wrapper: createWrapper(loading),
    })
    expect(result.current.balancesLoading).toBe(true)
  })
})

describe('useWalletTransactions hook', () => {
  it('should return transaction methods', () => {
    const { result } = renderHook(() => useWalletTransactions(), {
      wrapper: createWrapper(),
    })
    expect(result.current.provider).toBeDefined()
    expect(result.current.signer).toBeDefined()
    expect(typeof result.current.sendTransaction).toBe('function')
    expect(typeof result.current.signMessage).toBe('function')
  })

  it('should call sendTransaction', () => {
    const { result } = renderHook(() => useWalletTransactions(), {
      wrapper: createWrapper(),
    })
    const txReq = { to: '0xabc', value: 100n }
    result.current.sendTransaction(txReq)
    expect(mockWalletValue.sendTransaction).toHaveBeenCalledWith(txReq)
  })

  it('should call signMessage', () => {
    const { result } = renderHook(() => useWalletTransactions(), {
      wrapper: createWrapper(),
    })
    result.current.signMessage('hello')
    expect(mockWalletValue.signMessage).toHaveBeenCalledWith('hello')
  })

  it('should return null signer when disconnected', () => {
    const disconnected = { ...mockWalletValue, signer: null, provider: null }
    const { result } = renderHook(() => useWalletTransactions(), {
      wrapper: createWrapper(disconnected),
    })
    expect(result.current.signer).toBeNull()
    expect(result.current.provider).toBeNull()
  })
})

describe('useWalletRoles hook', () => {
  it('should return role state and management functions', () => {
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(),
    })
    expect(result.current.roles).toEqual(['WAGER_PARTICIPANT'])
    expect(result.current.rolesLoading).toBe(false)
    expect(result.current.blockchainSynced).toBe(true)
    expect(typeof result.current.refreshRoles).toBe('function')
    expect(typeof result.current.hasRole).toBe('function')
    expect(typeof result.current.hasAnyRole).toBe('function')
    expect(typeof result.current.hasAllRoles).toBe('function')
    expect(typeof result.current.grantRole).toBe('function')
    expect(typeof result.current.revokeRole).toBe('function')
  })

  it('should check role presence via hasRole', () => {
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(),
    })
    expect(result.current.hasRole('WAGER_PARTICIPANT')).toBe(true)
    expect(result.current.hasRole('ADMIN')).toBe(false)
  })

  it('should check hasAnyRole', () => {
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(),
    })
    expect(result.current.hasAnyRole(['ADMIN', 'WAGER_PARTICIPANT'])).toBe(true)
    expect(result.current.hasAnyRole(['ADMIN', 'ORACLE'])).toBe(false)
  })

  it('should call grantRole', () => {
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(),
    })
    result.current.grantRole('ORACLE')
    expect(mockWalletValue.grantRole).toHaveBeenCalledWith('ORACLE')
  })

  it('should call revokeRole', () => {
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(),
    })
    result.current.revokeRole('WAGER_PARTICIPANT')
    expect(mockWalletValue.revokeRole).toHaveBeenCalledWith('WAGER_PARTICIPANT')
  })

  it('should call refreshRoles', () => {
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(),
    })
    result.current.refreshRoles()
    expect(mockWalletValue.refreshRoles).toHaveBeenCalled()
  })

  it('should reflect loading state', () => {
    const loading = { ...mockWalletValue, rolesLoading: true, blockchainSynced: false }
    const { result } = renderHook(() => useWalletRoles(), {
      wrapper: createWrapper(loading),
    })
    expect(result.current.rolesLoading).toBe(true)
    expect(result.current.blockchainSynced).toBe(false)
  })
})

describe('useWalletNetwork hook', () => {
  it('should return network state', () => {
    const { result } = renderHook(() => useWalletNetwork(), {
      wrapper: createWrapper(),
    })
    expect(result.current.chainId).toBe(80002)
    expect(result.current.isCorrectNetwork).toBe(true)
    expect(result.current.networkError).toBeNull()
    expect(typeof result.current.switchNetwork).toBe('function')
  })

  it('should reflect network error', () => {
    const errorState = {
      ...mockWalletValue,
      networkError: 'Please switch to Polygon Amoy',
      isCorrectNetwork: false,
    }
    const { result } = renderHook(() => useWalletNetwork(), {
      wrapper: createWrapper(errorState),
    })
    expect(result.current.networkError).toBe('Please switch to Polygon Amoy')
    expect(result.current.isCorrectNetwork).toBe(false)
  })

  it('should call switchNetwork', () => {
    const { result } = renderHook(() => useWalletNetwork(), {
      wrapper: createWrapper(),
    })
    result.current.switchNetwork()
    expect(mockWalletValue.switchNetwork).toHaveBeenCalled()
  })
})

describe('useWalletConnection hook', () => {
  it('should return connection state and functions', () => {
    const { result } = renderHook(() => useWalletConnection(), {
      wrapper: createWrapper(),
    })
    expect(result.current.isConnected).toBe(true)
    expect(typeof result.current.connectWallet).toBe('function')
    expect(typeof result.current.disconnectWallet).toBe('function')
    expect(result.current.connectors).toEqual([{ id: 'injected', name: 'MetaMask' }])
  })

  it('should call connectWallet', () => {
    const { result } = renderHook(() => useWalletConnection(), {
      wrapper: createWrapper(),
    })
    result.current.connectWallet()
    expect(mockWalletValue.connectWallet).toHaveBeenCalled()
  })

  it('should call disconnectWallet', () => {
    const { result } = renderHook(() => useWalletConnection(), {
      wrapper: createWrapper(),
    })
    result.current.disconnectWallet()
    expect(mockWalletValue.disconnectWallet).toHaveBeenCalled()
  })

  it('should reflect disconnected state', () => {
    const disconnected = {
      ...mockWalletValue,
      isConnected: false,
      connectors: [],
    }
    const { result } = renderHook(() => useWalletConnection(), {
      wrapper: createWrapper(disconnected),
    })
    expect(result.current.isConnected).toBe(false)
    expect(result.current.connectors).toEqual([])
  })
})
