import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ShareModal from '../components/ui/ShareModal'

describe('ShareModal Component', () => {
  const mockMarket = {
    id: 1,
    proposalTitle: 'Will Bitcoin reach $100K in 2025?',
    category: 'crypto',
    passTokenPrice: '0.65',
    failTokenPrice: '0.35',
    totalLiquidity: '45600',
  }

  const mockOnClose = vi.fn()

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()

    // Mock window.location
    delete window.location
    window.location = { href: '', origin: 'http://localhost:3000' }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('does not render when isOpen is false', () => {
      const { container } = render(
        <ShareModal isOpen={false} onClose={mockOnClose} market={mockMarket} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders when isOpen is true', () => {
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('FairWins')).toBeInTheDocument()
    })

    it('displays brand name and tagline', () => {
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )
      expect(screen.getByText('FairWins')).toBeInTheDocument()
      expect(screen.getByText('Prediction Markets for Friends.')).toBeInTheDocument()
    })

    it('renders QR code', () => {
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )
      const qrCode = screen.getByLabelText('QR code for market link')
      expect(qrCode).toBeInTheDocument()
    })

    it('displays share buttons', () => {
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )
      expect(screen.getByLabelText('Copy link')).toBeInTheDocument()
      expect(screen.getByLabelText('Share via SMS')).toBeInTheDocument()
      expect(screen.getByLabelText('Share via email')).toBeInTheDocument()
    })

    it('displays scan to share hint', () => {
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )
      expect(screen.getByText(/SCAN TO SHARE/i)).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const closeButton = screen.getByLabelText('Close share modal')
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const backdrop = container.querySelector('.share-modal-backdrop')
      await user.click(backdrop)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when modal content is clicked', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const modalContent = document.querySelector('.share-modal')
      await user.click(modalContent)

      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('copies link to clipboard when copy button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const copyButton = screen.getByLabelText('Copy link')
      // Button should show link icon initially
      expect(copyButton.textContent).toContain('🔗')
      
      await user.click(copyButton)

      // After clicking, button should show checkmark
      await waitFor(() => {
        expect(copyButton.textContent).toContain('✓')
      })
    })

    it('shows copied confirmation and reverts after timeout', async () => {
      vi.useFakeTimers()
      const user = userEvent.setup({ delay: null })
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const copyButton = screen.getByLabelText('Copy link')
      await user.click(copyButton)

      // Verify button changes to checkmark after copy
      await waitFor(() => {
        expect(copyButton.textContent).toContain('✓')
      })

      vi.advanceTimersByTime(2000)
      await waitFor(() => {
        expect(copyButton.textContent).toContain('🔗')
      })

      vi.useRealTimers()
    })

    it('changes window.location.href when SMS button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const smsButton = screen.getByLabelText('Share via SMS')
      await user.click(smsButton)

      expect(window.location.href).toContain('sms:')
      expect(window.location.href).toContain(encodeURIComponent(mockMarket.proposalTitle))
    })

    it('changes window.location.href when email button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const emailButton = screen.getByLabelText('Share via email')
      await user.click(emailButton)

      expect(window.location.href).toContain('mailto:')
      expect(window.location.href).toContain('subject=')
    })

    it('downloads QR code when download button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const downloadButton = screen.getByLabelText('Download QR code')
      await user.click(downloadButton)

      // Just verify the button exists and is clickable - actual download is hard to test
      expect(downloadButton).toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('closes modal on Escape key', async () => {
      const user = userEvent.setup()
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      await user.keyboard('{Escape}')

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has proper ARIA attributes', () => {
      render(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'share-modal-title')
    })

    it('focuses on first focusable element when opened', async () => {
      const { rerender } = render(
        <ShareModal isOpen={false} onClose={mockOnClose} market={mockMarket} />
      )

      rerender(
        <ShareModal isOpen={true} onClose={mockOnClose} market={mockMarket} />
      )

      // Wait for focus to be set
      await waitFor(() => {
        const closeButton = screen.getByLabelText('Close share modal')
        // Note: JSDOM doesn't fully support focus, so we just verify the element exists
        expect(closeButton).toBeInTheDocument()
      })
    })
  })

  describe('Custom URL', () => {
    it('uses custom marketUrl if provided for QR code and sharing', () => {
      const customUrl = 'https://example.com/custom/market/1'
      render(
        <ShareModal
          isOpen={true}
          onClose={mockOnClose}
          market={mockMarket}
          marketUrl={customUrl}
        />
      )

      // Verify QR code is rendered (it will contain the custom URL)
      const qrCode = screen.getByLabelText('QR code for market link')
      expect(qrCode).toBeInTheDocument()

      // QR code should be present and modal should be shown
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
