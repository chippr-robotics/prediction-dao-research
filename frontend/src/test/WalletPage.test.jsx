import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WalletPage from '../pages/WalletPage'
import { WalletContext, UIContext } from '../contexts'

// Spec 011 — Account tab entry point for the address QR modal
// (contracts/address-qr-ui-contract.md, W1–W2). Wallet state is mocked at the
// context level per repo convention — never raw wagmi hooks.

// Stub heavy children that are irrelevant to the entry-point contract.
vi.mock('../components/fairwins/TradePanel', () => ({
  default: () => <div data-testid="trade-panel" />,
}))
vi.mock('../components/ui/PremiumPurchaseModal', () => ({
  default: () => <div data-testid="premium-modal" />,
}))
vi.mock('../components/ui/BlockiesAvatar', () => ({
  default: () => <div data-testid="blockies-avatar" />,
}))
vi.mock('../hooks/useEncryption', () => ({
  useEncryption: () => ({
    isInitialized: false,
    isInitializing: false,
    ensureInitialized: vi.fn(),
  }),
}))
vi.mock('../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: { polymarketCategories: [] },
    setPolymarketCategories: vi.fn(),
  }),
}))
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: () => ({ capabilities: {} }),
}))
// Spec 020 — the Account tab now renders the stats dashboard. Mock its data
// hook so this entry-point test stays network-free; the dashboard still renders
// the preserved wallet utilities (address + Show QR + Disconnect).
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

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

const connectedWalletContext = {
  address: ADDRESS,
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

const disconnectedWalletContext = {
  ...connectedWalletContext,
  address: undefined,
  isConnected: false,
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

function renderPage(walletContext, route = '/wallet') {
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

beforeEach(() => {
  localStorage.clear()
})

describe('WalletPage — address QR entry point', () => {
  // Show QR Code (and pool phrase language) live in the Preferences panel's
  // "Wallet" section. Preferences is now reached from the account button, so the
  // panel is deep-linked here via ?tab=preferences rather than an in-page tab.
  const PREFERENCES_ROUTE = '/wallet?tab=preferences'

  it('shows a "Show QR Code" button on the Preferences panel when connected (W1)', () => {
    renderPage(connectedWalletContext, PREFERENCES_ROUTE)
    expect(
      screen.getByRole('button', { name: /show qr/i })
    ).toBeInTheDocument()
  })

  it('opens the address QR modal with the connected address — one interaction (W1 / SC-001)', () => {
    const { container } = renderPage(connectedWalletContext, PREFERENCES_ROUTE)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show qr/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(container.querySelector('.address-qr svg')).toBeInTheDocument()
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
  })

  it('closes the modal again via its close button (M3 wiring)', () => {
    renderPage(connectedWalletContext, PREFERENCES_ROUTE)
    fireEvent.click(screen.getByRole('button', { name: /show qr/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the connect prompt with no section content when disconnected (W2 / FR-008)', () => {
    renderPage(disconnectedWalletContext, PREFERENCES_ROUTE)
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /show qr/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('WalletPage — identity moved to the wallet button', () => {
  // The wallet identity + copy-address affordance was removed from the section
  // panels and now lives on the account button (top right). WalletPage no longer
  // renders a copy-address control.
  it('does not render a copy-address control in the panels', () => {
    renderPage(connectedWalletContext)
    expect(
      screen.queryByRole('button', { name: /copy wallet address/i })
    ).not.toBeInTheDocument()
  })
})

describe('WalletPage — section routing', () => {
  // The in-page section rail/drawer was lifted into the global nav drawer. The
  // page is now a flat host: it reads `?tab=` to pick a panel. Each panel renders
  // its own heading, so there is no duplicate in-page section title, ☰ toggle,
  // backdrop, or footer here.
  it('defaults to the Account section with no ?tab', () => {
    const { container } = renderPage(connectedWalletContext, '/wallet')
    expect(container.querySelector('.profile-section')).toBeTruthy()
    expect(container.querySelector('.membership-section')).toBeFalsy()
  })

  it('deep-links to the Membership section via ?tab=membership', () => {
    const { container } = renderPage(connectedWalletContext, '/wallet?tab=membership')
    expect(container.querySelector('.membership-section')).toBeTruthy()
    // The Membership panel renders its own "Your Roles" / "Membership" headings.
    expect(screen.getByRole('heading', { name: /your roles/i })).toBeInTheDocument()
  })

  it('does not render a duplicate in-page section title', () => {
    const { container } = renderPage(connectedWalletContext, '/wallet?tab=membership')
    expect(container.querySelector('.wallet-portal-current')).toBeFalsy()
    expect(container.querySelector('.wallet-portal-topbar')).toBeFalsy()
  })
})
