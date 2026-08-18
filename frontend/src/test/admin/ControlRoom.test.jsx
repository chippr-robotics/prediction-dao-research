/**
 * Spec 093 US1 — the Control Room lists EXACTLY what the matrix grants.
 *
 * This is the least-privilege invariant that used to be enforced by diffing
 * AdminPanel.jsx source against adminNav.js: render-gate ≡ config-gate. It is
 * stronger now — for every single-flag operator the rendered tile set is
 * asserted equal to buildAdminApps' answer, so the launcher can neither hide
 * an entitled app nor offer an unentitled one. TileStatus honesty is pinned
 * separately: an unreadable status source renders as words, never a value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({
  roles: [],
  curator: { held: false, outcome: 'not-held' },
  gateway: { configured: false, status: null },
}))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: (r) => m.roles.includes(r),
    hasAnyRole: (rs) => rs.some((r) => m.roles.includes(r)),
    estateRead: { read: [137, 63], unreadable: [], swept: true },
    chainsForRole: () => [],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({ account: '0xabc', signer: null, provider: null, chainId: 137 }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: () => ({ native: 'POL', capabilities: {} }) }))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://x' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: () => '',
}))
vi.mock('../../hooks/useFeeEstate', () => ({
  useFeeEstate: () => ({ accrued: [], received: [], accruedTotals: null, receivedTotals: null, refresh: vi.fn() }),
}))
vi.mock('../../hooks/useGatewayStatus', () => ({ useGatewayStatus: () => m.gateway }))
vi.mock('../../lib/miniapps/registryClient', () => ({
  REGISTRY_STATUS: { OK: 'ok', NOT_DEPLOYED: 'not-deployed', UNREACHABLE: 'unreachable', NOT_FOUND: 'not-found' },
  fetchCatalog: () => Promise.resolve({ status: 'unreachable' }),
}))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: () => Promise.resolve(m.curator),
}))

import ControlRoom from '../../components/admin/ControlRoom'
import { buildAdminApps } from '../../components/admin/adminApps'
import { ROLES } from '../../contexts/RoleContext'

const FLAG_TO_ROLE = {
  isAdmin: ROLES.ADMIN,
  isGuardian: ROLES.GUARDIAN,
  isAccountModerator: ROLES.ACCOUNT_MODERATOR,
  isRoleManager: ROLES.ROLE_MANAGER,
  isSanctionsAdmin: ROLES.SANCTIONS_ADMIN,
  isFeeAdmin: ROLES.FEE_ADMIN,
  isStakingAdmin: ROLES.STAKING_ADMIN,
  isLiquidityAdmin: ROLES.LIQUIDITY_ADMIN,
}

const renderControlRoom = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <ControlRoom />
    </MemoryRouter>,
  )

const renderedTileNames = (container) =>
  [...container.querySelectorAll('.control-room-tile .control-room-tile__name')].map(
    (el) => el.textContent,
  )

beforeEach(() => {
  m.roles = []
  m.curator = { held: false, outcome: 'not-held' }
  m.gateway = { configured: false, status: null }
})

describe('render-gate ≡ config-gate, per single-flag operator (least privilege)', () => {
  for (const [flag, role] of Object.entries(FLAG_TO_ROLE)) {
    it(`${flag} renders exactly the configured tile set`, () => {
      m.roles = [role]
      const expected = buildAdminApps({ [flag]: true }).map((a) => a.name)
      const { container } = renderControlRoom()
      expect(renderedTileNames(container)).toEqual(expected)
    })
  }

  it('a registry-confirmed curator gets Compliance (and Maintenance) with no app-wide role', async () => {
    m.curator = { held: true, outcome: 'held' }
    const { container } = renderControlRoom()
    // curator authority resolves async; the tile appears once it lands
    await screen.findByRole('link', { name: /Compliance/ })
    expect(renderedTileNames(container)).toEqual(
      buildAdminApps({ isAppCurator: true }).map((a) => a.name),
    )
  })
})

describe('tile status honesty', () => {
  it('renders a gateway status only when the gateway actually answered', () => {
    m.roles = [ROLES.ADMIN]
    m.gateway = { configured: true, status: null }
    renderControlRoom()
    expect(screen.getByText('Status could not be read')).toBeInTheDocument()
    expect(screen.queryByText(/Gateway healthy/)).toBeNull()
  })

  it('names an engaged killswitch as an alert', () => {
    m.roles = [ROLES.ADMIN]
    m.gateway = {
      configured: true,
      status: { ok: true, killSwitch: true, chains: [], hasOperatorTelemetry: false },
    }
    renderControlRoom()
    expect(screen.getByText('Gateway killswitch ON')).toBeInTheDocument()
  })
})
