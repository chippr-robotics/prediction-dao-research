import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the standard address input to a plain field that resolves whatever is typed — keeps the test off
// the ENS network path while still exercising the resolved-address wiring.
vi.mock('../components/ui/AddressInput', () => ({
  default: ({ id, value, onChange, onResolvedChange, placeholder, disabled }) => (
    <input
      id={id}
      aria-label="To"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => { onChange(e); onResolvedChange(e.target.value) }}
    />
  ),
}))
vi.mock('../components/ui/BlockiesAvatar', () => ({ default: () => <span data-testid="blockie" /> }))

const send = vi.fn().mockResolvedValue({ txHash: '0xhash', route: 'gasless', id: 't1' })
const showNotification = vi.fn()
const screenOne = vi.fn().mockResolvedValue('clear')

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => ({ address: '0xAaAa000000000000000000000000000000000001' }),
}))
vi.mock('../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({ screenOne }),
}))
vi.mock('../hooks/useUI', () => ({ useNotification: () => ({ showNotification }) }))

let gasless = true
vi.mock('../hooks/useTransfer', async () => {
  const actual = await vi.importActual('../hooks/useTransfer')
  return {
    ...actual,
    useTransfer: () => ({
      send,
      status: 'idle',
      error: null,
      quoteGasless: () => gasless,
      meta: (kind) => (kind === 'stable'
        ? { symbol: 'USDC', name: 'USD Coin', decimals: 6, address: '0xtoken' }
        : { symbol: 'MATIC', name: 'MATIC', decimals: 18, address: null }),
      balanceOf: (kind) => (kind === 'stable' ? '100' : '5'),
      refreshBalances: vi.fn(),
      tokens: { stable: 'USDC', native: 'MATIC', stableAddress: '0xtoken', chainId: 137, networkName: 'Polygon' },
      isPasskey: true,
    }),
  }
})

import TransferForm from '../components/wallet/TransferForm'

describe('TransferForm', () => {
  beforeEach(() => { send.mockClear(); showNotification.mockClear(); screenOne.mockClear(); gasless = true })

  it('shows a gasless badge for the stablecoin and previews then sends to the resolved recipient', async () => {
    const user = userEvent.setup()
    render(<TransferForm />)

    // Gasless badge visible (USDC selected by default)
    expect(screen.getByText(/gasless/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('To'), '0xBbBb000000000000000000000000000000000002')
    await waitFor(() => expect(screenOne).toHaveBeenCalledWith('0xBbBb000000000000000000000000000000000002', 137))
    await user.type(screen.getByLabelText('Amount'), '10')

    const preview = screen.getByRole('button', { name: 'Preview' })
    await waitFor(() => expect(preview).toBeEnabled())
    await user.click(preview)

    // Preview summary appears
    expect(screen.getByText('10 USDC')).toBeInTheDocument()
    expect(screen.getByText(/no network fee/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledWith({
      kind: 'stable',
      to: '0xBbBb000000000000000000000000000000000002',
      amount: '10',
    })
    await waitFor(() => expect(showNotification).toHaveBeenCalled())
  })

  it('reports a stalled (pending) passkey transfer honestly — info notice, not a "success"', async () => {
    // A sponsored UserOp submitted but not yet confirmed on-chain: send() resolves with { pending: true }
    // and no real txHash. The form must NOT claim it cleared.
    send.mockResolvedValueOnce({ txHash: null, userOpHash: '0xuop', route: 'gasless', id: 't1', pending: true })
    const user = userEvent.setup()
    render(<TransferForm />)

    await user.type(screen.getByLabelText('To'), '0xBbBb000000000000000000000000000000000002')
    await user.type(screen.getByLabelText('Amount'), '10')
    const preview = screen.getByRole('button', { name: 'Preview' })
    await waitFor(() => expect(preview).toBeEnabled())
    await user.click(preview)
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(showNotification).toHaveBeenCalled())
    const [message, type] = showNotification.mock.calls.at(-1)
    expect(type).toBe('info')
    expect(message).toMatch(/still confirming on-chain/i)
    expect(message).not.toMatch(/^Sent /)
  })

  it('blocks Preview when the amount exceeds the balance', async () => {
    const user = userEvent.setup()
    render(<TransferForm />)
    await user.type(screen.getByLabelText('To'), '0xBbBb000000000000000000000000000000000002')
    await user.type(screen.getByLabelText('Amount'), '999') // balance is 100
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
    expect(screen.getByText(/exceeds balance/i)).toBeInTheDocument()
  })
})
