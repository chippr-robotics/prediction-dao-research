import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// Mock the hooks used by RoleGate
const mockUseWallet = vi.fn()
const mockUseWalletRoles = vi.fn()

vi.mock('../hooks', () => ({
  useWallet: (...args) => mockUseWallet(...args),
  useWalletRoles: (...args) => mockUseWalletRoles(...args),
}))

vi.mock('../contexts/RoleContext', () => ({
  ROLE_INFO: {
    WAGER_PARTICIPANT: { name: 'Wager Participant', description: 'Create wagers' },
    ADMIN: { name: 'Administrator', description: 'Full access' },
  },
}))

import RoleGate from '../components/ui/RoleGate'

describe('RoleGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseWalletRoles.mockReturnValue({
      hasAnyRole: vi.fn(() => false),
      hasAllRoles: vi.fn(() => false),
    })
  })

  it('should render children when no roles required', () => {
    render(
      <RoleGate>
        <p>Open content</p>
      </RoleGate>
    )
    expect(screen.getByText('Open content')).toBeInTheDocument()
  })

  it('should show connection required message when not connected', () => {
    mockUseWallet.mockReturnValue({ isConnected: false })
    render(
      <RoleGate requiredRoles={['ADMIN']}>
        <p>Protected</p>
      </RoleGate>
    )
    expect(screen.getByText('Wallet Connection Required')).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('should show custom fallback when not connected and fallback provided', () => {
    mockUseWallet.mockReturnValue({ isConnected: false })
    render(
      <RoleGate requiredRoles={['ADMIN']} fallback={<p>Please connect</p>}>
        <p>Protected</p>
      </RoleGate>
    )
    expect(screen.getByText('Please connect')).toBeInTheDocument()
  })

  it('should render children when user has any required role', () => {
    mockUseWalletRoles.mockReturnValue({
      hasAnyRole: vi.fn(() => true),
      hasAllRoles: vi.fn(() => false),
    })
    render(
      <RoleGate requiredRoles={['WAGER_PARTICIPANT']}>
        <p>Premium content</p>
      </RoleGate>
    )
    expect(screen.getByText('Premium content')).toBeInTheDocument()
  })

  it('should render children when user has all required roles', () => {
    mockUseWalletRoles.mockReturnValue({
      hasAnyRole: vi.fn(() => false),
      hasAllRoles: vi.fn(() => true),
    })
    render(
      <RoleGate requiredAllRoles={['ADMIN', 'WAGER_PARTICIPANT']}>
        <p>Admin content</p>
      </RoleGate>
    )
    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })

  it('should show premium feature message when user lacks roles', () => {
    render(
      <RoleGate requiredRoles={['WAGER_PARTICIPANT']}>
        <p>Hidden</p>
      </RoleGate>
    )
    expect(screen.getByText('Premium Feature')).toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('should display required role names and descriptions', () => {
    render(
      <RoleGate requiredRoles={['WAGER_PARTICIPANT']}>
        <p>Hidden</p>
      </RoleGate>
    )
    expect(screen.getByText('Wager Participant')).toBeInTheDocument()
    expect(screen.getByText('Create wagers')).toBeInTheDocument()
  })

  it('should show purchase button when showPurchase is true', () => {
    render(
      <RoleGate requiredRoles={['WAGER_PARTICIPANT']} showPurchase={true}>
        <p>Hidden</p>
      </RoleGate>
    )
    expect(screen.getByText('Purchase Access')).toBeInTheDocument()
  })

  it('should not show purchase button when showPurchase is false', () => {
    render(
      <RoleGate requiredRoles={['WAGER_PARTICIPANT']} showPurchase={false}>
        <p>Hidden</p>
      </RoleGate>
    )
    expect(screen.queryByText('Purchase Access')).not.toBeInTheDocument()
  })

  it('should call onPurchase when purchase button is clicked', () => {
    const onPurchase = vi.fn()
    render(
      <RoleGate requiredRoles={['WAGER_PARTICIPANT']} onPurchase={onPurchase}>
        <p>Hidden</p>
      </RoleGate>
    )
    fireEvent.click(screen.getByText('Purchase Access'))
    expect(onPurchase).toHaveBeenCalled()
  })

  it('should show fallback when user lacks roles and fallback provided', () => {
    render(
      <RoleGate requiredRoles={['ADMIN']} fallback={<p>No access</p>}>
        <p>Secret</p>
      </RoleGate>
    )
    expect(screen.getByText('No access')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })

  it('should prefer requiredAllRoles over requiredRoles when both provided', () => {
    const hasAllRoles = vi.fn(() => true)
    const hasAnyRole = vi.fn(() => false)
    mockUseWalletRoles.mockReturnValue({ hasAnyRole, hasAllRoles })

    render(
      <RoleGate requiredAllRoles={['ADMIN']} requiredRoles={['WAGER_PARTICIPANT']}>
        <p>Content</p>
      </RoleGate>
    )
    expect(hasAllRoles).toHaveBeenCalledWith(['ADMIN'])
    expect(hasAnyRole).not.toHaveBeenCalled()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('should handle unknown roles gracefully in the role list', () => {
    render(
      <RoleGate requiredRoles={['UNKNOWN_ROLE']}>
        <p>Hidden</p>
      </RoleGate>
    )
    // Should show the role name as-is with 'Premium access' description
    expect(screen.getByText('UNKNOWN_ROLE')).toBeInTheDocument()
    expect(screen.getByText('Premium access')).toBeInTheDocument()
  })
})
