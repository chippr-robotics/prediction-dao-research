/**
 * The Operations section rail is a COLLAPSIBLE SIDE PANEL, not a show/hide sidebar.
 *
 * The old behaviour hid the rail outright (`display: none`), which meant collapsing it cost the
 * operator the whole navigation: from a collapsed panel there was no way to see, let alone reach,
 * any section without expanding again. It now collapses to an icon rail — every section still
 * rendered, still clickable, still carrying its label as its accessible name — with the hamburger
 * pinned to the top left of the rail in BOTH states so the control that opens the panel never moves.
 *
 * These tests pin the three things that make it a panel rather than a toggle:
 *   1. collapsed still lists every section (icons), and clicking one still switches the view;
 *   2. the toggle lives inside the rail, at the top, and reports its state via aria-expanded;
 *   3. on mobile — where the expanded rail covers the content it navigates — picking a section
 *      closes it again, and there is a backdrop to dismiss it without picking anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const m = vi.hoisted(() => ({ isMobile: false }))

vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => m.isMobile,
  useMediaQuery: () => false,
  useIsTablet: () => false,
  useIsExtraSmall: () => false,
}))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({ hasRole: () => true, hasAnyRole: () => true }),
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
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: () => ({ native: 'POL', capabilities: {} }) }))
vi.mock('../../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ({ resolvedAddress: '', isEns: false, isLoading: false }),
}))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Polygon', blockExplorer: 'https://polygonscan.com' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: () => '',
}))

// The overview cards each go to chain on mount; the rail is what is under test, so they are stubbed.
vi.mock('../../components/admin/ServiceHealthCard', () => ({ default: () => <div data-testid="service-health" /> }))
vi.mock('../../components/admin/PaymasterOpsCard', () => ({ default: () => <div data-testid="paymaster-ops" /> }))
vi.mock('../../components/admin/MembershipTreasuryOverview', () => ({ default: () => <div data-testid="treasury" /> }))
vi.mock('../../components/admin/MaintenanceTab', () => ({ default: () => <div data-testid="maintenance-tab" /> }))

import AdminPanel from '../../components/AdminPanel'

const railToggle = () => screen.getByRole('button', { name: /^(Collapse|Expand) sections menu$/ })

beforeEach(() => {
  m.isMobile = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Operations rail — collapsible side panel', () => {
  it('starts expanded on desktop, with the hamburger at the top of the rail', () => {
    const { container } = render(<AdminPanel />)
    const rail = container.querySelector('.portal-sidebar')
    const toggle = railToggle()

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAccessibleName('Collapse sections menu')
    // Inside the rail (top left), not floating in the content column beside it.
    expect(rail).toContainElement(toggle)
    expect(within(rail).getByText('Sections')).toBeInTheDocument()
    expect(container.querySelector('.portal-shell')).not.toHaveClass('portal-collapsed')
  })

  it('collapses to an icon rail that still lists every section', () => {
    const { container } = render(<AdminPanel />)
    const sectionNames = screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') || tab.textContent)

    fireEvent.click(railToggle())

    expect(container.querySelector('.portal-shell')).toHaveClass('portal-collapsed')
    expect(container.querySelector('.portal-nav')).toHaveClass('portal-nav--collapsed')
    // Not hidden — the same sections, same accessible names, now as icons.
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') || tab.textContent))
      .toEqual(sectionNames)
    expect(screen.getByRole('tab', { name: 'Maintenance' })).toBeInTheDocument()
    // The toggle stays put and now offers the opposite action.
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(railToggle()).toHaveAccessibleName('Expand sections menu')
  })

  it('switches sections from the collapsed rail without expanding first', () => {
    render(<AdminPanel />)
    fireEvent.click(railToggle())

    fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }))

    expect(screen.getByTestId('maintenance-tab')).toBeInTheDocument()
    // Selecting did not force the panel back open on desktop.
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('points the toggle at the nav it controls', () => {
    const { container } = render(<AdminPanel />)
    expect(railToggle()).toHaveAttribute('aria-controls', 'admin-portal-nav')
    expect(container.querySelector('#admin-portal-nav')).toHaveClass('portal-nav')
  })
})

describe('Operations rail — mobile overlay behaviour', () => {
  beforeEach(() => {
    m.isMobile = true
  })

  it('starts collapsed on mobile, where an expanded rail would cover the view', () => {
    const { container } = render(<AdminPanel />)
    expect(container.querySelector('.portal-shell')).toHaveClass('portal-collapsed')
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes itself once a section is picked', () => {
    render(<AdminPanel />)
    fireEvent.click(railToggle())
    expect(railToggle()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }))

    expect(screen.getByTestId('maintenance-tab')).toBeInTheDocument()
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('can be dismissed by the backdrop or Escape without changing section', () => {
    render(<AdminPanel />)

    fireEvent.click(railToggle())
    fireEvent.click(screen.getByRole('button', { name: 'Close sections menu' }))
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(railToggle())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(railToggle()).toHaveAttribute('aria-expanded', 'false')
    // Still on the section it opened from.
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders no backdrop while collapsed', () => {
    render(<AdminPanel />)
    expect(screen.queryByRole('button', { name: 'Close sections menu' })).not.toBeInTheDocument()
  })
})
