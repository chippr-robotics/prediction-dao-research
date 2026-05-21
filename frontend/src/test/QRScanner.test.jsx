import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import QRScanner from '../components/ui/QRScanner'

// Mock html5-qrcode
vi.mock('html5-qrcode', () => {
  const MockHtml5Qrcode = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }))
  MockHtml5Qrcode.getCameras = vi.fn().mockResolvedValue([
    { id: 'camera1', label: 'Mock Camera 1' },
    { id: 'camera2', label: 'Mock Back Camera' }
  ])
  
  return {
    Html5Qrcode: MockHtml5Qrcode
  }
})

describe('QRScanner Component', () => {
  const mockOnClose = vi.fn()
  const mockOnScanSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('does not render when isOpen is false', () => {
      const { container } = render(
        <QRScanner
          isOpen={false}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders when isOpen is true', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Scan QR Code')).toBeInTheDocument()
    })

    it('shows a starting/detecting indicator before the camera is live', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      // Auto-start UX: the user never sees a "press to scan" landing page —
      // either we're detecting cameras or we're starting the stream.
      expect(
        screen.getByText(/Detecting cameras…|Starting camera…/)
      ).toBeInTheDocument()
    })

    it('displays scanner instructions', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      expect(screen.getByText('How to Scan')).toBeInTheDocument()
      expect(screen.getByText(/Allow camera access when prompted/i)).toBeInTheDocument()
    })

    it('displays privacy note', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      expect(
        screen.getByText(/Your camera feed is processed locally/i)
      ).toBeInTheDocument()
    })

    it('does not render a manual "Start Scanning" button (scanning auto-starts)', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      expect(screen.queryByLabelText('Start scanning QR code')).not.toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      const closeButton = screen.getByLabelText('Close QR scanner')
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      const backdrop = container.querySelector('.qr-scanner-backdrop')
      await user.click(backdrop)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when modal content is clicked', async () => {
      const user = userEvent.setup()
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      const modalContent = document.querySelector('.qr-scanner-modal')
      await user.click(modalContent)

      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Keyboard Navigation', () => {
    it('closes modal on Escape key', async () => {
      const user = userEvent.setup()
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      await user.keyboard('{Escape}')

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has proper ARIA attributes', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'qr-scanner-title')
    })
  })

  describe('Error Handling', () => {
    it('displays error message when camera access fails', async () => {
      const { Html5Qrcode } = await import('html5-qrcode')
      Html5Qrcode.getCameras = vi.fn().mockRejectedValue(new Error('No cameras'))

      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      await waitFor(() => {
        expect(
          screen.getByText(/Unable to access camera/i)
        ).toBeInTheDocument()
      })
    })
  })
})
