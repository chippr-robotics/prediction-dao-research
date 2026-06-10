import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
