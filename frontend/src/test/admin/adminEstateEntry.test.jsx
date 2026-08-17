/**
 * Spec 071 US2 (T025, T026), re-pointed at the spec-093 Control Room —
 * operations entry is an ESTATE-WIDE question.
 *
 * The defect the original closed: admin roles are granted per contract per
 * chain, but entry asked only the chain the wallet happened to sit on. An
 * operator holding GUARDIAN on Polygon, connected to Base, was told "Access
 * Restricted" — during an incident, that is an operator who cannot act.
 *
 * The subtler half is FR-011/FR-012: a chain that could not be READ must
 * never be counted as evidence a role is NOT held. "You hold nothing" and
 * "we could not ask" are different sentences. Both invariants now live in
 * the Control Room (the launcher every admin app shares its gate with).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({
  roles: [],
  roleChains: {},
  estateRead: { read: [], unreadable: [], swept: true },
}))

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
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false, useMediaQuery: () => false, useIsTablet: () => false, useIsExtraSmall: () => false,
}))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://polygonscan.com' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: () => '',
}))
// Admin data sources — the gate test cares that these are NOT consulted when
// entry is refused (asserted below), and stubbed quiet when it is granted.
const dataSpies = vi.hoisted(() => ({
  feeEstate: vi.fn(),
  gateway: vi.fn(),
  catalog: vi.fn(),
  curator: vi.fn(),
}))
vi.mock('../../hooks/useFeeEstate', () => ({
  useFeeEstate: (...args) => {
    dataSpies.feeEstate(...args)
    return { accrued: [], received: [], accruedTotals: null, receivedTotals: null, refresh: vi.fn() }
  },
}))
vi.mock('../../hooks/useGatewayStatus', () => ({
  useGatewayStatus: () => {
    dataSpies.gateway()
    return { configured: false, status: null }
  },
}))
vi.mock('../../lib/miniapps/registryClient', () => ({
  REGISTRY_STATUS: { OK: 'ok', NOT_DEPLOYED: 'not-deployed', UNREACHABLE: 'unreachable', NOT_FOUND: 'not-found' },
  fetchCatalog: (...args) => {
    dataSpies.catalog(...args)
    return Promise.resolve({ status: 'not-deployed' })
  },
}))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: (...args) => {
    dataSpies.curator(...args)
    return Promise.resolve({ held: false, outcome: 'not-held' })
  },
}))

import ControlRoom from '../../components/admin/ControlRoom'
import { ROLES } from '../../contexts/RoleContext'
import { cohortChainIds } from '../../config/networks'

const COHORT = cohortChainIds()
const HOME = COHORT[0]
const OTHER = COHORT[1]

const renderControlRoom = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <ControlRoom />
    </MemoryRouter>,
  )

beforeEach(() => {
  m.roles = []
  m.roleChains = {}
  m.estateRead = { read: [...COHORT], unreadable: [], swept: true }
  dataSpies.feeEstate.mockClear()
  dataSpies.gateway.mockClear()
  dataSpies.catalog.mockClear()
})

describe('entry is granted from any chain in the cohort (FR-009)', () => {
  it('opens for a role held on one chain while the wallet sits on another', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    renderControlRoom()

    expect(screen.queryByText(/Access Restricted/i)).toBeNull()
    // …and the guardian's own app is offered.
    expect(screen.getByRole('link', { name: /Incident Response/ })).toBeInTheDocument()
  })

  it('offers only the apps the held role gates, not the whole console', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    renderControlRoom()

    expect(screen.getByRole('link', { name: /Incident Response/ })).toBeInTheDocument()
    // Admin-only apps stay closed — entry is not authority.
    expect(screen.queryByRole('link', { name: /Membership & Revenue/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Access Control/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Identity/ })).toBeNull()
  })

  it('still refuses an account holding no role on any chain', () => {
    renderControlRoom()
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument()
  })

  it('fetches no admin data while refused — the gate is also a data gate', () => {
    renderControlRoom()
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument()
    expect(dataSpies.feeEstate).not.toHaveBeenCalled()
    expect(dataSpies.gateway).not.toHaveBeenCalled()
    expect(dataSpies.catalog).not.toHaveBeenCalled()
  })
})

describe('an unread chain is never counted as a denial (FR-011, FR-012)', () => {
  it('grants entry from roles found elsewhere even when one chain could not be read', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }
    m.estateRead = { read: [HOME], unreadable: [OTHER], swept: true }

    renderControlRoom()

    expect(screen.queryByText(/Access Restricted/i)).toBeNull()
    expect(screen.getByRole('link', { name: /Incident Response/ })).toBeInTheDocument()
  })

  it('distinguishes "could not ask" from "you hold nothing" when NO chain answered', () => {
    m.estateRead = { read: [], unreadable: [...COHORT], swept: true }

    renderControlRoom()

    expect(screen.getByText(/Could Not Verify Access/i)).toBeInTheDocument()
    expect(screen.queryByText(/Access Restricted/i)).toBeNull()
    expect(screen.getByText(/connectivity problem, not a statement about what you hold/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('treats a sweep that never completed the same way — unknown, not denied', () => {
    m.estateRead = { read: [], unreadable: [], swept: false }
    renderControlRoom()
    expect(screen.getByText(/Could Not Verify Access/i)).toBeInTheDocument()
  })

  it('says how much of the estate it checked when it genuinely found nothing', () => {
    m.estateRead = { read: [HOME, OTHER], unreadable: [], swept: true }
    renderControlRoom()
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument()
    expect(screen.getByText(/Checked across 2 networks/i)).toBeInTheDocument()
  })
})

describe('the permissions card names where each role lives (FR-010)', () => {
  it('names the network a held role was found on', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    const { container } = renderControlRoom()
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

    const { container } = renderControlRoom()
    const card = [...container.querySelectorAll('.admin-card')].find((el) =>
      within(el).queryByText('Your Permissions'),
    )

    expect(within(card).getAllByText(/Administrator|Guardian|Moderator|Role Manager|Compliance|Fee Admin|Staking Admin|Liquidity Admin/))
      .toHaveLength(8)
    const row = within(card).getByText(/Staking Administrator/).closest('.permission-item')
    expect(row).toHaveClass('enabled')
  })

  it('discloses unread networks rather than letting a × imply a denial', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }
    m.estateRead = { read: [HOME], unreadable: [OTHER], swept: true }

    const { container } = renderControlRoom()
    const card = [...container.querySelectorAll('.admin-card')].find((el) =>
      within(el).queryByText('Your Permissions'),
    )
    expect(within(card).getByText(/could not be read, so\s+nothing above rules out a role held there/i))
      .toBeInTheDocument()
  })
})

describe('the permissionless maintenance app does not imply status (FR-010 / spec 093)', () => {
  it('is offered to every entrant, styled plain', () => {
    m.roles = [ROLES.GUARDIAN]
    m.roleChains = { [ROLES.GUARDIAN]: [HOME] }

    renderControlRoom()
    const tile = screen.getByRole('link', { name: /Maintenance/ })
    expect(tile).toHaveClass('control-room-tile--plain')
  })
})
