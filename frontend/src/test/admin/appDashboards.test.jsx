/**
 * Spec 093 US3 — admin app dashboards render honest states.
 *
 * Smoke-level: each dashboard mounts behind the shared shell and, with its
 * sources absent or unreachable, says so in words — never a zero, never a
 * green light, never an invented series. (Populated-data rendering for the
 * chart primitives themselves is covered by adminCharts.test.jsx; per-view
 * behaviour by each view's own suite.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({ catalog: { status: 'unreachable' } }))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: () => true,
    hasAnyRole: () => true,
    estateRead: { read: [137], unreadable: [], swept: true },
    chainsForRole: () => [],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({ account: '0xabc', signer: null, provider: null, chainId: 137 }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: () => ({ native: 'POL', capabilities: {} }) }))
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false, useMediaQuery: () => false, useIsTablet: () => false, useIsExtraSmall: () => false,
}))
vi.mock('../../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ({ resolvedAddress: '', isEns: false, isLoading: false }),
}))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://x' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: () => '',
}))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: () => Promise.resolve({ held: false, outcome: 'not-held' }),
}))
vi.mock('../../lib/miniapps/registryClient', () => ({
  REGISTRY_STATUS: { OK: 'ok', NOT_DEPLOYED: 'not-deployed', UNREACHABLE: 'unreachable', NOT_FOUND: 'not-found' },
  fetchCatalog: () => Promise.resolve(m.catalog),
  registryLocation: () => ({ chainId: 137, registryAddress: null }),
}))
vi.mock('../../hooks/useFeeEstate', () => ({
  useFeeEstate: () => ({ accrued: [], received: [], accruedTotals: null, receivedTotals: null, refresh: vi.fn() }),
}))
vi.mock('../../hooks/useGatewayStatus', () => ({
  useGatewayStatus: () => ({ configured: false, status: null }),
}))
vi.mock('../../hooks/useCallsignRegistryMetrics', () => ({
  useCallsignRegistryMetrics: () => ({ loading: false, error: null, data: null, refresh: vi.fn() }),
}))
// Heavy re-hosted views are not under test here.
vi.mock('../../components/admin/ServiceHealthCard', () => ({ default: () => <div data-testid="service-health" /> }))
vi.mock('../../components/admin/PaymasterOpsCard', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/MembershipTreasuryOverview', () => ({ default: () => <div data-testid="mto" /> }))
vi.mock('../../components/admin/ChainStateTable', () => ({ default: () => <table data-testid="chain-state" /> }))
vi.mock('../../components/admin/MaintenanceTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/CallsignRegistryAdmin', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/DenyListAdmin', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/MiniAppReviewTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/FeesTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/PerpsFeesPanel', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/StakingTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/ProtocolConfigTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/OracleAdaptersTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/BridgeTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/SupplyTab', () => ({ default: () => <div /> }))

import ComplianceApp from '../../components/admin/apps/ComplianceApp'
import MembershipRevenueApp from '../../components/admin/apps/MembershipRevenueApp'
import MaintenanceApp from '../../components/admin/apps/MaintenanceApp'
import IdentityApp from '../../components/admin/apps/IdentityApp'
import InfrastructureApp from '../../components/admin/apps/InfrastructureApp'

const mount = (El, path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <El />
    </MemoryRouter>,
  )

beforeEach(() => {
  m.catalog = { status: 'unreachable' }
})

describe('dashboards say what they could not read', () => {
  it('Compliance: an unreachable registry is unknown — not an empty queue', async () => {
    mount(ComplianceApp, '/admin/compliance')
    expect(await screen.findByText(/could not be read, so the review queue is\s*unknown — not empty/i))
      .toBeInTheDocument()
    expect(screen.queryByText(/Review queue empty/)).toBeNull()
  })

  it('Compliance: a build with no registry says so as a fact, not a failure', async () => {
    m.catalog = { status: 'not-deployed' }
    mount(ComplianceApp, '/admin/compliance')
    expect(await screen.findByText(/No mini-app registry is configured/i)).toBeInTheDocument()
  })

  it('Membership & Revenue: the estate tables and stats panel mount on the dashboard', () => {
    mount(MembershipRevenueApp, '/admin/membership-revenue')
    expect(screen.getByTestId('mto')).toBeInTheDocument()
    expect(screen.getAllByTestId('chain-state').length).toBeGreaterThanOrEqual(2)
  })

  it('Maintenance: the roster states absence explicitly per network', () => {
    mount(MaintenanceApp, '/admin/maintenance')
    expect(screen.getAllByText(/not deployed here/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/permissionless on-chain/i)).toBeInTheDocument()
  })

  it('Identity: with no registry anywhere, says there is nothing to moderate — no chart', () => {
    mount(IdentityApp, '/admin/identity')
    expect(screen.getByText(/No cohort network carries a CallsignRegistry/i)).toBeInTheDocument()
    expect(document.querySelector('.admin-spark')).toBeNull()
  })

  it('Infrastructure: an unconfigured gateway is disclosed as optional, not broken', () => {
    mount(InfrastructureApp, '/admin/infrastructure')
    expect(screen.getByText(/No relay gateway is configured/i)).toBeInTheDocument()
  })
})
