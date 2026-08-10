// Spec 068 (US5, T033) — the shared Protect address entry: paste, address book, and QR scan, with
// the platform's validation/labelling contract. Owner addresses are the highest-stakes addresses a
// member types, so all three entry paths must work and none may be a bare hand-typed input.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'

const BOOK_ENTRY = { address: '0x2222222222222222222222222222222222222222', name: 'Bob' }
const SCANNED = '0x3333333333333333333333333333333333333333'

let scannerProps = null

vi.mock('../../components/ui/AddressInput', () => ({
  default: ({ id, value, onChange, placeholder, disabled }) => (
    <input id={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
  ),
}))
vi.mock('../../components/ui/AddressBookButton', () => ({
  default: ({ onSelect, disabled }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect(BOOK_ENTRY)}>
      Address book
    </button>
  ),
}))
vi.mock('../../components/ui/QRScanner', () => ({
  default: (props) => {
    scannerProps = props
    return props.isOpen ? <div data-testid="qr-scanner" /> : null
  },
}))
vi.mock('../../lib/addressBook/scanAddress', () => ({
  extractAddressFromScan: (text) => (text === 'garbage' ? null : SCANNED),
}))

import CustodyAddressField from '../../components/custody/CustodyAddressField'

beforeEach(() => {
  scannerProps = null
})

describe('CustodyAddressField', () => {
  it('reports typed input as a raw address string, not an event', () => {
    const onChange = vi.fn()
    render(<CustodyAddressField id="owner-0" label="Owner 1 address" value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Owner 1 address'), { target: { value: '0xabc' } })
    expect(onChange).toHaveBeenCalledWith('0xabc')
  })

  it('fills the field from an address-book pick (FR-006)', () => {
    const onChange = vi.fn()
    render(<CustodyAddressField id="owner-0" label="Owner" value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /address book/i }))
    expect(onChange).toHaveBeenCalledWith(BOOK_ENTRY.address)
  })

  it('fills the field from a QR scan and closes the scanner', () => {
    const onChange = vi.fn()
    render(<CustodyAddressField id="owner-0" label="Owner" value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /scan qr code/i }))
    expect(screen.getByTestId('qr-scanner')).toBeInTheDocument()

    scannerProps.onScanSuccess('ethereum:0x3333333333333333333333333333333333333333')
    expect(onChange).toHaveBeenCalledWith(SCANNED)
  })

  it('ignores a QR payload that carries no address', () => {
    const onChange = vi.fn()
    render(<CustodyAddressField id="owner-0" label="Owner" value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /scan qr code/i }))
    scannerProps.onScanSuccess('garbage')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers a self-fill only when a self address is supplied', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CustodyAddressField id="o" label="Owner" value="" onChange={onChange} />)
    expect(screen.queryByRole('button', { name: /^self$/i })).not.toBeInTheDocument()

    rerender(<CustodyAddressField id="o" label="Owner" value="" onChange={onChange} selfAddress={BOOK_ENTRY.address} />)
    fireEvent.click(screen.getByRole('button', { name: /^self$/i }))
    expect(onChange).toHaveBeenCalledWith(BOOK_ENTRY.address)
  })

  it('disables every entry path when disabled', () => {
    render(<CustodyAddressField id="o" label="Owner" value="" onChange={vi.fn()} disabled selfAddress={BOOK_ENTRY.address} />)
    expect(screen.getByLabelText('Owner')).toBeDisabled()
    expect(screen.getByRole('button', { name: /address book/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /scan qr code/i })).toBeDisabled()
  })

  it('keeps the label available to screen readers when visually hidden', () => {
    render(<CustodyAddressField id="owner-2" label="Owner 3 address" srOnlyLabel value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Owner 3 address')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <CustodyAddressField id="owner-0" label="Owner 1 address" value="" onChange={vi.fn()} hint="Owners can approve" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
