/**
 * VaultSheet tests (spec 050 US1) — pre-wallet amount validation with
 * member-facing reasons, Max shortcut, session-aware confirmation copy,
 * honest withdraw liquidity bound, withdraw disabled without a position,
 * and the network-transparent write rail (useEarnSend): the vault's network
 * is displayed, submission targets the VAULT's chain (switching handled
 * inside the hook), sessions that can't transact on that chain see the
 * reason, and a tap is NEVER a silent no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

const mockSend = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnSend', () => ({
  useEarnSend: () => mockSend.current,
  default: () => mockSend.current,
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

// The live platform-fee quote (spec 060) is mocked so tests control whether a
// fee applies; default = no fee system on the chain (pre-060 behavior).
const mockFee = vi.hoisted(() => ({ impl: null }))
vi.mock('../../lib/fees/feeQuote', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchFeeQuote: (...args) => mockFee.impl(...args) }
})

import VaultSheet from '../../components/earn/VaultSheet'

const VAULT = {
  address: '0x00000000000000000000000000000000000000a1',
  chainId: 137,
  name: 'Prime USDC Vault',
  asset: { address: '0xusdc', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  netApy: 0.043,
  curator: 'Prime Curation',
}

const ETH_VAULT = {
  ...VAULT,
  address: '0x00000000000000000000000000000000000000a2',
  chainId: 1,
  name: 'Blue ETH Vault',
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
  mockWallet.current = { address: '0xac', chainId: 137 }
  mockSend.current = {
    sendOnChain: vi.fn().mockResolvedValue({ route: 'direct', txHash: '0xtx1' }),
    canTransactOn: () => true,
    cannotTransactReason: (chainId) => `Passkey accounts can't send transactions on chain ${chainId} yet`,
    isPasskey: false,
  }
  mockBuilders.deposit.mockReset().mockResolvedValue({ calls: DEPOSIT_CALLS, requiresApproval: true })
  mockBuilders.withdraw.mockReset().mockResolvedValue({ calls: [DEPOSIT_CALLS[1]] })
  mockFee.impl = vi.fn().mockResolvedValue({ available: false, bps: 0, capBps: 0, routerAddress: null })
})

/** Deposits are gated until the live fee quote resolves (spec 060, FR-015). */
async function depositQuoteReady() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /deposit usdc/i })).not.toBeDisabled(),
  )
}

function renderSheet(userState = USER_STATE, vault = VAULT) {
  return render(<VaultSheet vault={vault} userState={userState} onClose={vi.fn()} onActionComplete={vi.fn()} />)
}

describe('VaultSheet deposit validation (pre-wallet)', () => {
  it('rejects zero, junk, and over-balance amounts with plain reasons', async () => {
    renderSheet()
    await depositQuoteReady()
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

  it('shows wallet and existing-position balances, and names the vault network', () => {
    renderSheet()
    expect(screen.getByText(/in your wallet/i)).toBeInTheDocument()
    expect(screen.getByText(/already in this vault/i)).toBeInTheDocument()
    expect(screen.getByText(/on Polygon/i)).toBeInTheDocument()
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

describe('VaultSheet network-transparent write rail (useEarnSend)', () => {
  it('submits to the VAULT chain — the network switch is managed for the member', async () => {
    // Wallet is on Polygon; the vault lives on Ethereum. No banner, no
    // pre-confirmation: the hook switches as part of the submission.
    mockWallet.current = { address: '0xac', chainId: 137 }
    renderSheet(USER_STATE, ETH_VAULT)
    await depositQuoteReady()
    expect(screen.getByText(/on Ethereum/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    await waitFor(() => expect(screen.getByText(/deposit complete/i)).toBeInTheDocument())
    expect(mockSend.current.sendOnChain).toHaveBeenCalledTimes(1)
    expect(mockSend.current.sendOnChain).toHaveBeenCalledWith(1, DEPOSIT_CALLS, expect.anything())
  })

  it('passkey deposit sends ONE batch (approve + deposit) with one-ceremony copy', async () => {
    mockSend.current = {
      ...mockSend.current,
      isPasskey: true,
      sendOnChain: vi.fn().mockResolvedValue({ route: 'userop', state: 'included', txHash: '0xtx1' }),
    }
    renderSheet()
    await depositQuoteReady()
    expect(screen.getByText(/one passkey confirmation/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    await waitFor(() => expect(screen.getByText(/deposit complete/i)).toBeInTheDocument())
    expect(mockSend.current.sendOnChain).toHaveBeenCalledWith(137, DEPOSIT_CALLS, expect.anything())
    expect(screen.getByRole('link', { name: /view transaction/i })).toHaveAttribute(
      'href',
      expect.stringContaining('0xtx1'),
    )
  })

  it('discloses up front when this session cannot transact on the vault network', () => {
    mockSend.current = { ...mockSend.current, isPasskey: true, canTransactOn: () => false }
    renderSheet(USER_STATE, ETH_VAULT)
    const submit = screen.getByRole('button', { name: /deposit usdc/i })
    expect(submit).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(/passkey accounts can't send transactions/i)
  })

  it('surfaces a failed submission outcome instead of pretending success', async () => {
    mockSend.current.sendOnChain = vi
      .fn()
      .mockResolvedValue({ route: 'userop', state: 'failed', reason: 'user operation reverted' })
    renderSheet()
    await depositQuoteReady()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be completed/i)
  })
})

describe('VaultSheet platform-fee disclosure (spec 060)', () => {
  const ROUTER = '0x00000000000000000000000000000000000000f1'
  const FEE_QUOTE = { available: true, bps: 50, capBps: 250, routerAddress: ROUTER }

  it('shows the fee line — rate, amount, and net — before any signature', async () => {
    mockFee.impl = vi.fn().mockResolvedValue(FEE_QUOTE)
    renderSheet()
    await depositQuoteReady()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '20' } })
    expect(screen.getByText(/fairwins platform fee \(0\.50%\)/i)).toBeInTheDocument()
    // 20 USDC at 50 bps: 0.1 fee, 19.9 into the vault.
    expect(screen.getByText(/^0\.1 USDC$/)).toBeInTheDocument()
    expect(screen.getByText(/goes into the vault/i)).toBeInTheDocument()
    expect(screen.getByText(/^19\.9 USDC$/)).toBeInTheDocument()
  })

  it('passes the quote through to the deposit batch builder (consent ceiling)', async () => {
    mockFee.impl = vi.fn().mockResolvedValue(FEE_QUOTE)
    renderSheet()
    await depositQuoteReady()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /deposit usdc/i }))
    await waitFor(() => expect(mockBuilders.deposit).toHaveBeenCalledTimes(1))
    expect(mockBuilders.deposit.mock.calls[0][0].feeQuote).toEqual(FEE_QUOTE)
  })

  it('shows NO fee line when no fee applies (zero-fee parity with pre-060 UX)', async () => {
    renderSheet()
    await depositQuoteReady()
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '20' } })
    expect(screen.queryByText(/platform fee/i)).not.toBeInTheDocument()
  })

  it('pauses deposits (never an understated rate) when the quote cannot be read', async () => {
    mockFee.impl = vi.fn().mockRejectedValue(new Error('rpc down'))
    renderSheet()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/fee rate could not be confirmed/i),
    )
    expect(screen.getByRole('button', { name: /deposit usdc/i })).toBeDisabled()
    // Withdrawals stay available — the fee never applies to exits.
    fireEvent.click(screen.getByRole('tab', { name: /withdraw/i }))
    expect(screen.getByRole('button', { name: /withdraw usdc/i })).not.toBeDisabled()
  })
})
