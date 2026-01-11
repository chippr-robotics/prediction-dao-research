import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { WalletContext } from '../contexts'
import { useRoles } from '../hooks/useRoles'

describe('useRoles hook', () => {
  it('should return role context value when provider exists', () => {
    const mockWalletValue = {
      roles: ['admin', 'user'],
      rolesLoading: false,
      blockchainSynced: true,
      refreshRoles: vi.fn(),
      hasRole: vi.fn((role) => role === 'admin'),
      hasAnyRole: vi.fn(),
      hasAllRoles: vi.fn(),
      grantRole: vi.fn(),
      revokeRole: vi.fn()
    }

    const wrapper = ({ children }) => (
      <WalletContext.Provider value={mockWalletValue}>
        {children}
      </WalletContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    expect(result.current.roles).toEqual(['admin', 'user'])
    expect(result.current.isLoading).toBe(false)
  })

  it('should throw error when used outside WalletProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useRoles())
    }).toThrow('useRoles must be used within a WalletProvider')

    consoleError.mockRestore()
  })

  it('should access role functions from context', () => {
    const mockHasRole = vi.fn((role) => role === 'admin')
    const mockGrantRole = vi.fn()

    const mockWalletValue = {
      roles: ['admin'],
      rolesLoading: false,
      blockchainSynced: true,
      refreshRoles: vi.fn(),
      hasRole: mockHasRole,
      hasAnyRole: vi.fn(),
      hasAllRoles: vi.fn(),
      grantRole: mockGrantRole,
      revokeRole: vi.fn()
    }

    const wrapper = ({ children }) => (
      <WalletContext.Provider value={mockWalletValue}>
        {children}
      </WalletContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    // Test hasRole function
    expect(result.current.hasRole('admin')).toBe(true)
    expect(mockHasRole).toHaveBeenCalledWith('admin')

    // Test grantRole function
    result.current.grantRole('moderator')
    expect(mockGrantRole).toHaveBeenCalledWith('moderator')
  })

  it('should handle multiple roles', () => {
    const mockWalletValue = {
      roles: ['admin', 'moderator', 'user'],
      rolesLoading: false,
      blockchainSynced: true,
      refreshRoles: vi.fn(),
      hasRole: vi.fn((role) => mockWalletValue.roles.includes(role)),
      hasAnyRole: vi.fn(),
      hasAllRoles: vi.fn(),
      grantRole: vi.fn(),
      revokeRole: vi.fn()
    }

    const wrapper = ({ children }) => (
      <WalletContext.Provider value={mockWalletValue}>
        {children}
      </WalletContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    expect(result.current.roles).toHaveLength(3)
    expect(result.current.hasRole('admin')).toBe(true)
    expect(result.current.hasRole('moderator')).toBe(true)
    expect(result.current.hasRole('user')).toBe(true)
    expect(result.current.hasRole('nonexistent')).toBe(false)
  })

  it('should include ROLES constants', () => {
    const mockWalletValue = {
      roles: [],
      rolesLoading: false,
      blockchainSynced: false,
      refreshRoles: vi.fn(),
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
      hasAllRoles: vi.fn(),
      grantRole: vi.fn(),
      revokeRole: vi.fn()
    }

    const wrapper = ({ children }) => (
      <WalletContext.Provider value={mockWalletValue}>
        {children}
      </WalletContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    // Should have ROLES constants available
    expect(result.current.ROLES).toBeDefined()
    expect(result.current.ROLES.MARKET_MAKER).toBe('MARKET_MAKER')
    expect(result.current.ROLES.ADMIN).toBe('ADMIN')
  })
})
