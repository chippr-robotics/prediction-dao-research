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

function renderPage(walletContext) {
  return render(
    <MemoryRouter>
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
  it('shows a "Show QR" button in the Account tab when connected (W1)', () => {
    renderPage(connectedWalletContext)
    expect(
      screen.getByRole('button', { name: /show qr/i })
    ).toBeInTheDocument()
  })

  it('opens the address QR modal with the connected address — one interaction (W1 / SC-001)', () => {
    const { container } = renderPage(connectedWalletContext)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show qr/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(container.querySelector('.address-qr svg')).toBeInTheDocument()
    // Address appears in the modal as well as the account details row.
    expect(screen.getAllByText(ADDRESS).length).toBeGreaterThanOrEqual(2)
  })

  it('closes the modal again via its close button (M3 wiring)', () => {
    renderPage(connectedWalletContext)
    fireEvent.click(screen.getByRole('button', { name: /show qr/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the connect prompt with no QR entry point when disconnected (W2 / FR-008)', () => {
    renderPage(disconnectedWalletContext)
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /show qr/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('WalletPage — section nav slide-over drawer', () => {
  // matchMedia defaults to matches:false (desktop) in setup.js. Force a mobile
  // match so the section nav behaves as an overlay drawer.
  const setViewport = (isMobile) => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: isMobile,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }

  it('docks the nav open on desktop (no backdrop)', () => {
    setViewport(false)
    renderPage(connectedWalletContext)

    expect(
      screen.getByRole('button', { name: /hide menu/i })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.queryByRole('button', { name: /close menu/i })
    ).not.toBeInTheDocument()
  })

  it('starts closed on mobile and toggles open with a backdrop', () => {
    setViewport(true)
    renderPage(connectedWalletContext)

    const toggle = screen.getByRole('button', { name: /show menu/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('button', { name: /close menu/i })
    ).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(
      screen.getByRole('button', { name: /hide menu/i })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: /close menu/i })
    ).toBeInTheDocument()
  })

  it('closes the drawer after a section is selected on mobile', () => {
    setViewport(true)
    renderPage(connectedWalletContext)

    fireEvent.click(screen.getByRole('button', { name: /show menu/i }))
    expect(
      screen.getByRole('button', { name: /close menu/i })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Membership' }))

    expect(
      screen.queryByRole('button', { name: /close menu/i })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /show menu/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('dismisses the drawer when the backdrop is tapped on mobile', () => {
    setViewport(true)
    renderPage(connectedWalletContext)

    fireEvent.click(screen.getByRole('button', { name: /show menu/i }))
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }))

    expect(
      screen.getByRole('button', { name: /show menu/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
