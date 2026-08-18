/**
 * The admin app section rail is a COLLAPSIBLE SIDE PANEL, not a show/hide sidebar.
 *
 * Spec 093 moved the rail from the monolithic AdminPanel into AdminAppShell —
 * the chrome every admin mini-app renders inside — and these tests moved with
 * it, invariants unchanged:
 *   1. collapsed still lists every section (icons), and clicking one still switches the view;
 *   2. the toggle lives inside the rail, at the top, and reports its state via aria-expanded;
 *   3. on mobile — where the expanded rail covers the content it navigates — picking a section
 *      closes it again, and there is a backdrop to dismiss it without picking anything.
 *
 * Mounted through MaintenanceApp: the permissionless app with the fewest data
 * dependencies, so the rail is what is actually under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({ isMobile: false }))

vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => m.isMobile,
  useMediaQuery: () => false,
  useIsTablet: () => false,
  useIsExtraSmall: () => false,
}))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: () => true,
    hasAnyRole: () => true,
    estateRead: { read: [137], unreadable: [], swept: true },
    chainsForRole: () => [137],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({
    account: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    signer: null,
    provider: null,
    chainId: 137,
  }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://polygonscan.com' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: () => '',
}))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: () => Promise.resolve({ held: false, outcome: 'not-held' }),
}))
vi.mock('../../components/admin/MaintenanceTab', () => ({ default: () => <div data-testid="maintenance-tab" /> }))

import MaintenanceApp from '../../components/admin/apps/MaintenanceApp'

const renderApp = (initialEntry = '/admin/maintenance') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MaintenanceApp />
    </MemoryRouter>,
  )

const railToggle = () => screen.getByRole('button', { name: /^(Collapse|Expand) sections menu$/ })

beforeEach(() => {
  m.isMobile = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('admin app rail — collapsible side panel', () => {
  it('starts expanded on desktop, with the hamburger at the top of the rail', () => {
    const { container } = renderApp()
    const rail = container.querySelector('.portal-sidebar')
    const toggle = railToggle()

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAccessibleName('Collapse sections menu')
    expect(rail).toContainElement(toggle)
    expect(within(rail).getByText('Sections')).toBeInTheDocument()
    expect(container.querySelector('.portal-shell')).not.toHaveClass('portal-collapsed')
  })

  it('collapses to an icon rail that still lists every section', () => {
    const { container } = renderApp()
    const sectionNames = screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') || tab.textContent)

    fireEvent.click(railToggle())

    expect(container.querySelector('.portal-shell')).toHaveClass('portal-collapsed')
    expect(container.querySelector('.portal-nav')).toHaveClass('portal-nav--collapsed')
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') || tab.textContent))
      .toEqual(sectionNames)
    expect(screen.getByRole('tab', { name: 'Maintenance' })).toBeInTheDocument()
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(railToggle()).toHaveAccessibleName('Expand sections menu')
  })

  it('switches sections from the collapsed rail without expanding first', () => {
    renderApp()
    fireEvent.click(railToggle())

    fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }))

    expect(screen.getByTestId('maintenance-tab')).toBeInTheDocument()
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('points the toggle at the nav it controls', () => {
    const { container } = renderApp()
    expect(railToggle()).toHaveAttribute('aria-controls', 'admin-app-nav')
    expect(container.querySelector('#admin-app-nav')).toHaveClass('portal-nav')
  })

  it('reflects the ?view= address in the rail and the panel (spec 093 FR-008)', () => {
    renderApp('/admin/maintenance?view=maintenance')
    expect(screen.getByRole('tab', { name: 'Maintenance' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('maintenance-tab')).toBeInTheDocument()
  })

  it('renders the dashboard for an unknown ?view= rather than an error', () => {
    renderApp('/admin/maintenance?view=nonsense')
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('admin app rail — mobile overlay behaviour', () => {
  beforeEach(() => {
    m.isMobile = true
  })

  it('starts collapsed on mobile, where an expanded rail would cover the view', () => {
    const { container } = renderApp()
    expect(container.querySelector('.portal-shell')).toHaveClass('portal-collapsed')
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes itself once a section is picked', () => {
    renderApp()
    fireEvent.click(railToggle())
    expect(railToggle()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }))

    expect(screen.getByTestId('maintenance-tab')).toBeInTheDocument()
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('can be dismissed by the backdrop or Escape without changing section', () => {
    renderApp()

    fireEvent.click(railToggle())
    fireEvent.click(screen.getByRole('button', { name: 'Close sections menu' }))
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(railToggle())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
    // Still on the section it opened from.
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders no backdrop while collapsed', () => {
    renderApp()
    expect(screen.queryByRole('button', { name: 'Close sections menu' })).not.toBeInTheDocument()
  })
})
