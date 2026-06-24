import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import CpAddressField from '../CpAddressField'

// Spec 030 (US3/US5, FR-024) — the ClearPath address field wires the app's address book + QR scanner to any
// address entry. Stub the heavy app components (which need the wallet provider / camera) so this stays a
// focused wiring test: book pick → onChange(address); QR scan → extract → onChange(address); typing → onChange.

const A_BOOK = '0x00000000000000000000000000000000000000a1'
const A_SCAN = '0x00000000000000000000000000000000000000b2'

vi.mock('../../ui/AddressBookButton', () => ({
  default: ({ onSelect, disabled }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect({ address: A_BOOK })}>
      book-pick
    </button>
  ),
}))
vi.mock('../../ui/QRScanner', () => ({
  default: ({ isOpen, onScanSuccess }) =>
    isOpen ? (
      // emit an EIP-681 URI to prove the extractor pulls the bare address out
      <button type="button" onClick={() => onScanSuccess(`ethereum:${A_SCAN}`)}>
        scan-emit
      </button>
    ) : null,
}))

describe('CpAddressField (spec 030)', () => {
  it('typing forwards the raw string to onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={onChange} />)
    await user.type(screen.getByLabelText('Recipient'), '0x')
    expect(onChange).toHaveBeenCalledWith('0')
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('picking from the address book fills the field with the contact address', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={onChange} />)
    await user.click(screen.getByText('book-pick'))
    expect(onChange).toHaveBeenCalledWith(A_BOOK)
  })

  it('scanning a QR code extracts the address from the payload and fills the field', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={onChange} />)
    // scanner is closed until the scan button is pressed
    expect(screen.queryByText('scan-emit')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /scan qr code/i }))
    await user.click(screen.getByText('scan-emit'))
    expect(onChange).toHaveBeenCalledWith(A_SCAN)
  })

  it('disables the input and affordances when disabled', () => {
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={() => {}} disabled />)
    expect(screen.getByLabelText('Recipient')).toBeDisabled()
    expect(screen.getByText('book-pick')).toBeDisabled()
    expect(screen.getByRole('button', { name: /scan qr code/i })).toBeDisabled()
  })

  it('has no axe violations', async () => {
    const { container } = render(<CpAddressField id="f1" label="Recipient" value="" onChange={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
