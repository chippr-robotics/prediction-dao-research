/**
 * SellConfirm (spec 056 US1) — the honest confirmation: net + fee lines before any approve (FR-002),
 * reward disclosure that states no cost (FR-014), NO surcharge line (FR-015), signing blocked until
 * fees confirmed (FR-009), below-floor warning (FR-011), axe (FR-022).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import SellConfirm from '../../components/collectibles/SellConfirm'
import { useCollectibleSell } from '../../hooks/useCollectibleSell'

vi.mock('../../hooks/useCollectibleSell', () => ({ useCollectibleSell: vi.fn() }))

const ITEM = { chainId: 137, name: 'Cool Cat #1234', openseaUrl: 'https://opensea.io/x' }

const hookState = (over = {}) => ({
  status: 'ready',
  reason: null,
  fees: {},
  result: null,
  canSell: true,
  unsupportedReason: null,
  onWrongNetwork: false,
  loadFees: vi.fn(),
  preview: vi.fn(() => ({ net: '9.75', feeLines: [{ label: 'Marketplace fee', amount: '0.25', currency: 'POL' }], belowFloor: false, currency: 'POL' })),
  submitListing: vi.fn(),
  acceptOffer: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  useCollectibleSell.mockReturnValue(hookState())
})

describe('SellConfirm', () => {
  it('loads fees on mount', () => {
    const state = hookState()
    useCollectibleSell.mockReturnValue(state)
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    expect(state.loadFees).toHaveBeenCalled()
  })

  it('shows the net proceeds and fee lines before any approval (FR-002)', () => {
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/listing price/i), { target: { value: '10' } })
    expect(screen.getByTestId('sell-net')).toHaveTextContent('9.75 POL')
    expect(screen.getByText(/marketplace fee/i)).toBeInTheDocument()
  })

  it('discloses the referral reward as no-cost, with NO FairWins surcharge line (FR-014/FR-015)', () => {
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    expect(screen.getByText(/referral reward from the marketplace/i)).toHaveTextContent(/costs you nothing/i)
    expect(screen.queryByText(/fairwins fee/i)).not.toBeInTheDocument()
  })

  it('signs on confirm, passing the price to the hook', () => {
    const state = hookState()
    useCollectibleSell.mockReturnValue(state)
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/listing price/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /sign listing/i }))
    expect(state.submitListing).toHaveBeenCalledWith(expect.objectContaining({ amount: '10' }))
  })

  it('blocks signing and shows retry when fees could not be confirmed (FR-009)', () => {
    useCollectibleSell.mockReturnValue(hookState({ status: 'blocked', reason: "Couldn't confirm the marketplace fees — try again before listing." }))
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't confirm the marketplace fees/i)
    expect(screen.queryByRole('button', { name: /sign listing/i })).not.toBeInTheDocument()
  })

  it('warns and disables signing below the fee floor (FR-011)', () => {
    useCollectibleSell.mockReturnValue(
      hookState({ preview: vi.fn(() => ({ net: '0', feeLines: [], belowFloor: true, currency: 'POL' })) })
    )
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/listing price/i), { target: { value: '0.01' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/leave you nothing after fees/i)
    expect(screen.getByRole('button', { name: /sign listing/i })).toBeDisabled()
  })

  it('offers the act-on-OpenSea path on error (never stranded, FR-017)', () => {
    useCollectibleSell.mockReturnValue(hookState({ status: 'error', reason: 'publish failed' }))
    render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    expect(screen.getByRole('link', { name: /list on opensea instead/i })).toHaveAttribute('href', ITEM.openseaUrl)
  })

  it('has no axe violations', async () => {
    const { container } = render(<SellConfirm item={ITEM} onClose={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
