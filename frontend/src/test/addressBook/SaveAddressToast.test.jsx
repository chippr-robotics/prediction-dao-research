import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

const A1 = '0x1111111111111111111111111111111111111111'

let findResult = null
const addContact = vi.fn()
vi.mock('../../hooks/useAddressBook', () => ({
  useAddressBook: () => ({
    findByAddress: () => findResult,
    addContact,
  }),
}))

import SaveAddressToast from '../../components/ui/SaveAddressToast'

describe('SaveAddressToast (US4)', () => {
  beforeEach(() => {
    findResult = null
    addContact.mockReset()
  })

  it('prompts for an unsaved address and saves it (FR-017)', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<SaveAddressToast address={A1} chainId={137} onSaved={onSaved} />)
    expect(screen.getByText(/to your address book/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Contact nickname'), 'Alex')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(addContact).toHaveBeenCalledWith({
      nickname: 'Alex',
      addresses: [{ address: A1, chainId: 137, notes: '' }],
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('renders nothing for an already-saved address (FR-017)', () => {
    findResult = { contact: { id: 'x', nickname: 'Known' } }
    const { container } = render(<SaveAddressToast address={A1} chainId={137} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dismiss is a no-op that does not save (FR-018)', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<SaveAddressToast address={A1} chainId={137} onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(addContact).not.toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalled()
    expect(screen.queryByLabelText('Contact nickname')).not.toBeInTheDocument()
  })

  it('renders nothing for an invalid address', () => {
    const { container } = render(<SaveAddressToast address="nope" chainId={137} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<SaveAddressToast address={A1} chainId={137} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
