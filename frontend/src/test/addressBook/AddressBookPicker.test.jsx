import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import AddressBookPicker from '../../components/ui/AddressBookPicker'

const A1 = '0x1111111111111111111111111111111111111111'
const A2 = '0x2222222222222222222222222222222222222222'

const entries = [
  { contactId: 'c1', nickname: 'Alex', address: A1, chainId: 137 },
  { contactId: 'c2', nickname: 'Sanctioned', address: A2, chainId: 137 },
]

describe('AddressBookPicker', () => {
  it('lists results with a per-result restriction tag (FR-015)', () => {
    const getStatus = (addr) => (addr === A2 ? 'restricted' : 'clear')
    render(<AddressBookPicker entries={entries} getStatus={getStatus} networkName={() => 'Polygon'} />)
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Sanctioned')).toBeInTheDocument()
    expect(screen.getByText('Restricted')).toBeInTheDocument()
  })

  it('calls onSelect with the chosen entry (FR-016)', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<AddressBookPicker entries={entries} onSelect={onSelect} />)
    await user.click(screen.getByText('Alex'))
    expect(onSelect).toHaveBeenCalledWith(entries[0])
  })

  it('renders nothing for an empty book (edge case)', () => {
    const { container } = render(<AddressBookPicker entries={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<AddressBookPicker entries={entries} networkName={() => 'Polygon'} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
