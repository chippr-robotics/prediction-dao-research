import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import CpAddressField from '../CpAddressField'
import { hostRef } from './_host'
vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))

// Spec 030 (US3/US5, FR-024) — the ClearPath address field wires the app's address book + QR scanner to any
// address entry. Stub the heavy app components (which need the wallet provider / camera) so this stays a
// focused wiring test: book pick → onChange(address); QR scan → extract → onChange(address); typing → onChange.

const A_BOOK = '0x00000000000000000000000000000000000000a1'
const A_SCAN = '0x00000000000000000000000000000000000000b2'


describe('CpAddressField (spec 030)', () => {
  it('typing forwards the raw string to onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={onChange} />)
    await user.type(screen.getByLabelText('Recipient'), '0x')
    expect(onChange).toHaveBeenCalledWith('0')
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('shows a "Self" button only when selfAddress is given, filling the field with it', async () => {
    const SELF = '0x00000000000000000000000000000000000000c3'
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<CpAddressField id="f1" label="Recipient" value="" onChange={onChange} />)
    expect(screen.queryByRole('button', { name: /^self$/i })).not.toBeInTheDocument()
    rerender(<CpAddressField id="f1" label="Recipient" value="" onChange={onChange} selfAddress={SELF} />)
    await user.click(screen.getByRole('button', { name: /^self$/i }))
    expect(onChange).toHaveBeenCalledWith(SELF)
  })

  it('disables the input when disabled', () => {
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={() => {}} disabled />)
    expect(screen.getByLabelText('Recipient')).toBeDisabled()
  })

  /*
   * Two affordances left in the mini-app conversion (spec 073 T028), for different reasons, and
   * both are pinned here so neither returns without the decision being re-made:
   *
   *   - the QR scanner, on SIZE: bundling it cost 710 KB of an 805 KB package — 88% of the bytes
   *     every member fetches, forever, for one convenience on a field they can paste into;
   *   - the address-book picker, on PRIVACY: it reads the member's contact list, and the value
   *     entered here is a DAO CONTRACT address, not a person.
   */
  it('offers neither an address-book picker nor a QR scanner', () => {
    render(<CpAddressField id="f1" label="Recipient" value="" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /scan qr code/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /address book|contacts/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(<CpAddressField id="f1" label="Recipient" value="" onChange={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
