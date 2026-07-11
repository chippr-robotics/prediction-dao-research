/**
 * VaultSheet tests (spec 050 US1) — pre-wallet amount validation with
 * member-facing reasons, Max shortcut, two-prompt approval explanation,
 * honest withdraw liquidity bound, and withdraw disabled without a position.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

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

beforeEach(() => {
  mockWallet.current = { address: '0xac', chainId: 137, signer: null }
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
