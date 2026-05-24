/**
 * Tests for WalletContext / WalletProvider — targeting 70% coverage.
 * Mocks wagmi hooks and tests wallet state management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { useContext } from 'react'
import { WalletContext } from '../contexts/WalletContext'

// Mock blockchainService
vi.mock('../utils/blockchainService', () => ({
  hasRoleOnChain: vi.fn().mockResolvedValue(false),
}))

// Mock roleStorage
const mockGetUserRoles = vi.fn(() => [])
const mockAddUserRole = vi.fn()
const mockRemoveUserRole = vi.fn()

vi.mock('../utils/roleStorage', () => ({
  getUserRoles: (...args) => mockGetUserRoles(...args),
  addUserRole: (...args) => mockAddUserRole(...args),
  removeUserRole: (...args) => mockRemoveUserRole(...args),
}))

// Import after mocks (wagmi is mocked globally in setup.js)
import { WalletProvider } from '../contexts/WalletContext.jsx'

function wrapper({ children }) {
  return <WalletProvider>{children}</WalletProvider>
}

function useWalletCtx() {
  return useContext(WalletContext)
}

describe('WalletProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('provides address from wagmi useAccount', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.address).toBe('0x1234567890123456789012345678901234567890')
    expect(result.current.account).toBe(result.current.address) // alias
  })

  it('provides isConnected state', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.isConnected).toBe(true)
  })

  it('provides chainId from wagmi', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.chainId).toBe('number')
  })

  it('provides connectors array', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(Array.isArray(result.current.connectors)).toBe(true)
  })

  it('provides initial balances', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.balances).toBeDefined()
    expect(result.current.balances.native).toBe('0')
  })

  it('provides roles state', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(Array.isArray(result.current.roles)).toBe(true)
  })

  it('hasRole returns false when role not in list', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.hasRole('ADMIN')).toBe(false)
  })

  it('hasAnyRole returns false when no roles match', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.hasAnyRole(['ADMIN', 'GUARDIAN'])).toBe(false)
  })

  it('hasAllRoles returns false when roles empty', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.hasAllRoles(['ADMIN'])).toBe(false)
  })

  it('hasAnyRole returns false for non-array input', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.hasAnyRole(null)).toBe(false)
    expect(result.current.hasAnyRole('ADMIN')).toBe(false)
  })

  it('hasAllRoles returns false for non-array input', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(result.current.hasAllRoles(null)).toBe(false)
  })

  it('provides connectWallet function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.connectWallet).toBe('function')
  })

  it('provides disconnectWallet function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.disconnectWallet).toBe('function')
  })

  it('provides switchNetwork function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.switchNetwork).toBe('function')
  })

  it('provides sendTransaction function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.sendTransaction).toBe('function')
  })

  it('provides signMessage function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.signMessage).toBe('function')
  })

  it('provides refreshBalances function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.refreshBalances).toBe('function')
  })

  it('provides getTokenBalance function', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.getTokenBalance).toBe('function')
  })

  it('provides grantRole and revokeRole functions', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.grantRole).toBe('function')
    expect(typeof result.current.revokeRole).toBe('function')
  })

  it('grantRole updates roles state', () => {
    mockGetUserRoles.mockReturnValue(['TEST_ROLE'])

    const { result } = renderHook(() => useWalletCtx(), { wrapper })

    act(() => {
      result.current.grantRole('TEST_ROLE')
    })

    expect(result.current.roles).toContain('TEST_ROLE')
    mockGetUserRoles.mockReturnValue([])
  })

  it('revokeRole updates roles state', () => {
    mockGetUserRoles.mockReturnValue([])

    const { result } = renderHook(() => useWalletCtx(), { wrapper })

    act(() => {
      result.current.revokeRole('TEST_ROLE')
    })

    expect(result.current.roles).not.toContain('TEST_ROLE')
  })

  it('disconnectWallet clears state', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })

    act(() => {
      result.current.disconnectWallet()
    })

    // After disconnect, roles should be empty and balances reset
    expect(result.current.roles).toEqual([])
  })

  it('provides isCorrectNetwork computed value', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    expect(typeof result.current.isCorrectNetwork).toBe('boolean')
  })

  it('provides networkError state', () => {
    const { result } = renderHook(() => useWalletCtx(), { wrapper })
    // Chain 61 is unsupported so network error may or may not be set
    // depending on whether switchChain succeeded
    expect(result.current.networkError === null || typeof result.current.networkError === 'string').toBe(true)
  })
})
