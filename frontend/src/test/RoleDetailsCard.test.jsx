import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the useRoleDetails hook
vi.mock('../hooks/useRoleDetails', () => ({
  TIER_NAMES: {
    1: 'Bronze',
    2: 'Silver',
    3: 'Gold',
    4: 'Platinum',
  },
}))

import { RoleDetailsCard, RoleDetailsSection } from '../components/wallet/RoleDetailsCard'

const baseRole = {
  roleName: 'WAGER_PARTICIPANT',
  tier: 1,
  tierName: 'Bronze',
  tierColor: '#cd7f32',
  isExpired: false,
  daysRemaining: 25,
  expirationDate: new Date('2026-07-01'),
  wagersCreated: 3,
  wagerLimit: 10,
  canCreateWager: true,
  hasRole: true,
}

describe('RoleDetailsCard', () => {
  it('renders null when role is null', () => {
    const { container } = render(<RoleDetailsCard role={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders full card with role details', () => {
    render(<RoleDetailsCard role={baseRole} />)
    expect(screen.getByText('Wager Participant')).toBeInTheDocument()
    expect(screen.getByText('Bronze')).toBeInTheDocument()
    expect(screen.getByText(/Create and accept/)).toBeInTheDocument()
  })

  it('shows expiration date', () => {
    render(<RoleDetailsCard role={baseRole} />)
    expect(screen.getByText('25 days remaining')).toBeInTheDocument()
  })

  it('shows wager usage bar', () => {
    render(<RoleDetailsCard role={baseRole} />)
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('shows upgrade button for tier < 4', () => {
    const onUpgrade = vi.fn()
    render(<RoleDetailsCard role={baseRole} onUpgrade={onUpgrade} />)
    const upgradeBtn = screen.getByText('Upgrade to Silver')
    expect(upgradeBtn).toBeInTheDocument()
    fireEvent.click(upgradeBtn)
    expect(onUpgrade).toHaveBeenCalledWith('WAGER_PARTICIPANT')
  })

  it('does not show upgrade button for Platinum tier', () => {
    const role = { ...baseRole, tier: 4, tierName: 'Platinum' }
    render(<RoleDetailsCard role={role} onUpgrade={vi.fn()} />)
    expect(screen.queryByText(/Upgrade to/)).not.toBeInTheDocument()
  })

  it('shows expired alert', () => {
    const role = { ...baseRole, isExpired: true, daysRemaining: 0 }
    render(<RoleDetailsCard role={role} />)
    expect(screen.getByText(/has expired/)).toBeInTheDocument()
  })

  it('shows at-limit alert', () => {
    const role = { ...baseRole, canCreateWager: false, wagersCreated: 10 }
    render(<RoleDetailsCard role={role} />)
    expect(screen.getByText(/monthly limit/)).toBeInTheDocument()
  })

  it('shows expiring-soon alert', () => {
    const role = { ...baseRole, daysRemaining: 5 }
    render(<RoleDetailsCard role={role} />)
    expect(screen.getByText(/expires in 5 days/)).toBeInTheDocument()
  })

  it('shows renew button when expired', () => {
    const onExtend = vi.fn()
    const role = { ...baseRole, isExpired: true, daysRemaining: 0 }
    render(<RoleDetailsCard role={role} onExtend={onExtend} />)
    const renewBtn = screen.getByText('Renew Access')
    expect(renewBtn).toBeInTheDocument()
    fireEvent.click(renewBtn)
    expect(onExtend).toHaveBeenCalledWith('WAGER_PARTICIPANT')
  })

  it('shows extend button when expiring soon', () => {
    const onExtend = vi.fn()
    const role = { ...baseRole, daysRemaining: 5 }
    render(<RoleDetailsCard role={role} onExtend={onExtend} />)
    const extendBtn = screen.getByText('Extend Membership')
    expect(extendBtn).toBeInTheDocument()
    fireEvent.click(extendBtn)
    expect(onExtend).toHaveBeenCalledWith('WAGER_PARTICIPANT')
  })

  it('shows frozen state', () => {
    render(
      <RoleDetailsCard
        role={baseRole}
        isFrozen={true}
        freezeReason="Violation of terms"
      />
    )
    expect(screen.getByText(/frozen by a platform moderator/)).toBeInTheDocument()
    expect(screen.getByText(/Violation of terms/)).toBeInTheDocument()
  })

  it('hides upgrade/extend buttons when frozen', () => {
    const role = { ...baseRole, isExpired: true, daysRemaining: 0 }
    render(
      <RoleDetailsCard
        role={role}
        onUpgrade={vi.fn()}
        onExtend={vi.fn()}
        isFrozen={true}
      />
    )
    expect(screen.queryByText(/Upgrade/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Renew/)).not.toBeInTheDocument()
  })

  // ===== Compact mode =====
  it('renders compact card', () => {
    render(<RoleDetailsCard role={baseRole} compact />)
    expect(screen.getByText('Wager Participant')).toBeInTheDocument()
    expect(screen.getByText('Bronze')).toBeInTheDocument()
  })

  it('expands compact card on click', () => {
    render(<RoleDetailsCard role={baseRole} compact />)
    const card = screen.getByText('Wager Participant').closest('.role-card-compact')
    fireEvent.click(card)
    // After expanding, should show details like expiration
    expect(screen.getByText(/Expires/)).toBeInTheDocument()
  })

  it('shows status badge for expired in compact mode', () => {
    const role = { ...baseRole, isExpired: true, daysRemaining: 0 }
    render(<RoleDetailsCard role={role} compact />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('shows status badge for at-limit in compact mode', () => {
    const role = { ...baseRole, canCreateWager: false, wagersCreated: 10 }
    render(<RoleDetailsCard role={role} compact />)
    expect(screen.getByText('At Limit')).toBeInTheDocument()
  })

  it('shows days-left badge for expiring-soon in compact mode', () => {
    const role = { ...baseRole, daysRemaining: 3 }
    render(<RoleDetailsCard role={role} compact />)
    expect(screen.getByText('3d left')).toBeInTheDocument()
  })

  it('shows Frozen badge in compact mode', () => {
    render(<RoleDetailsCard role={baseRole} compact isFrozen={true} />)
    expect(screen.getByText('Frozen')).toBeInTheDocument()
  })
})

describe('RoleDetailsSection', () => {
  it('shows loading state', () => {
    render(<RoleDetailsSection roleDetails={{}} loading={true} />)
    expect(screen.getByText(/Loading roles/)).toBeInTheDocument()
  })

  it('shows empty state with purchase button', () => {
    const onPurchase = vi.fn()
    render(
      <RoleDetailsSection
        roleDetails={{}}
        loading={false}
        onPurchase={onPurchase}
      />
    )
    expect(screen.getByText('No active membership')).toBeInTheDocument()
    const purchaseBtn = screen.getByText('Get Wager Access')
    fireEvent.click(purchaseBtn)
    expect(onPurchase).toHaveBeenCalled()
  })

  it('renders active roles', () => {
    const roleDetails = {
      WAGER_PARTICIPANT: baseRole,
    }
    render(
      <RoleDetailsSection
        roleDetails={roleDetails}
        loading={false}
        onUpgrade={vi.fn()}
        onExtend={vi.fn()}
      />
    )
    expect(screen.getByText('Wager Participant')).toBeInTheDocument()
    expect(screen.getByText('Your Membership')).toBeInTheDocument()
  })

  it('shows refresh button when onRefresh provided', () => {
    const onRefresh = vi.fn()
    const roleDetails = { WAGER_PARTICIPANT: baseRole }
    render(
      <RoleDetailsSection
        roleDetails={roleDetails}
        loading={false}
        onRefresh={onRefresh}
      />
    )
    const refreshBtn = screen.getByTitle('Refresh from blockchain')
    fireEvent.click(refreshBtn)
    expect(onRefresh).toHaveBeenCalled()
  })

  it('filters out roles without hasRole', () => {
    const roleDetails = {
      WAGER_PARTICIPANT: { ...baseRole, hasRole: false },
    }
    const onPurchase = vi.fn()
    render(
      <RoleDetailsSection
        roleDetails={roleDetails}
        loading={false}
        onPurchase={onPurchase}
      />
    )
    expect(screen.getByText('No active membership')).toBeInTheDocument()
  })

  it('passes frozen state to compact cards', () => {
    const roleDetails = { WAGER_PARTICIPANT: baseRole }
    render(
      <RoleDetailsSection
        roleDetails={roleDetails}
        loading={false}
        isFrozen={true}
        freezeReason="Policy violation"
      />
    )
    expect(screen.getByText('Frozen')).toBeInTheDocument()
  })
})
