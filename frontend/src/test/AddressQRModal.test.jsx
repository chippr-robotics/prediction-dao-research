import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import AddressQRModal from '../components/ui/AddressQRModal'

// Spec 011 — address QR modal contract (contracts/address-qr-ui-contract.md,
// M1–M10, A2). US1 covers the dialog shell (M1–M3, M10, A2); US2 adds
// copy/share (M4–M7); US3 adds color customization (M8–M9).

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const OTHER_ADDRESS = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
const STORAGE_KEY = 'fairwins_qrcolor_v1'

function renderModal(props = {}) {
  return render(
    <AddressQRModal isOpen onClose={vi.fn()} address={ADDRESS} {...props} />
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('AddressQRModal — dialog shell (US1)', () => {
  it('renders nothing when closed (M1)', () => {
    const { container } = renderModal({ isOpen: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a connect prompt — and no QR — when open without an address (M1)', () => {
    const { container } = renderModal({ address: '' })
    expect(container.querySelector('svg.address-qr-svg, .address-qr svg')).toBeNull()
    expect(screen.getByText(/connect/i)).toBeInTheDocument()
  })

  it('renders the QR, the full selectable address text, and dialog semantics when open (M2, M3)', () => {
    const { container } = renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby')
    // Heading that labels the dialog exists
    const headingId = dialog.getAttribute('aria-labelledby')
    expect(container.querySelector(`#${headingId}`)).toBeInTheDocument()
    // QR present
    expect(container.querySelector('.address-qr svg')).toBeInTheDocument()
    // Full address visible as text
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
  })

  it('closes on Escape (M3)', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click but not on inner content click (M3)', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })
    fireEvent.click(container.querySelector('.address-qr-modal'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector('.address-qr-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog on open and returns it to the trigger on close (M3)', () => {
    // jsdom supports element.focus()/document.activeElement; full tab-trap
    // behavior is verified manually per quickstart (analysis finding U1).
    function Harness() {
      return <button type="button">trigger</button>
    }
    const { getByText } = render(<Harness />)
    const trigger = getByText('trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = renderModal()
    expect(document.activeElement).not.toBe(trigger)
    expect(
      document.activeElement.closest('[role="dialog"]')
    ).not.toBeNull()

    unmount()
    expect(document.activeElement).toBe(trigger)
  })

  it('re-renders QR and text when the address changes while open (M10 / FR-009)', () => {
    const { container, rerender } = renderModal()
    const pathBefore = container
      .querySelector('.address-qr svg path:last-of-type')
      ?.getAttribute('d')
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()

    rerender(<AddressQRModal isOpen onClose={vi.fn()} address={OTHER_ADDRESS} />)
    expect(screen.queryByText(ADDRESS)).not.toBeInTheDocument()
    expect(screen.getByText(OTHER_ADDRESS)).toBeInTheDocument()
    const pathAfter = container
      .querySelector('.address-qr svg path:last-of-type')
      ?.getAttribute('d')
    expect(pathAfter).toBeTruthy()
    expect(pathAfter).not.toEqual(pathBefore)
  })

  it('applies the persisted color when opening (FR-007)', () => {
    localStorage.setItem(STORAGE_KEY, 'ocean')
    const { container } = renderModal()
    expect(container.querySelector('.address-qr svg').outerHTML.toUpperCase()).toContain(
      '#1E3A8A'
    )
  })

  it('has no axe violations while open (A2)', async () => {
    const { container } = renderModal()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// US2 — copy and share (M4–M7). The setup.js global clipboard mock always
// succeeds, so each test overrides navigator.clipboard / navigator.share
// explicitly (analysis finding U2).
const SHARE_TEXT = `My FairWins wallet address:\n${ADDRESS}`

function defineClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value,
  })
}

function defineShare(fn) {
  Object.defineProperty(navigator, 'share', {
    writable: true,
    configurable: true,
    value: fn,
  })
}

function removeShare() {
  if ('share' in navigator) {
    delete navigator.share
  }
}

describe('AddressQRModal — copy and share (US2)', () => {
  afterEach(() => {
    removeShare()
  })

  it('M4: Copy writes the exact address and shows visible confirmation', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    defineClipboard({ writeText })
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith(ADDRESS)

    expect(
      await screen.findByRole('button', { name: /copied!/i })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/copied/i)
    )
  })

  it('M5: clipboard rejection shows a visible inline error; the address stays selectable; no alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    defineClipboard({
      writeText: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
    })
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(
        /couldn.t copy|copy failed|doesn.t allow/i
      )
    )
    // Never a false success.
    expect(screen.queryByText(/copied!/i)).not.toBeInTheDocument()
    // Address text remains for manual copy.
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('M5: an absent clipboard API degrades the same way', async () => {
    defineClipboard(undefined)
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/couldn.t copy|doesn.t allow/i)
    )
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
  })

  it('M6: Share calls navigator.share with the exact text-only payload', async () => {
    const share = vi.fn(() => Promise.resolve())
    defineShare(share)
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    expect(share).toHaveBeenCalledTimes(1)
    // Exact object: text only — no url, no title (link previews mangle
    // addresses in messaging apps).
    expect(share).toHaveBeenCalledWith({ text: SHARE_TEXT })
  })

  it('M6: a user-cancelled share (AbortError) produces no error UI', async () => {
    const abort = new Error('cancelled')
    abort.name = 'AbortError'
    defineShare(vi.fn(() => Promise.reject(abort)))
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    // Give the rejection a tick to propagate, then assert silence.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('status')?.textContent || '').not.toMatch(/fail|error|couldn/i)
  })

  it('M7: without navigator.share, the Share button copies the full share payload with confirmation', async () => {
    removeShare()
    const writeText = vi.fn(() => Promise.resolve())
    defineClipboard({ writeText })
    renderModal()

    const shareButton = screen.getByRole('button', { name: /share/i })
    expect(shareButton).toBeInTheDocument()

    fireEvent.click(shareButton)
    expect(writeText).toHaveBeenCalledWith(SHARE_TEXT)
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/copied/i)
    )
  })
})
