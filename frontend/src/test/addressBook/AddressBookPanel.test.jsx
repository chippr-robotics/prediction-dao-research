import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

// Wallet: a fixed connected account.
let walletState = {
  address: '0x1111111111111111111111111111111111111111',
  chainId: 137,
  provider: {},
  signer: { signMessage: vi.fn() },
}
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => walletState,
}))

// Screening: controllable status map.
let statusMap = {}
vi.mock('../../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({
    getStatus: (address) => statusMap[address.toLowerCase()] || 'clear',
    screen: vi.fn(),
    anyRestricted: () => false,
  }),
}))

import AddressBookPanel from '../../components/account/AddressBookPanel'

const ADDR = '0x2222222222222222222222222222222222222222'

describe('AddressBookPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    statusMap = {}
    walletState = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 137,
      provider: {},
      signer: { signMessage: vi.fn() },
    }
  })

  it('shows the empty state then creates a contact (FR-001, FR-004)', async () => {
    const user = userEvent.setup()
    render(<AddressBookPanel address={walletState.address} />)
    expect(screen.getByText(/No saved contacts yet/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add contact' }))
    await user.type(screen.getByLabelText('Nickname *'), 'Alex')
    await user.type(screen.getByLabelText('Address *'), ADDR)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  it('persists across remount (FR-006)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<AddressBookPanel address={walletState.address} />)
    await user.click(screen.getByRole('button', { name: 'Add contact' }))
    await user.type(screen.getByLabelText('Nickname *'), 'Alex')
    await user.type(screen.getByLabelText('Address *'), ADDR)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Alex')).toBeInTheDocument()
    unmount()

    render(<AddressBookPanel address={walletState.address} />)
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  it('shows a no-wallet state when disconnected', () => {
    walletState = { address: null, chainId: 137, provider: null, signer: null }
    render(<AddressBookPanel address={null} />)
    expect(screen.getByText(/Connect your wallet/)).toBeInTheDocument()
  })

  it('flags a restricted address and marks the contact (FR-010, FR-012)', async () => {
    const user = userEvent.setup()
    statusMap[ADDR.toLowerCase()] = 'restricted'
    render(<AddressBookPanel address={walletState.address} />)
    await user.click(screen.getByRole('button', { name: 'Add contact' }))
    await user.type(screen.getByLabelText('Nickname *'), 'Sanctioned')
    await user.type(screen.getByLabelText('Address *'), ADDR)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const card = screen.getByText('Sanctioned').closest('.ab-contact-card')
    // Restricted tag appears both at contact level and on the address row.
    expect(within(card).getAllByText('Restricted').length).toBeGreaterThanOrEqual(1)
  })

  it('has no accessibility violations with a contact present', async () => {
    const user = userEvent.setup()
    const { container } = render(<AddressBookPanel address={walletState.address} />)
    await user.click(screen.getByRole('button', { name: 'Add contact' }))
    await user.type(screen.getByLabelText('Nickname *'), 'Alex')
    await user.type(screen.getByLabelText('Address *'), ADDR)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
