/**
 * Wallet-sheet Buy button gating (spec 060 US1/US2). The Buy action renders ONLY when the static
 * capability, the configured gateway, AND the live catalog all agree — everywhere else the sheet
 * is byte-identical to pre-feature (never a dead button). Uses the WalletButton.test.jsx provider
 * scaffolding; the REAL onrampAvailable runs (capability + env), only the catalog fetch is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WalletButton from '../../components/wallet/WalletButton'
import { WalletContext, ThemeContext, UIContext, FriendMarketsContext } from '../../contexts'
import { CustodyContext } from '../../contexts/CustodyContext'
import { BrowserRouter } from 'react-router-dom'

vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(() => 137),
}))

vi.mock('../../hooks', () => ({
  useWalletRoles: vi.fn(() => ({ roles: [], hasRole: vi.fn(() => false), rolesLoading: false, refreshRoles: vi.fn() })),
}))

vi.mock('../../hooks/useDex', () => ({
  useDex: vi.fn(() => ({ balances: { stable: '4.99' }, loading: false })),
}))

vi.mock('../../hooks/useNetworkMode', () => ({
  useNetworkMode: vi.fn(() => ({ network: { chainId: 137, name: 'Polygon' } })),
}))

vi.mock('../../hooks/useRoleDetails', () => ({
  useRoleDetails: vi.fn(() => ({ roleDetails: [], loading: false, refresh: vi.fn() })),
}))

// Keep the REAL onrampAvailable (capability + env gate) — only the network calls are stubbed.
vi.mock('../../lib/onramp/onrampClient', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchOnrampOptions: vi.fn(), createOnrampSession: vi.fn() }
})

// The modal itself is covered by BuyCryptoModal.test.jsx; here only the wiring matters.
vi.mock('../../components/wallet/BuyCryptoModal', () => ({
  default: ({ isOpen, address, chainId }) =>
    isOpen ? <div role="dialog" aria-label="Buy Crypto Modal" data-address={address} data-chain={chainId} /> : null,
}))

vi.mock('../../components/ui/AddressQRModal', () => ({ default: () => null }))
vi.mock('../../components/ui/PremiumPurchaseModal', () => ({ default: () => null }))

import { useAccount, useChainId } from 'wagmi'
import { fetchOnrampOptions } from '../../lib/onramp/onrampClient'

const ADDRESS = '0x1234567890123456789012345678901234567890'
const VAULT = '0x9999999999999999999999999999999999999999'
const GW = 'https://gw.test'

const walletContext = {
  address: ADDRESS,
  account: ADDRESS,
  isConnected: true,
  roles: [],
  rolesLoading: false,
  hasRole: vi.fn(() => false),
  refreshRoles: vi.fn(),
  provider: null,
  signer: null,
}

function renderButton({ custody } = {}) {
  const ui = (
    <BrowserRouter>
      <ThemeContext.Provider value={{ theme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn() }}>
        <WalletContext.Provider value={walletContext}>
          <FriendMarketsContext.Provider value={{ friendMarkets: [] }}>
            <UIContext.Provider value={{ showModal: vi.fn(), hideModal: vi.fn(), modal: null }}>
              <WalletButton />
            </UIContext.Provider>
          </FriendMarketsContext.Provider>
        </WalletContext.Provider>
      </ThemeContext.Provider>
    </BrowserRouter>
  )
  if (!custody) return render(ui)
  // Optional custody overlay (spec 043): wrap with a CustodyContext value to act as a vault.
  return render(<CustodyContext.Provider value={custody}>{ui}</CustodyContext.Provider>)
}

const openSheet = async (user) => {
  await user.click(screen.getByRole('button', { name: /wallet account/i }))
  await screen.findByRole('menu')
}

beforeEach(() => {
  import.meta.env.VITE_RELAYER_URL = GW
  useAccount.mockReturnValue({ address: ADDRESS, isConnected: true })
  useChainId.mockReturnValue(137)
  fetchOnrampOptions.mockResolvedValue({ chainId: 137, available: true, assets: ['USDC'], defaultAsset: 'USDC' })
})
afterEach(() => {
  delete import.meta.env.VITE_RELAYER_URL
  vi.clearAllMocks()
})

describe('Buy button gating', () => {
  it('renders Buy on Polygon once the live catalog confirms, and opens the modal with the sheet address', async () => {
    const user = userEvent.setup()
    renderButton()
    await openSheet(user)
    const buy = await screen.findByRole('button', { name: /buy crypto with coinbase/i })
    await user.click(buy)
    const modal = await screen.findByRole('dialog', { name: /buy crypto modal/i })
    expect(modal).toHaveAttribute('data-address', ADDRESS) // destination === the address shown in the sheet
    expect(modal).toHaveAttribute('data-chain', '137')
    // Opening the modal closes the sheet.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('hidden when the gateway is unconfigured — the sheet is exactly as it is today', async () => {
    delete import.meta.env.VITE_RELAYER_URL
    const user = userEvent.setup()
    renderButton()
    await openSheet(user)
    expect(screen.queryByRole('button', { name: /buy crypto/i })).not.toBeInTheDocument()
    expect(fetchOnrampOptions).not.toHaveBeenCalled() // capability gate short-circuits, no traffic
  })

  it('hidden on testnets (80002, 63, Sepolia) — the static gate short-circuits', async () => {
    const user = userEvent.setup()
    for (const chainId of [80002, 63, 11155111]) {
      useChainId.mockReturnValue(chainId)
      const { unmount } = renderButton()
      await openSheet(user)
      expect(screen.queryByRole('button', { name: /buy crypto/i })).not.toBeInTheDocument()
      expect(fetchOnrampOptions).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('hidden when the live catalog reports the chain unavailable', async () => {
    fetchOnrampOptions.mockResolvedValue({ chainId: 137, available: false, assets: [], defaultAsset: null })
    const user = userEvent.setup()
    renderButton()
    await openSheet(user)
    await waitFor(() => expect(fetchOnrampOptions).toHaveBeenCalledWith(137))
    expect(screen.queryByRole('button', { name: /buy crypto/i })).not.toBeInTheDocument()
  })

  it('hidden when the catalog check fails (never a dead button)', async () => {
    fetchOnrampOptions.mockRejectedValue(new Error('gateway down'))
    const user = userEvent.setup()
    renderButton()
    await openSheet(user)
    await waitFor(() => expect(fetchOnrampOptions).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /buy crypto/i })).not.toBeInTheDocument()
  })

  it('operating as a vault delivers to the vault address (funds land where the member acts)', async () => {
    const user = userEvent.setup()
    renderButton({
      custody: {
        active: { mode: 'vault', vaultAddress: VAULT, chainId: 137 },
        operateAsPersonal: vi.fn(),
        operateAsVault: vi.fn(),
      },
    })
    await openSheet(user)
    await user.click(await screen.findByRole('button', { name: /buy crypto with coinbase/i }))
    const modal = await screen.findByRole('dialog', { name: /buy crypto modal/i })
    expect(modal).toHaveAttribute('data-address', VAULT)
  })
})
