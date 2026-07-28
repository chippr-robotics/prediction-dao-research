/**
 * Spec 071 US2 (T025, T026) — console entry is an ESTATE-WIDE question.
 *
 * The defect this closes: admin roles are granted per contract per chain, but entry asked only
 * the chain the wallet happened to sit on. An operator holding GUARDIAN on Polygon, connected to
 * Base, was told "Access Restricted" — during an incident, that is an operator who cannot act.
 *
 * The subtler half is FR-011/FR-012: a chain that could not be READ must never be counted as
 * evidence a role is NOT held. "You hold nothing" and "we could not ask" are different
 * sentences, and only one of them is about the operator's grant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const m = vi.hoisted(() => ({ roles: [], roleChains: {}, estateRead: { read: [], unreadable: [], swept: true } }))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: (r) => m.roles.includes(r),
    hasAnyRole: (rs) => rs.some((r) => m.roles.includes(r)),
    roleChains: m.roleChains,
    estateRead: m.estateRead,
    chainsForRole: (r) => m.roleChains[r] || [],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({
    account: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    signer: null,
    provider: null,
    chainId: 8453, // Base — deliberately NOT where any role below is held
  }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: () => ({ native: 'ETH', capabilities: {} }) }))
vi.mock('../../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ({ resolvedAddress: '', isEns: false, isLoading: false }),
}))
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false, useMediaQuery: () => false, useIsTablet: () => false, useIsExtraSmall: () => false,
}))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://polygonscan.com' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: () => '',
}))
vi.mock('../../components/admin/ServiceHealthCard', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/PaymasterOpsCard', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/MembershipTreasuryOverview', () => ({ default: () => <div /> }))

import AdminPanel from '../../components/AdminPanel'
import { ROLES } from '../../contexts/RoleContext'
import { cohortChainIds } from '../../config/networks'

const COHORT = cohortChainIds()
const HOME = COHORT[0]
const OTHER = COHORT[1]

beforeEach(() => {
  m.roles = []
  m.roleChains = {}
  m.estateRead = { read: [...COHORT], unreadable: [], swept: true }
})

describe('entry is granted from any chain in the cohort (FR-009)', () => {
  it('opens for a role held on one chain while the wallet sits on another', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    render(<AdminPanel />)

    // Not the refusal screen…
    expect(screen.queryByText(/Access Restricted/i)).toBeNull()
    // …and the guardian's own view is offered.
    expect(screen.getByRole('tab', { name: 'Emergency' })).toBeInTheDocument()
  })

  it('offers only the views the held role gates, not the whole console', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    render(<AdminPanel />)

    expect(screen.getByRole('tab', { name: 'Emergency' })).toBeInTheDocument()
    // Admin-only views stay closed — entry is not authority.
    expect(screen.queryByRole('tab', { name: 'Tiers' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Admin Roles' })).toBeNull()
  })

  it('still refuses an account holding no role on any chain', () => {
    render(<AdminPanel />)
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument()
  })
})

describe('an unread chain is never counted as a denial (FR-011, FR-012)', () => {
  it('grants entry from roles found elsewhere even when one chain could not be read', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }
    m.estateRead = { read: [HOME], unreadable: [OTHER], swept: true }

    render(<AdminPanel />)

    expect(screen.queryByText(/Access Restricted/i)).toBeNull()
    expect(screen.getByRole('tab', { name: 'Emergency' })).toBeInTheDocument()
  })

  it('distinguishes "could not ask" from "you hold nothing" when NO chain answered', () => {
    m.estateRead = { read: [], unreadable: [...COHORT], swept: true }

    render(<AdminPanel />)

    expect(screen.getByText(/Could Not Verify Access/i)).toBeInTheDocument()
    expect(screen.queryByText(/Access Restricted/i)).toBeNull()
    // The refusal must attribute itself to the read, not to the operator's grant.
    expect(screen.getByText(/connectivity problem, not a statement about what you hold/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('treats a sweep that never completed the same way — unknown, not denied', () => {
    m.estateRead = { read: [], unreadable: [], swept: false }
    render(<AdminPanel />)
    expect(screen.getByText(/Could Not Verify Access/i)).toBeInTheDocument()
  })

  it('says how much of the estate it checked when it genuinely found nothing', () => {
    m.estateRead = { read: [HOME, OTHER], unreadable: [], swept: true }
    render(<AdminPanel />)
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument()
    expect(screen.getByText(/Checked across 2 networks/i)).toBeInTheDocument()
  })
})

describe('the permissions card names where each role lives (FR-010)', () => {
  it('names the network a held role was found on', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    const { container } = render(<AdminPanel />)
    const card = [...container.querySelectorAll('.admin-card')].find((el) =>
      within(el).queryByText('Your Permissions'),
    )
    const guardianRow = within(card).getByText(/Guardian \(pause/).closest('.permission-item')

    expect(guardianRow).toHaveClass('enabled')
    expect(guardianRow.textContent).toContain('Mordor') // NETWORKS[63].name, the cohort's first
  })

  it('lists every operator role, so a held one can never be silently missing', () => {
    m.roles = [ROLES.STAKING_ADMIN]
    m.roleChains = { [ROLES.STAKING_ADMIN]: [HOME] }

    const { container } = render(<AdminPanel />)
    const card = [...container.querySelectorAll('.admin-card')].find((el) =>
      within(el).queryByText('Your Permissions'),
    )

    // Eight roles can open this console; all eight get a row.
    expect(within(card).getAllByText(/Administrator|Guardian|Moderator|Role Manager|Compliance|Fee Admin|Staking Admin|Liquidity Admin/))
      .toHaveLength(8)
    // And the one actually held reads as held — the STAKING_ADMIN sync gap this phase fixed.
    const row = within(card).getByText(/Staking Administrator/).closest('.permission-item')
    expect(row).toHaveClass('enabled')
  })

  it('discloses unread networks rather than letting a × imply a denial', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }
    m.estateRead = { read: [HOME], unreadable: [OTHER], swept: true }

    const { container } = render(<AdminPanel />)
    const card = [...container.querySelectorAll('.admin-card')].find((el) =>
      within(el).queryByText('Your Permissions'),
    )
    expect(within(card).getByText(/could not be read, so\s+nothing above rules out a role held there/i))
      .toBeInTheDocument()
  })
})
