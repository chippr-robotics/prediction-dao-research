import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MarketAcceptanceModal from '../components/fairwins/MarketAcceptanceModal'

// Mock hooks
vi.mock('../hooks', () => ({
  useWallet: vi.fn(() => ({
    isConnected: true,
    account: '0x1234567890123456789012345678901234567890'
  })),
  useWeb3: vi.fn(() => ({
    signer: { provider: { getBalance: vi.fn() } },
    isCorrectNetwork: true,
    switchNetwork: vi.fn()
  }))
}))

import { useWallet, useWeb3 } from '../hooks'

// Test data
const CREATOR_ADDRESS = '0xCreator0000000000000000000000000000000001'
const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xOther00000000000000000000000000000000002'
const ARBITRATOR_ADDRESS = '0xArbitrator0000000000000000000000000000003'

const createMockMarketData = (overrides = {}) => ({
  description: 'Test market description for betting',
  creator: CREATOR_ADDRESS,
  participants: [CREATOR_ADDRESS, USER_ADDRESS],
  arbitrator: ARBITRATOR_ADDRESS,
  acceptanceDeadline: Date.now() + 86400000, // 24 hours from now
  stakePerParticipant: '10.00',
  stakeTokenSymbol: 'USC',
  marketType: '1v1',
  acceptances: {
    [CREATOR_ADDRESS.toLowerCase()]: { hasAccepted: true }
  },
  acceptedCount: 1,
  minAcceptanceThreshold: 2,
  ...overrides
})

describe('MarketAcceptanceModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    marketId: 'market-123',
    marketData: createMockMarketData(),
    onAccepted: vi.fn(),
    contractAddress: '0xContract000000000000000000000000000000001',
    contractABI: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    useWallet.mockReturnValue({
      isConnected: true,
      account: USER_ADDRESS
    })

    useWeb3.mockReturnValue({
      signer: { provider: { getBalance: vi.fn() } },
      isCorrectNetwork: true,
      switchNetwork: vi.fn()
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Modal Visibility', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <MarketAcceptanceModal {...defaultProps} isOpen={false} />
      )

      expect(container).toBeEmptyDOMElement()
    })

    it('should render when isOpen is true', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have correct ARIA attributes', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'ma-title')
    })

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn()
      render(<MarketAcceptanceModal {...defaultProps} onClose={onClose} />)

      const closeButton = screen.getByRole('button', { name: /close modal/i })
      await userEvent.click(closeButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when backdrop is clicked', async () => {
      const onClose = vi.fn()
      render(<MarketAcceptanceModal {...defaultProps} onClose={onClose} />)

      const backdrop = document.querySelector('.ma-modal-backdrop')
      fireEvent.click(backdrop)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Market Terms Display', () => {
    it('should display market description', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('Test market description for betting')).toBeInTheDocument()
    })

    it('should display stake amount formatted as USD', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('$10.00')).toBeInTheDocument()
    })

    it('should display creator address (truncated)', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      // Creator address truncated - may appear multiple times (in terms grid and participants list)
      const creatorAddresses = screen.getAllByText('0xCrea...0001')
      expect(creatorAddresses.length).toBeGreaterThan(0)
    })

    it('should display participant count', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should display acceptance progress', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })

    it('should display market type', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('1v1')).toBeInTheDocument()
    })

    it('should display encrypted notice for encrypted markets', () => {
      const marketData = createMockMarketData({ isEncrypted: true })
      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText('Encrypted Market')).toBeInTheDocument()
    })

    it('should display stake with non-stablecoin symbol', () => {
      const marketData = createMockMarketData({
        stakePerParticipant: '1.5',
        stakeTokenSymbol: 'ETC'
      })
      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText('1.5 ETC')).toBeInTheDocument()
    })
  })

  describe('Countdown Timer', () => {
    it('should display time remaining', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      // 24 hours remaining shows as "24h 0m remaining" or similar
      expect(screen.getByText(/remaining/i)).toBeInTheDocument()
    })

    it('should show "Expired" when deadline passed', () => {
      const marketData = createMockMarketData({
        acceptanceDeadline: Date.now() - 1000 // 1 second ago
      })
      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText('Expired')).toBeInTheDocument()
    })

    it('should format days when > 24 hours', () => {
      const marketData = createMockMarketData({
        acceptanceDeadline: Date.now() + 3 * 24 * 60 * 60 * 1000 // 3 days
      })
      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText(/\d+d.*remaining/)).toBeInTheDocument()
    })
  })

  describe('User Role Detection', () => {
    it('should identify user as participant', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      // User should see accept/decline buttons as they are a participant
      expect(screen.getByText('Accept Offer')).toBeInTheDocument()
      expect(screen.getByText('Decline Offer')).toBeInTheDocument()
    })

    it('should identify user as arbitrator', () => {
      useWallet.mockReturnValue({
        isConnected: true,
        account: ARBITRATOR_ADDRESS
      })
      const marketData = createMockMarketData({
        participants: [CREATOR_ADDRESS, OTHER_ADDRESS],
        arbitrator: ARBITRATOR_ADDRESS
      })

      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText('Accept Arbitrator Role')).toBeInTheDocument()
      expect(screen.getByText('Arbitrator (No Stake Required)')).toBeInTheDocument()
    })

    it('should identify user as creator', () => {
      useWallet.mockReturnValue({
        isConnected: true,
        account: CREATOR_ADDRESS
      })

      render(<MarketAcceptanceModal {...defaultProps} />)

      // Creator has already accepted (via market creation)
      expect(screen.getByText(/You created this offer/)).toBeInTheDocument()
    })

    it('should detect if already accepted', () => {
      const marketData = createMockMarketData({
        acceptances: {
          [CREATOR_ADDRESS.toLowerCase()]: { hasAccepted: true },
          [USER_ADDRESS.toLowerCase()]: { hasAccepted: true }
        }
      })

      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText(/You have already accepted/)).toBeInTheDocument()
    })

    it('should show not invited message for non-participants', () => {
      useWallet.mockReturnValue({
        isConnected: true,
        account: '0xNotInvited0000000000000000000000000000001'
      })

      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText(/You are not invited to this market/)).toBeInTheDocument()
    })
  })

  describe('Accept Flow', () => {
    it('should show review step initially', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('Review Market Offer')).toBeInTheDocument()
      expect(screen.getByText('Accept Offer')).toBeInTheDocument()
    })

    it('should transition to confirm step on accept click', async () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Accept Offer'))

      expect(screen.getByText('Confirm Offer Acceptance')).toBeInTheDocument()
      expect(screen.getByText('I Understand, Accept Offer')).toBeInTheDocument()
    })

    it('should show stake notice in confirm step', async () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Accept Offer'))

      expect(screen.getByText(/You are about to stake/)).toBeInTheDocument()
      // $10.00 appears multiple times in confirm step
      const stakeAmounts = screen.getAllByText('$10.00')
      expect(stakeAmounts.length).toBeGreaterThan(0)
    })

    it('should allow going back from confirm to review', async () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Accept Offer'))
      expect(screen.getByText('Confirm Offer Acceptance')).toBeInTheDocument()

      await userEvent.click(screen.getByText('Back'))
      expect(screen.getByText('Review Market Offer')).toBeInTheDocument()
    })

    it('should display safety warning in confirm step', async () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Accept Offer'))

      expect(screen.getByText('Important Safety Information')).toBeInTheDocument()
      expect(screen.getByText(/Only accept markets from people you know/)).toBeInTheDocument()
    })

    it('should call onClose when Decline Offer is clicked', async () => {
      const onClose = vi.fn()
      render(<MarketAcceptanceModal {...defaultProps} onClose={onClose} />)

      await userEvent.click(screen.getByText('Decline Offer'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Wallet Connection', () => {
    it('should show connect wallet message when not connected', () => {
      useWallet.mockReturnValue({
        isConnected: false,
        account: null
      })

      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText(/Please connect your wallet/)).toBeInTheDocument()
    })

    it('should not show accept buttons when not connected', () => {
      useWallet.mockReturnValue({
        isConnected: false,
        account: null
      })

      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.queryByText('Accept Offer')).not.toBeInTheDocument()
    })
  })

  describe('Expired Market Handling', () => {
    it('should show expired message', () => {
      const marketData = createMockMarketData({
        acceptanceDeadline: Date.now() - 1000
      })

      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.getByText('This offer has expired')).toBeInTheDocument()
    })

    it('should not show accept buttons when expired', () => {
      const marketData = createMockMarketData({
        acceptanceDeadline: Date.now() - 1000
      })

      render(<MarketAcceptanceModal {...defaultProps} marketData={marketData} />)

      expect(screen.queryByText('Accept Offer')).not.toBeInTheDocument()
    })
  })

  describe('Participants List', () => {
    it('should display all participants', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      // Both participants should be shown - "Participants" appears multiple times (label and heading)
      const participantsElements = screen.getAllByText('Participants')
      expect(participantsElements.length).toBeGreaterThan(0)
    })

    it('should mark creator with badge', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('Creator')).toBeInTheDocument()
    })

    it('should mark current user with "You" badge', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('You')).toBeInTheDocument()
    })

    it('should show accepted status for participants who accepted', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('✓ Accepted')).toBeInTheDocument()
    })

    it('should show pending status for participants who have not accepted', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByText('⏳ Pending')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have role="dialog"', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have aria-modal="true"', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('should have close button with aria-label', () => {
      render(<MarketAcceptanceModal {...defaultProps} />)

      const closeButton = screen.getByRole('button', { name: /close modal/i })
      expect(closeButton).toHaveAttribute('aria-label', 'Close modal')
    })
  })
})
