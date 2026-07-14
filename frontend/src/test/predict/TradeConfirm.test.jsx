/**
 * TradeConfirm (spec 057 US1) — the honest-disclosure surface. Verifies the builder fee is rendered as
 * its own line and included in the total before any approve (FR-012), the disclosure states it IS a
 * cost (the divergence from Collect's free referral), signing is blocked until fees confirm (FR-010),
 * and the surface is accessible.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import TradeConfirm from '../../components/predict/TradeConfirm'

// Isolate the component from the network by mocking the trade hook.
const hookState = { current: null }
vi.mock('../../hooks/usePredictTrade', () => ({
  usePredictTrade: () => hookState.current,
}))

const MARKET = { question: 'Will it rain tomorrow?', polymarketUrl: 'https://polymarket.com/event/x' }
const OUTCOME = { name: 'Yes', tokenId: '123456789', price: '0.5' }
const FEE = { feeRateBps: 100, builderTakerFeeBps: 50, builderMakerFeeBps: 0, builderCode: '0x6e03' }

// A preview matching computeCost for 100 shares @ 0.50: notional 50, platform 0.5, builder 0.25.
const QUOTE = {
  notionalUnits: 50_000000n,
  platformFeeUnits: 500000n,
  builderFeeUnits: 250000n,
  totalCostUnits: 50_750000n,
  netProceedsUnits: 49_250000n,
  currency: 'USDC',
  feeLines: [
    { label: 'Polymarket fee', amount: '0.5', currency: 'USDC', estimated: true },
    { label: 'FairWins builder fee', amount: '0.25', currency: 'USDC' },
  ],
}

function makeHook(over = {}) {
  return {
    status: 'ready',
    reason: null,
    fee: FEE,
    result: null,
    canTrade: true,
    unsupportedReason: null,
    onWrongNetwork: false,
    loadFee: vi.fn(),
    preview: vi.fn(() => QUOTE),
    submit: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  hookState.current = makeHook()
})

describe('TradeConfirm', () => {
  it('shows the builder fee as its own line, included in the total, before any approve', () => {
    render(<TradeConfirm market={MARKET} outcome={OUTCOME} side="BUY" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/shares to buy/i), { target: { value: '100' } })
    expect(screen.getByText('FairWins builder fee')).toBeInTheDocument()
    // Total cost includes the additive builder fee (50 + 0.5 + 0.25 = 50.75).
    expect(screen.getByTestId('trade-total')).toHaveTextContent('50.75 USDC')
  })

  it('discloses the builder fee as a real cost — not free', () => {
    render(<TradeConfirm market={MARKET} outcome={OUTCOME} side="BUY" onClose={() => {}} />)
    const note = screen.getByText(/builder fee on this trade/i)
    expect(note).toHaveTextContent(/0\.50%/)
    expect(note).toHaveTextContent(/added on top of/i)
    // It must NOT claim to be free (the Collect divergence).
    expect(note.textContent).not.toMatch(/costs you nothing|free/i)
  })

  it('blocks signing when the fee schedule could not be confirmed (FR-010)', () => {
    hookState.current = makeHook({ status: 'blocked', reason: "Couldn't confirm the fees — try again before trading." })
    render(<TradeConfirm market={MARKET} outcome={OUTCOME} side="BUY" onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /sign buy/i })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/confirm the fees/i)
  })

  it('offers a never-stranded Polymarket path on error', () => {
    hookState.current = makeHook({ status: 'error', reason: 'The order could not be submitted.' })
    render(<TradeConfirm market={MARKET} outcome={OUTCOME} side="BUY" onClose={() => {}} />)
    expect(screen.getByRole('link', { name: /Polymarket/i })).toHaveAttribute('href', MARKET.polymarketUrl)
  })

  it('has no axe violations', async () => {
    const { container } = render(<TradeConfirm market={MARKET} outcome={OUTCOME} side="BUY" onClose={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
