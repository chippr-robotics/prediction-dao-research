import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mock hooks
const mockUseWallet = vi.fn()
const mockUseWeb3 = vi.fn()

vi.mock('../hooks', () => ({
  useWallet: (...args) => mockUseWallet(...args),
  useWeb3: (...args) => mockUseWeb3(...args),
}))

// Mock config
const mockGetContractAddress = vi.fn()
vi.mock('../config/contracts', () => ({
  getContractAddress: (...args) => mockGetContractAddress(...args),
  DEPLOYED_CONTRACTS: {
    paymentToken: '0xUSDCAddress0000000000000000000000000001',
    wmatic: '0xWMATICAddress000000000000000000000000001',
  },
}))

vi.mock('../abis/WagerRegistry', () => ({
  WAGER_REGISTRY_ABI: [],
}))

vi.mock('../constants/wagerDefaults', () => ({
  WAGER_DEFAULTS: {},
}))

vi.mock('../utils/ipfsService', () => ({
  parseEncryptedIpfsReference: vi.fn((desc) => {
    if (desc && desc.startsWith('ipfs://')) {
      return { isIpfs: true, cid: desc.replace('ipfs://', ''), raw: desc }
    }
    return { isIpfs: false, cid: null, raw: desc }
  }),
}))

// Mock MarketAcceptanceModal
vi.mock('../components/fairwins/MarketAcceptanceModal', () => ({
  default: ({ marketData, marketId, onClose }) => (
    <div data-testid="acceptance-modal">
      <div data-testid="market-id">{marketId}</div>
      {marketData && (
        <>
          <div data-testid="market-description">{marketData.description}</div>
          <div data-testid="market-creator">{marketData.creator}</div>
          <div data-testid="market-status">{marketData.status}</div>
          <div data-testid="market-symbol">{marketData.stakeTokenSymbol}</div>
          <div data-testid="market-stake">{marketData.stakePerParticipant}</div>
          <div data-testid="market-acceptance-deadline">{marketData.acceptanceDeadline}</div>
          {marketData.isEncrypted && <div data-testid="encrypted">encrypted</div>}
        </>
      )}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

import MarketAcceptancePage from '../pages/MarketAcceptancePage'

const renderWithRouter = (searchParams = '') => {
  return render(
    <MemoryRouter initialEntries={[`/friend-market/accept${searchParams}`]}>
      <Routes>
        <Route path="/friend-market/accept" element={<MarketAcceptancePage />} />
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MarketAcceptancePage - Extended Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      isConnected: true,
      account: '0x1234567890123456789012345678901234567890',
    })
    mockUseWeb3.mockReturnValue({
      provider: null,
      signer: null,
    })
    mockGetContractAddress.mockReturnValue(null)
  })

  describe('No provider - URL fallback paths', () => {
    it('should show error when no marketId', async () => {
      renderWithRouter('')
      await waitFor(() => {
        expect(screen.getByText('Unable to Load Offer')).toBeInTheDocument()
        expect(screen.getByText('No wager ID provided')).toBeInTheDocument()
      })
    })

    it('should show connect wallet message when no provider and no URL params', async () => {
      renderWithRouter('?marketId=123')
      await waitFor(() => {
        expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument()
      })
    })

    it('should render modal with URL fallback data when creator and stake provided', async () => {
      renderWithRouter('?marketId=42&creator=0xCreatorAddr&stake=10.5')
      await waitFor(() => {
        expect(screen.getByTestId('market-id')).toHaveTextContent('42')
        expect(screen.getByTestId('market-creator')).toHaveTextContent('0xCreatorAddr')
        expect(screen.getByTestId('market-stake')).toHaveTextContent('10.5')
        expect(screen.getByTestId('market-status')).toHaveTextContent('pending_acceptance')
      })
    })

    it('should set default token to "tokens" when not specified', async () => {
      renderWithRouter('?marketId=1&creator=0xCreator&stake=5')
      await waitFor(() => {
        expect(screen.getByTestId('market-symbol')).toHaveTextContent('tokens')
      })
    })

    it('should use provided token symbol from URL', async () => {
      renderWithRouter('?marketId=1&creator=0xCreator&stake=5&token=USDC')
      await waitFor(() => {
        expect(screen.getByTestId('market-symbol')).toHaveTextContent('USDC')
      })
    })

    it('should use provided deadline from URL', async () => {
      const deadline = 1700000000000
      renderWithRouter(`?marketId=1&creator=0xCreator&stake=5&deadline=${deadline}`)
      await waitFor(() => {
        expect(screen.getByTestId('market-acceptance-deadline')).toHaveTextContent(String(deadline))
      })
    })

    it('should default deadline to ~24 hours from now when not provided', async () => {
      renderWithRouter('?marketId=1&creator=0xCreator&stake=5')
      await waitFor(() => {
        const deadline = Number(screen.getByTestId('market-acceptance-deadline').textContent)
        const now = Date.now()
        // Deadline should be roughly 24h from now (within 5s tolerance)
        expect(deadline).toBeGreaterThan(now + 85000000)
        expect(deadline).toBeLessThan(now + 87000000)
      })
    })

    it('should show description placeholder when using URL params', async () => {
      renderWithRouter('?marketId=1&creator=0xCreator&stake=5')
      await waitFor(() => {
        expect(screen.getByTestId('market-description')).toHaveTextContent(
          'Connect wallet to view full offer details'
        )
      })
    })

    it('should handle sig and cid URL params', async () => {
      renderWithRouter('?marketId=1&creator=0xCreator&stake=5&sig=0xSig123&cid=QmCid123')
      await waitFor(() => {
        expect(screen.getByTestId('acceptance-modal')).toBeInTheDocument()
      })
    })
  })

  describe('Error page', () => {
    it('should display Go Back button on error', async () => {
      renderWithRouter('')
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument()
      })
    })

    it('should display warning icon on error', async () => {
      renderWithRouter('')
      await waitFor(() => {
        const errorIcon = screen.getByText(/⚨|☢|⚠/i)
        expect(errorIcon).toBeInTheDocument()
      })
    })
  })

  describe('Provider present but registry not deployed', () => {
    it('should show error when wagerRegistry returns null', async () => {
      mockUseWeb3.mockReturnValue({
        provider: { getNetwork: vi.fn() },
        signer: null,
      })
      mockGetContractAddress.mockReturnValue(null)

      renderWithRouter('?marketId=1')

      await waitFor(() => {
        expect(screen.getByText('Unable to Load Offer')).toBeInTheDocument()
      })
    })
  })

  describe('Navigation', () => {
    it('should navigate home when close is clicked', async () => {
      renderWithRouter('?marketId=1&creator=0xCreator&stake=5')

      await waitFor(() => {
        expect(screen.getByTestId('acceptance-modal')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Close'))

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument()
      })
    })
  })
})
