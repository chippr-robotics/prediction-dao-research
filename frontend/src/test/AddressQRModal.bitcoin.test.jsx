import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddressQRModal from '../components/ui/AddressQRModal'

// Controllable useBitcoinWallet mock — the modal is a pure consumer.
const mockBtc = vi.fn()
vi.mock('../hooks/useBitcoinWallet', () => ({
  useBitcoinWallet: () => mockBtc(),
}))

// Deterministic QR stub exposing its payload for assertions.
vi.mock('../components/ui/AddressQRCode', () => ({
  default: ({ value, ariaLabel }) => (
    <div data-testid="qr-stub" data-value={value} aria-label={ariaLabel} />
  ),
}))

const receiveBase = {
  preferredType: 'segwit',
  setPreferredType: vi.fn(),
  nextReceiveAddress: vi.fn(),
  select: vi.fn(),
}

function btcState({ receive: receiveOver, ...rest } = {}) {
  return {
    status: 'ready',
    reason: null,
    networkId: 'bitcoin',
    receive: {
      ...receiveBase,
      current: { address: 'bc1qexampleaddr0', type: 'segwit', index: 0 },
      uri: 'bitcoin:bc1qexampleaddr0',
      ...receiveOver,
    },
    unlock: vi.fn(async () => ({ ok: true })),
    ...rest,
  }
}

const openModal = () =>
  render(<AddressQRModal isOpen onClose={vi.fn()} address="0xEvmAddr" mode="bitcoin" />)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AddressQRModal bitcoin mode (spec 061 US1 — FR-004/006/007)', () => {
  it('shows the rotating address as BIP-21 QR with explicit Bitcoin labeling', () => {
    mockBtc.mockReturnValue(btcState())
    openModal()
    expect(screen.getByText('Your Bitcoin address')).toBeInTheDocument()
    expect(screen.getByText(/Bitcoin — Mainnet/)).toBeInTheDocument()
    expect(screen.getByTestId('qr-stub').dataset.value).toBe('bitcoin:bc1qexampleaddr0')
    expect(screen.getByText('bc1qexampleaddr0')).toBeInTheDocument()
    // never the EVM address in bitcoin mode (FR-007)
    expect(screen.queryByText(/0xEvmAddr/)).not.toBeInTheDocument()
  })

  it('testnet is labeled distinctly (FR-021)', () => {
    mockBtc.mockReturnValue(btcState({ networkId: 'bitcoin-testnet' }))
    openModal()
    expect(screen.getByText(/Bitcoin — Testnet4/)).toBeInTheDocument()
  })

  it('"New address" issues the next rotation index', () => {
    const state = btcState()
    mockBtc.mockReturnValue(state)
    openModal()
    fireEvent.click(screen.getByRole('button', { name: 'New address' }))
    expect(state.receive.nextReceiveAddress).toHaveBeenCalledWith('segwit')
  })

  it('type toggle persists the preference and re-selects (FR-006)', () => {
    const state = btcState()
    mockBtc.mockReturnValue(state)
    openModal()
    fireEvent.click(screen.getByRole('radio', { name: /Taproot/ }))
    expect(state.receive.setPreferredType).toHaveBeenCalledWith('taproot')
    expect(state.receive.select).toHaveBeenCalledWith('taproot')
    expect(screen.getByRole('radio', { name: /Native SegWit/ })).toBeChecked()
  })

  it('ready with no address yet auto-selects the preferred type (rotation entry)', () => {
    const state = btcState({ receive: { current: null, uri: null } })
    mockBtc.mockReturnValue(state)
    openModal()
    expect(state.receive.select).toHaveBeenCalledWith('segwit')
    expect(screen.getByText(/Preparing a fresh Bitcoin address/)).toBeInTheDocument()
  })

  it('locked state offers exactly one action — the passkey unlock', () => {
    const state = btcState({ status: 'locked', receive: { current: null, uri: null } })
    mockBtc.mockReturnValue(state)
    openModal()
    const unlockBtn = screen.getByRole('button', { name: 'Unlock with your passkey' })
    fireEvent.click(unlockBtn)
    expect(state.unlock).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'New address' })).not.toBeInTheDocument()
  })

  it('unavailable state shows the honest reason with no dead buttons (FR-020)', () => {
    mockBtc.mockReturnValue(
      btcState({
        status: 'unavailable',
        reason: 'Bitcoin requires a FairWins passkey account.',
        receive: { current: null, uri: null },
      })
    )
    openModal()
    expect(screen.getByText('Bitcoin requires a FairWins passkey account.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unlock/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New address' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('qr-stub')).not.toBeInTheDocument()
  })

  it('EVM mode never mounts the bitcoin hook (SC-008 regression guard)', () => {
    mockBtc.mockReturnValue(btcState())
    render(<AddressQRModal isOpen onClose={vi.fn()} address="0xEvmAddr" />)
    expect(mockBtc).not.toHaveBeenCalled()
    expect(screen.getByText('Your wallet address')).toBeInTheDocument()
    expect(screen.getByText('0xEvmAddr')).toBeInTheDocument()
  })
})
