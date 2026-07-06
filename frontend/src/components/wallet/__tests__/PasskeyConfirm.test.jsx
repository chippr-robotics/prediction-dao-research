/**
 * Spec 041 T034 — confirmation surface: fee disclosure in stablecoin terms,
 * exact-shortfall pre-flight block, clarification-Q3 fee fallback options,
 * cancel is always available (clean abort).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PasskeyConfirm from '../PasskeyConfirm'

const base = { action: 'Create wager', onConfirm: vi.fn(), onCancel: vi.fn() }

describe('PasskeyConfirm', () => {
  it('disclosure: action, amount, counterparty, and fee shown BEFORE the ceremony (FR-008)', () => {
    render(
      <PasskeyConfirm
        {...base}
        amount="10 USDC"
        counterparty="0xBob…1234"
        feeQuote={{ display: '0.02', denomination: 'USDC' }}
      />
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('Create wager')
    expect(screen.getByTestId('confirm-amount')).toHaveTextContent('10 USDC')
    expect(screen.getByTestId('confirm-counterparty')).toHaveTextContent('0xBob…1234')
    expect(screen.getByTestId('confirm-fee')).toHaveTextContent('~0.02 USDC')
  })

  it('relayed intents disclose a zero fee honestly', () => {
    render(<PasskeyConfirm {...base} feeQuote={null} />)
    expect(screen.getByTestId('confirm-fee')).toHaveTextContent(/none \(relayed intent\)/i)
  })

  it('blocks confirm with the exact shortfall on insufficient balance', () => {
    render(
      <PasskeyConfirm {...base} insufficient={{ shortfall: '3.50', denomination: 'USDC' }} />
    )
    expect(screen.getByTestId('confirm-insufficient')).toHaveTextContent('short 3.50 USDC')
    expect(screen.getByTestId('confirm-passkey')).toBeDisabled()
  })

  it('offers the clarification-Q3 fallbacks when the stablecoin fee path is down', () => {
    const onPayNative = vi.fn()
    const onRetry = vi.fn()
    render(
      <PasskeyConfirm
        {...base}
        feeQuote={{ display: '0.01', denomination: 'POL' }}
        feeFallback={{ reason: 'fee service unavailable', nativeBalanceSufficient: true, onPayNative, onRetry }}
      />
    )
    const fallback = screen.getByTestId('confirm-fee-fallback')
    expect(fallback).toHaveTextContent(/funds are safe/i)
    fireEvent.click(screen.getByText(/pay this fee in the network token/i))
    expect(onPayNative).toHaveBeenCalled()
    fireEvent.click(screen.getByText(/wait and retry/i))
    expect(onRetry).toHaveBeenCalled()
  })

  it('hides the pay-native option when the account holds no native token', () => {
    render(
      <PasskeyConfirm
        {...base}
        feeFallback={{ reason: 'fee service unavailable', nativeBalanceSufficient: false, onRetry: vi.fn() }}
      />
    )
    expect(screen.queryByText(/pay this fee in the network token/i)).toBeNull()
    expect(screen.getByText(/wait and retry/i)).toBeInTheDocument()
  })

  it('cancel always works and confirm reflects the busy ceremony state', () => {
    const { rerender } = render(<PasskeyConfirm {...base} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(base.onCancel).toHaveBeenCalled()
    rerender(<PasskeyConfirm {...base} busy />)
    expect(screen.getByTestId('confirm-passkey')).toHaveTextContent(/waiting for your device/i)
    expect(screen.getByTestId('confirm-passkey')).toBeDisabled()
  })
})
