import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import QRScanner from '../components/ui/QRScanner'

// Mock html5-qrcode
vi.mock('html5-qrcode', () => {
  const Html5QrcodeScannerState = {
    UNKNOWN: 0,
    NOT_STARTED: 1,
    SCANNING: 2,
    PAUSED: 3,
  }

  function MockHtml5QrcodeImpl() {
    let state = Html5QrcodeScannerState.NOT_STARTED
    return {
      start: vi.fn().mockImplementation(async () => {
        state = Html5QrcodeScannerState.SCANNING
      }),
      stop: vi.fn().mockImplementation(async () => {
        if (
          state !== Html5QrcodeScannerState.SCANNING &&
          state !== Html5QrcodeScannerState.PAUSED
        ) {
          throw new Error('Cannot stop, scanner is not running or paused.')
        }
        state = Html5QrcodeScannerState.NOT_STARTED
      }),
      getState: vi.fn(() => state),
    }
  }
  const MockHtml5Qrcode = vi.fn().mockImplementation(function () {
    return MockHtml5QrcodeImpl()
  })
  MockHtml5Qrcode.getCameras = vi.fn().mockResolvedValue([
    { id: 'camera1', label: 'Mock Camera 1' },
    { id: 'camera2', label: 'Mock Back Camera' }
  ])

  return {
    Html5Qrcode: MockHtml5Qrcode,
    Html5QrcodeScannerState,
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

    it('renders the scanner dialog when isOpen is true', () => {
      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('renders only the camera view chrome — no instructional text', () => {
      const { container } = render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )
      // The modal exposes the close button (a symbol) and the camera target;
      // no headings, instructions, or privacy notes should appear.
      expect(container.querySelectorAll('h1, h2, h3, p, ol, ul, li')).toHaveLength(0)
      expect(container.querySelector('#qr-reader')).toBeInTheDocument()
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

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })

    it('does not log "Cannot stop" when closing before scanner has started', async () => {
      const user = userEvent.setup()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <QRScanner
          isOpen={true}
          onClose={mockOnClose}
          onScanSuccess={mockOnScanSuccess}
        />
      )

      // Close immediately — before start() has resolved, the scanner is in
      // NOT_STARTED. Previously this would surface the html5-qrcode error.
      const closeButton = screen.getByLabelText('Close QR scanner')
      await user.click(closeButton)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })

      const stopCalls = consoleErrorSpy.mock.calls.filter((args) =>
        args.some(
          (arg) =>
            typeof arg === 'string' && arg.includes('Error stopping scanner')
        )
      )
      expect(stopCalls).toHaveLength(0)

      consoleErrorSpy.mockRestore()
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

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
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

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
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
      expect(dialog).toHaveAttribute('aria-label', 'QR code scanner')
    })
  })

  describe('Error Handling', () => {
    it('shows a visible camera-error message (not just aria-label) when access fails', async () => {
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
        const alert = screen.getByRole('alert')
        expect(alert).toBeInTheDocument()
        // The message is rendered as visible text (Spec 010 follow-up), not aria-label only.
        expect(alert).toHaveTextContent(/camera/i)
        expect(alert).not.toHaveAttribute('aria-label')
      })
      // A permissions hint is shown so a real denial isn't a cryptic triangle.
      expect(screen.getByText(/allow camera access/i)).toBeInTheDocument()
    })
  })
})
