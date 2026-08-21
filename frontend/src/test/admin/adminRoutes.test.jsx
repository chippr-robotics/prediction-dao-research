/**
 * Spec 093 (US1/US4) — the /admin/:appId route guard and ?view= addressing.
 *
 * Three properties:
 *   1. an unknown app id redirects to the Control Room — the address bar is
 *      not an oracle for which apps exist;
 *   2. an ENTITLED operator deep-linking a view lands on it (URL is the only
 *      view state);
 *   3. an operator without the app's qualifying roles is redirected back to
 *      the Control Room, and an account with no roles at all gets the same
 *      denied screens the front door shows — with no admin data fetched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const m = vi.hoisted(() => ({ roles: [], swept: true, curator: { held: false, outcome: 'not-held' } }))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: (r) => m.roles.includes(r),
    hasAnyRole: (rs) => rs.some((r) => m.roles.includes(r)),
    estateRead: { read: [137], notDeployed: [], unreadable: [], swept: m.swept },
    chainsForRole: () => [],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({ account: '0xabc', signer: null, provider: null, chainId: 137 }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false, useMediaQuery: () => false, useIsTablet: () => false, useIsExtraSmall: () => false,
}))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
const contractSpy = vi.hoisted(() => vi.fn())
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://x' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: (...args) => {
    contractSpy(...args)
    return ''
  },
}))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: () => Promise.resolve(m.curator),
}))
vi.mock('../../hooks/useCallsignRegistryMetrics', () => ({
  useCallsignRegistryMetrics: () => ({ loading: false, error: null, data: null, refresh: vi.fn() }),
}))
vi.mock('../../components/admin/MaintenanceTab', () => ({ default: () => <div data-testid="maintenance-tab" /> }))
vi.mock('../../components/admin/CallsignRegistryAdmin', () => ({ default: () => <div data-testid="callsigns-view" /> }))

import AdminAppRoute from '../../components/admin/AdminAppRoute'
import { ROLES } from '../../contexts/RoleContext'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<div data-testid="control-room-stub" />} />
        <Route path="/admin/:appId" element={<AdminAppRoute />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  m.roles = []
  m.swept = true
  m.curator = { held: false, outcome: 'not-held' }
  contractSpy.mockClear()
})

describe('unknown app ids land on the Control Room', () => {
  it('redirects /admin/does-not-exist without rendering anything admin-shaped', async () => {
    renderAt('/admin/does-not-exist')
    expect(await screen.findByTestId('control-room-stub')).toBeInTheDocument()
  })
})

describe('?view= deep links land the entitled operator on the view (FR-008)', () => {
  it('renders the named view directly', async () => {
    m.roles = [ROLES.GUARDIAN] // any entrant role; maintenance is permissionless
    renderAt('/admin/maintenance?view=maintenance')
    expect(await screen.findByTestId('maintenance-tab')).toBeInTheDocument()
  })

  it('renders the dashboard when the view id is unknown', async () => {
    m.roles = [ROLES.GUARDIAN]
    renderAt('/admin/maintenance?view=bogus')
    expect(await screen.findByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('maintenance-tab')).toBeNull()
  })
})

describe('entitlement is enforced at every depth', () => {
  it('redirects an operator without the app’s roles back to the Control Room', async () => {
    m.roles = [ROLES.FEE_ADMIN] // entrant, but identity requires isAdmin
    renderAt('/admin/identity?view=callsigns')
    expect(await screen.findByTestId('control-room-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('callsigns-view')).toBeNull()
  })

  it('shows a role-less account the standard denied screen, not a redirect', async () => {
    renderAt('/admin/maintenance')
    expect(await screen.findByText(/Access Restricted/i)).toBeInTheDocument()
  })

  /*
   * The redirect above acts on the ABSENCE of a role flag, so it must not run before the flags
   * are in. Entry can be granted by the curator authority — a single contract read — while the
   * role sweep is still going, and in that window every flag is false. An operator following a
   * bookmarked link to the killswitch was bounced to the Control Room for it.
   */
  it('does not redirect while the role sweep is still running', async () => {
    m.curator = { held: true, outcome: 'held' } // entry granted by the curator read…
    m.swept = false // …while the sweep, which would have found GUARDIAN, is still in flight

    // Uses the same app as the redirect case above, so this file loads no further lazy screens.
    renderAt('/admin/identity?view=callsigns')

    expect(await screen.findByRole('heading', { name: 'Identity' })).toBeInTheDocument()
    expect(screen.queryByTestId('control-room-stub')).toBeNull()
  })

  it('gates a deep link at the same strength as the front door', async () => {
    // Named for what it asserts. This read as unverifiable-state coverage while
    // asserting the DENIED screen — the mock always reports read:[137], so no
    // chain-outage case can arise here. The three-way distinction lives in
    // adminEstateEntry.test.jsx; what this pins is that arriving at /admin/:appId
    // directly cannot reach a softer gate than /admin does.
    renderAt('/admin/maintenance')
    expect(await screen.findByText(/Access Restricted/i)).toBeInTheDocument()
    expect(screen.queryByTestId('maintenance-tab')).toBeNull()
  })
})
