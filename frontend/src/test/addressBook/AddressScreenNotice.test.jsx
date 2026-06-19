import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

const A1 = '0x1111111111111111111111111111111111111111'

let statusMap = {}
vi.mock('../../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({
    getStatus: (addr) => statusMap[addr?.toLowerCase()] || 'clear',
    screen: vi.fn(),
  }),
}))

import AddressScreenNotice from '../../components/ui/AddressScreenNotice'

describe('AddressScreenNotice (iteration 2)', () => {
  beforeEach(() => {
    statusMap = {}
  })

  it('warns when the address is restricted', () => {
    statusMap[A1.toLowerCase()] = 'restricted'
    render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(screen.getByText('Restricted')).toBeInTheDocument()
    expect(screen.getByText(/blocked on-chain/i)).toBeInTheDocument()
  })

  it('warns (uncertain) when the address cannot be screened', () => {
    statusMap[A1.toLowerCase()] = 'uncertain'
    render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(screen.getByText('Unscreened')).toBeInTheDocument()
  })

  it('renders nothing for a clear address', () => {
    const { container } = render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an empty/invalid address', () => {
    const { container } = render(<AddressScreenNotice address="" chainId={137} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has no accessibility violations', async () => {
    statusMap[A1.toLowerCase()] = 'restricted'
    const { container } = render(<AddressScreenNotice address={A1} chainId={137} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
