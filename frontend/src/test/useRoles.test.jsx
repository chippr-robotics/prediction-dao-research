import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { RoleContext } from '../contexts/RoleContext'
import { useRoles } from '../hooks/useRoles'

describe('useRoles hook', () => {
  it('should return role context value when provider exists', () => {
    const mockRoleValue = {
      roles: ['admin', 'user'],
      hasRole: vi.fn((role) => role === 'admin'),
      purchaseRole: vi.fn(),
      loading: false
    }

    const wrapper = ({ children }) => (
      <RoleContext.Provider value={mockRoleValue}>
        {children}
      </RoleContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    expect(result.current).toEqual(mockRoleValue)
    expect(result.current.roles).toEqual(['admin', 'user'])
    expect(result.current.loading).toBe(false)
  })

  it('should throw error when used outside RoleProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useRoles())
    }).toThrow('useRoles must be used within a RoleProvider')

    consoleError.mockRestore()
  })

  it('should access role functions from context', () => {
    const mockHasRole = vi.fn((role) => role === 'admin')
    const mockPurchaseRole = vi.fn()
    
    const mockRoleValue = {
      roles: ['admin'],
      hasRole: mockHasRole,
      purchaseRole: mockPurchaseRole,
      loading: false
    }

    const wrapper = ({ children }) => (
      <RoleContext.Provider value={mockRoleValue}>
        {children}
      </RoleContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    // Test hasRole function
    expect(result.current.hasRole('admin')).toBe(true)
    expect(mockHasRole).toHaveBeenCalledWith('admin')

    // Test purchaseRole function
    result.current.purchaseRole('moderator')
    expect(mockPurchaseRole).toHaveBeenCalledWith('moderator')
  })

  it('should handle multiple roles', () => {
    const mockRoleValue = {
      roles: ['admin', 'moderator', 'user'],
      hasRole: vi.fn((role) => mockRoleValue.roles.includes(role)),
      purchaseRole: vi.fn(),
      loading: false
    }

    const wrapper = ({ children }) => (
      <RoleContext.Provider value={mockRoleValue}>
        {children}
      </RoleContext.Provider>
    )

    const { result } = renderHook(() => useRoles(), { wrapper })

    expect(result.current.roles).toHaveLength(3)
    expect(result.current.hasRole('admin')).toBe(true)
    expect(result.current.hasRole('moderator')).toBe(true)
    expect(result.current.hasRole('user')).toBe(true)
    expect(result.current.hasRole('nonexistent')).toBe(false)
  })
})
