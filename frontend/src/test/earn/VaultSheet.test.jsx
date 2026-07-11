/**
 * VaultSheet tests (spec 050 US1) — pre-wallet amount validation with
 * member-facing reasons, Max shortcut, session-aware confirmation copy,
 * honest withdraw liquidity bound, withdraw disabled without a position,
 * and the sendCalls write rail (passkey batch + honest no-rail error —
 * the tap must NEVER be a silent no-op).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

// Batch builders are unit-tested in vaultActions.test.js; here they are mocked
// so no read-provider RPC is constructed. Validators stay real.
const mockBuilders = vi.hoisted(() => ({ deposit: vi.fn(), withdraw: vi.fn() }))
vi.mock('../../lib/earn/vaultActions', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildDepositCalls: (...args) => mockBuilders.deposit(...args),
    buildWithdrawCalls: (...args) => mockBuilders.withdraw(...args),
  }
})
vi.mock('../../utils/rpcProvider', () => ({ makeReadProvider: () => ({}) }))

import VaultSheet from '../../components/earn/VaultSheet'

const VAULT = {
  address: '0x00000000000000000000000000000000000000a1',
  chainId: 137,
  name: 'Prime USDC Vault',
  asset: { address: '0xusdc', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  netApy: 0.043,
  curator: 'Prime Curation',
}

// 25 USDC wallet, 10 USDC position, 8 USDC withdrawable right now.
const USER_STATE = {
  shares: 10_000_000n,
  assets: 10_000_000n,
  maxWithdrawAssets: 8_000_000n,
  walletBalance: 25_000_000n,
  maxDepositAssets: 0n,
}

const DEPOSIT_CALLS = [
  { target: '0xusdc', data: '0xapprove', value: 0n },
  { target: VAULT.address, data: '0xdeposit', value: 0n },
]

beforeEach(() => {
  mockWallet.current = { address: '0xac', chainId: 137, sendCalls: vi.fn(), loginMethod: 'wallet' }
  mockBuilders.deposit.mockReset().mockResolvedValue({ calls: DEPOSIT_CALLS, requiresApproval: true })
  mockBuilders.withdraw.mockReset().mockResolvedValue({ calls: [DEPOSIT_CALLS[1]] })
})

function renderSheet(userState = USER_STATE) {
  return render(<VaultSheet vault={VAULT} userState={userState} onClose={vi.fn()} onActionComplete={vi.fn()} />)
}

describe('VaultSheet deposit validation (pre-wallet)', () => {
  it('rejects zero, junk, and over-balance amounts with plain reasons', () => {
    renderSheet()
    const input = screen.getByLabelText(/amount/i)
    const submit = screen.getByRole('button', { name: /deposit usdc/i })

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i)

    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent(/valid number/i)

    fireEvent.change(input, { target: { value: '26' } })
    fireEvent.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent(/more than you have/i)
  })

  it('Max fills the wallet balance and the two-prompt approval is explained up front', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /^max$/i }))
    expect(screen.getByLabelText(/amount/i)).toHaveValue('25.0')
    expect(screen.getByText(/two quick wallet confirmations/i)).toBeInTheDocument()
  })

  it('shows wallet and existing-position balances', () => {
    renderSheet()
    expect(screen.getByText(/in your wallet/i)).toBeInTheDocument()
    expect(screen.getByText(/already in this vault/i)).toBeInTheDocument()
  })
})

describe('VaultSheet withdraw (honest liquidity bound)', () => {
  it('surfaces the available-now amount and rejects amounts above it', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: /withdraw/i }))
    expect(screen.getByText(/available to withdraw now/i)).toBeInTheDocument()

    const input = screen.getByLabelText(/amount/i)
    fireEvent.change(input, { target: { value: '9' } }) // > 8 available
    fireEvent.click(screen.getByRole('button', { name: /withdraw usdc/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/withdrawn right now/i)
  })

  it('Max fills the available liquidity, not the full position', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: /withdraw/i }))
    fireEvent.click(screen.getByRole('button', { name: /^max$/i }))
    expect(screen.getByLabelText(/amount/i)).toHaveValue('8.0')
  })

  it('is disabled with a reason when the member has no position', () => {
    renderSheet({ ...USER_STATE, shares: 0n, assets: 0n, maxWithdrawAssets: 0n })
    const withdrawTab = screen.getByRole('tab', { name: /withdraw/i })
    expect(withdrawTab).toBeDisabled()
    expect(withdrawTab).toHaveAttribute('title', expect.stringMatching(/nothing in this vault/i))
  })
})

describe('VaultSheet write rail (sendCalls — passkey + classic)', () => {
  it('passkey deposit sends ONE sendCalls batch (approve + deposit) and shows the success state', async () => {
    const sendCalls = vi.fn().mockResolvedValue({ route: 'userop', state: 'included', txHash: '0xtx1' })
    mockWallet.current = { address: '0xac', chainId: 137, sendCalls, loginMethod: 'passkey' }
    renderSheet()
    // Passkey copy: one ceremony, not "two confirmations".
    expect(screen.getByText(/one passkey confirmation/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    await waitFor(() => expect(screen.getByText(/deposit complete/i)).toBeInTheDocument())
    expect(sendCalls).toHaveBeenCalledTimes(1)
    expect(sendCalls).toHaveBeenCalledWith(DEPOSIT_CALLS)
    expect(mockBuilders.deposit).toHaveBeenCalledWith(
      expect.objectContaining({ account: '0xac', amount: 5_000_000n }),
    )
    expect(screen.getByRole('link', { name: /view transaction/i })).toHaveAttribute(
      'href',
      expect.stringContaining('0xtx1'),
    )
  })

  it('classic wallet withdraw routes through sendCalls too', async () => {
    const sendCalls = vi.fn().mockResolvedValue({ route: 'direct', txHash: '0xtx2' })
    mockWallet.current = { address: '0xac', chainId: 137, sendCalls, loginMethod: 'wallet' }
    renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: /withdraw/i }))
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /withdraw usdc/i }))
    await waitFor(() => expect(screen.getByText(/withdrawal complete/i)).toBeInTheDocument())
    expect(sendCalls).toHaveBeenCalledTimes(1)
  })

  it('shows an honest error when the session has no write rail — never a silent no-op', async () => {
    mockWallet.current = { address: '0xac', chainId: 137, sendCalls: undefined, loginMethod: 'passkey' }
    renderSheet()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot send transactions/i)
  })

  it('surfaces a failed submission outcome instead of pretending success', async () => {
    const sendCalls = vi.fn().mockResolvedValue({ route: 'userop', state: 'failed', reason: 'user operation reverted' })
    mockWallet.current = { address: '0xac', chainId: 137, sendCalls, loginMethod: 'passkey' }
    renderSheet()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be completed/i)
  })
})
