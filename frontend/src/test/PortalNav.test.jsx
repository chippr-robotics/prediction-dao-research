import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import PortalNav from '../components/ui/PortalNav'
import { NAV_GROUPS, groupForTab, pathForNavItem, visibleNavGroups } from '../config/appNav'
import WalletPage from '../pages/WalletPage'
import { WalletContext, UIContext } from '../contexts'

// Spec 067 (US1, FR-001/FR-002): the section is labelled "Transfer" everywhere a member sees it
// while the `paytransfer` tab id and `/wallet?tab=paytransfer` route stay untouched. The WalletPage
// deep-link case below needs the same hermetic mock stack the other WalletPage tests use.
vi.mock('../components/fairwins/TradePanel', () => ({ default: () => <div data-testid="trade-panel" /> }))
vi.mock('../components/ui/PremiumPurchaseModal', () => ({ default: () => <div data-testid="premium-modal" /> }))
vi.mock('../components/wallet/PayTransferPanel', () => ({
  default: () => <div data-testid="paytransfer-panel" />,
}))
vi.mock('../hooks/useEncryption', () => ({
  useEncryption: () => ({ isInitialized: false, isInitializing: false, ensureInitialized: vi.fn() }),
}))
vi.mock('../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: { polymarketCategories: [] }, setPolymarketCategories: vi.fn() }),
}))
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: () => ({ capabilities: {} }) }))
vi.mock('../hooks/useAccountStats', () => ({
  useAccountStats: () => ({
    summary: null,
    series: { range: '30D', points: [], isEmpty: true, isLowData: true, endValueUsd: 0 },
    setRange: vi.fn(),
    breakdowns: null,
    activity: [],
    isConnected: true,
    isSupportedNetwork: true,
    chainId: 137,
    isLoading: false,
    isEmpty: true,
    error: null,
    freshness: { summary: { lastUpdated: null, status: 'fresh' } },
    refresh: vi.fn(),
  }),
}))
vi.mock('../utils/keyRegistryService', () => ({
  hasRegisteredKey: vi.fn().mockResolvedValue(false),
  ensureKeyRegistered: vi.fn(),
}))

const ITEMS = [
  { id: 'account', label: 'Account' },
  { id: 'reports', label: 'Reporting' },
  { id: 'swap', label: 'Swap' },
]

describe('PortalNav (vertical sidebar tabs)', () => {
  it('renders a vertical tablist with every item', () => {
    render(<PortalNav items={ITEMS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />)
    const list = screen.getByRole('tablist', { name: /account sections/i })
    expect(list).toHaveAttribute('aria-orientation', 'vertical')
    for (const item of ITEMS) {
      expect(screen.getByRole('tab', { name: item.label })).toBeInTheDocument()
    }
  })

  it('marks the active item with aria-selected', () => {
    render(<PortalNav items={ITEMS} activeId="reports" onSelect={vi.fn()} ariaLabel="Account sections" />)
    expect(screen.getByRole('tab', { name: 'Reporting' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onSelect with the item id when a tab is clicked', () => {
    const onSelect = vi.fn()
    render(<PortalNav items={ITEMS} activeId="account" onSelect={onSelect} ariaLabel="Account sections" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reporting' }))
    expect(onSelect).toHaveBeenCalledWith('reports')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <PortalNav items={ITEMS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

const GROUPS = [
  { label: 'Admin', items: [{ id: 'account', label: 'Account' }] },
  {
    label: 'Finance',
    items: [
      { id: 'trade', label: 'Trade' },
      { id: 'paytransfer', label: 'Transfer' },
    ],
  },
]

describe('PortalNav (grouped rail)', () => {
  it('renders a group heading for each group with its tabs beneath', () => {
    render(<PortalNav groups={GROUPS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    for (const group of GROUPS) {
      for (const item of group.items) {
        expect(screen.getByRole('tab', { name: item.label })).toBeInTheDocument()
      }
    }
  })

  it('keeps every grouped entry inside the single tablist', () => {
    render(<PortalNav groups={GROUPS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
  })

  it('calls onSelect with the item id when a grouped tab is clicked', () => {
    const onSelect = vi.fn()
    render(<PortalNav groups={GROUPS} activeId="account" onSelect={onSelect} ariaLabel="Account sections" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Transfer' }))
    expect(onSelect).toHaveBeenCalledWith('paytransfer')
  })

  it('has no axe violations when grouped', async () => {
    const { container } = render(
      <PortalNav groups={GROUPS} activeId="account" onSelect={vi.fn()} ariaLabel="Account sections" />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// --- Collapsed (icon-only) rail -----------------------------------------------------------------
// Collapsing must not amputate the nav: every section stays clickable and keeps its accessible
// name, so the rail is one control in two widths rather than two different navigations.

describe('PortalNav (collapsed icon rail)', () => {
  const ICON_GROUPS = [
    { label: 'Control Room', items: [{ id: 'overview', label: 'Overview', icon: 'grid' }] },
    {
      label: 'Compliance',
      items: [
        { id: 'deny-list', label: 'Deny-list', icon: 'ban' },
        { id: 'members', label: 'Members', icon: 'users' },
      ],
    },
  ]

  it('still renders every item, with its label as the accessible name', () => {
    render(<PortalNav groups={ICON_GROUPS} activeId="overview" onSelect={vi.fn()} collapsed ariaLabel="Sections" />)
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    for (const group of ICON_GROUPS) {
      for (const item of group.items) {
        expect(screen.getByRole('tab', { name: item.label })).toBeInTheDocument()
      }
    }
  })

  it('marks the rail collapsed and gives each item a tooltip', () => {
    const { container } = render(
      <PortalNav groups={ICON_GROUPS} activeId="overview" onSelect={vi.fn()} collapsed ariaLabel="Sections" />
    )
    expect(container.querySelector('.portal-nav')).toHaveClass('portal-nav--collapsed')
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('title', 'Members')
  })

  it('renders an icon for every item so the collapsed rail is never blank', () => {
    const { container } = render(
      <PortalNav items={ITEMS} activeId="account" onSelect={vi.fn()} collapsed ariaLabel="Sections" />
    )
    // ITEMS carry no icon; each falls back to its initial rather than an empty square.
    expect(container.querySelectorAll('.portal-nav-item-icon')).toHaveLength(ITEMS.length)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('leaves the expanded rail unchanged (no icon tile for icon-less items)', () => {
    const { container } = render(
      <PortalNav items={ITEMS} activeId="account" onSelect={vi.fn()} ariaLabel="Sections" />
    )
    expect(container.querySelector('.portal-nav')).not.toHaveClass('portal-nav--collapsed')
    expect(container.querySelectorAll('.portal-nav-item-icon')).toHaveLength(0)
    expect(screen.getByRole('tab', { name: 'Account' })).not.toHaveAttribute('title')
  })

  it('still selects when a collapsed item is clicked', () => {
    const onSelect = vi.fn()
    render(<PortalNav groups={ICON_GROUPS} activeId="overview" onSelect={onSelect} collapsed ariaLabel="Sections" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Deny-list' }))
    expect(onSelect).toHaveBeenCalledWith('deny-list')
  })

  it('has no axe violations when collapsed', async () => {
    const { container } = render(
      <PortalNav groups={ICON_GROUPS} activeId="overview" onSelect={vi.fn()} collapsed ariaLabel="Sections" />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// --- Spec 067 US1 (T062): "Pay & Transfer" is now "Transfer" ------------------------------------
// The rename is label-only. Every entry point that worked before — drawer item, mobile icon bar
// sibling, and the saved `/wallet?tab=paytransfer` deep link — must still land on the section.

const financeGroup = NAV_GROUPS.find((group) => group.label === 'Finance')
const transferItem = financeGroup.items.find((item) => item.id === 'paytransfer')

describe('Transfer section rename (spec 067 FR-001/FR-002)', () => {
  it('labels the section "Transfer" while keeping the paytransfer id', () => {
    expect(transferItem).toBeDefined()
    expect(transferItem.label).toBe('Transfer')
    expect(transferItem.icon).toBe('transfer')
  })

  it('leaves no member-facing "Pay & Transfer" label in the nav model', () => {
    const labels = NAV_GROUPS.flatMap((group) => [group.label, ...group.items.map((item) => item.label)])
    expect(labels).not.toContain('Pay & Transfer')
  })

  it('still routes the section to /wallet?tab=paytransfer', () => {
    expect(pathForNavItem('paytransfer')).toBe('/wallet?tab=paytransfer')
  })

  it('keeps the section in the Finance group so the mobile icon bar shows its siblings', () => {
    expect(groupForTab('paytransfer')?.label).toBe('Finance')
    const visible = visibleNavGroups({ collectibles: false, predict: false })
    const stillThere = visible
      .flatMap((group) => group.items)
      .find((item) => item.id === 'paytransfer')
    expect(stillThere?.label).toBe('Transfer')
  })

  it('renders the real Finance group as a "Transfer" tab that selects paytransfer', () => {
    const onSelect = vi.fn()
    render(
      <PortalNav groups={[financeGroup]} activeId="trade" onSelect={onSelect} ariaLabel="Finance sections" />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Transfer' }))
    expect(onSelect).toHaveBeenCalledWith('paytransfer')
    expect(screen.queryByRole('tab', { name: 'Pay & Transfer' })).toBeNull()
  })
})

const walletContext = {
  address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  isConnected: true,
  connectors: [],
  provider: null,
  signer: null,
  chainId: 137,
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  roles: [],
  rolesLoading: false,
  blockchainSynced: true,
  refreshRoles: vi.fn(),
  hasRole: vi.fn().mockReturnValue(false),
  hasAnyRole: vi.fn().mockReturnValue(false),
  hasAllRoles: vi.fn().mockReturnValue(false),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}

const uiContext = {
  modal: null,
  showModal: vi.fn(),
  hideModal: vi.fn(),
  notification: null,
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
  announcement: null,
  announce: vi.fn(),
  error: null,
  showError: vi.fn(),
  clearError: vi.fn(),
}

function renderWalletPage(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UIContext.Provider value={uiContext}>
        <WalletContext.Provider value={walletContext}>
          <WalletPage />
        </WalletContext.Provider>
      </UIContext.Provider>
    </MemoryRouter>
  )
}

describe('WalletPage — saved /wallet?tab=paytransfer deep link (spec 067 FR-002)', () => {
  it('still resolves to the renamed Transfer section', () => {
    const { container } = renderWalletPage('/wallet?tab=paytransfer')
    expect(container.querySelector('.paytransfer-section')).toBeTruthy()
    expect(screen.getByTestId('paytransfer-panel')).toBeInTheDocument()
    // Not silently bounced to the Account fallback.
    expect(container.querySelector('.profile-section')).toBeNull()
  })
})
