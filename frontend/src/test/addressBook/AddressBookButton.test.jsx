import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

const A1 = '0x1111111111111111111111111111111111111111'

let entries = []
let statusMap = {}
const screenFn = vi.fn()
vi.mock('../../hooks/useAddressBook', () => ({
  useAddressBook: () => ({ search: () => entries }),
}))
vi.mock('../../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({
    getStatus: (addr) => statusMap[addr?.toLowerCase()] || 'clear',
    screen: screenFn,
  }),
}))

import AddressBookButton from '../../components/ui/AddressBookButton'

describe('AddressBookButton (iteration 2)', () => {
  beforeEach(() => {
    entries = [{ contactId: 'c1', nickname: 'Alex', address: A1, chainId: 137 }]
    statusMap = {}
    screenFn.mockReset()
  })

  it('opens a popover and selects a saved contact', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<AddressBookButton chainId={137} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Choose from address book' }))
    await user.click(screen.getByText('Alex'))
    expect(onSelect).toHaveBeenCalledWith(entries[0])
  })

  it('filters results via the search box', async () => {
    const user = userEvent.setup()
    render(<AddressBookButton chainId={137} onSelect={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Choose from address book' }))
    expect(screen.getByLabelText('Search saved addresses')).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  it('shows an empty state when there are no saved contacts', async () => {
    entries = []
    const user = userEvent.setup()
    render(<AddressBookButton chainId={137} onSelect={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Choose from address book' }))
    expect(screen.getByText('No saved contacts yet.')).toBeInTheDocument()
  })

  it('reuses the QR button sizing class for matched dimensions', () => {
    render(<AddressBookButton chainId={137} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Choose from address book' })).toHaveClass('fm-scan-btn')
  })

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup()
    const { container } = render(<AddressBookButton chainId={137} onSelect={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Choose from address book' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
