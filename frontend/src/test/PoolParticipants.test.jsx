/**
 * PoolParticipants tests (spec 034, address-based): alias cards for everyone (labels derived from the
 * public wallet address), alphabetical until the creator arranges an order, creator-only reordering,
 * and a proposed payout keyed by winner ADDRESS.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PoolParticipants from '../components/pools/PoolParticipants'
import { sortParticipants } from '../lib/pools/participantOrder'

const A1 = '0x1111111111111111111111111111111111111111'
const A2 = '0x2222222222222222222222222222222222222222'
const A3 = '0x3333333333333333333333333333333333333333'

const P = [
  { address: A3, nickname: { label: 'Silent Owl', suffix: '03' } },
  { address: A1, nickname: { label: 'Amber Fox', suffix: '01' } },
  { address: A2, nickname: { label: 'Prismatic Newt', suffix: '02' } },
]

const aliases = () => screen.getAllByTestId('participant-card').map((el) => el.textContent)

describe('sortParticipants', () => {
  it('is alphabetical by alias without a creator order', () => {
    expect(sortParticipants(P, null).map((p) => p.nickname.label)).toEqual(['Amber Fox', 'Prismatic Newt', 'Silent Owl'])
  })
  it('follows the creator order, appending unknown addresses alphabetically', () => {
    expect(sortParticipants(P, [A2, A3]).map((p) => p.nickname.label)).toEqual(['Prismatic Newt', 'Silent Owl', 'Amber Fox'])
  })
})

describe('PoolParticipants', () => {
  it('renders nothing while the roster is still loading (null)', () => {
    const { container } = render(<PoolParticipants participants={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a share-the-words empty state once loaded with no members (live-app tester feedback)', () => {
    render(<PoolParticipants participants={[]} />)
    expect(screen.getByTestId('participants-empty')).toHaveTextContent(/share the pool.s four words/i)
  })

  it('members see a read-only alphabetical roster (no reorder controls)', () => {
    render(<PoolParticipants participants={P} isCreator={false} />)
    expect(aliases()[0]).toContain('Amber Fox')
    expect(aliases()[2]).toContain('Silent Owl')
    expect(screen.queryByRole('button', { name: /move/i })).toBeNull()
    expect(screen.getByText(/alphabetical until the creator arranges/i)).toBeInTheDocument()
  })

  it('the creator can move a card into rank order (accessible buttons)', () => {
    const onReorder = vi.fn()
    render(<PoolParticipants participants={P} isCreator order={null} onReorder={onReorder} />)
    // Alphabetical start: Amber Fox, Prismatic Newt, Silent Owl. Move Silent Owl up one.
    fireEvent.click(screen.getByRole('button', { name: /move silent owl up/i }))
    expect(onReorder).toHaveBeenCalledWith([A1, A3, A2])
  })

  it('shows rank numbers once an order exists and never shows wallets', () => {
    render(<PoolParticipants participants={P} isCreator={false} order={[A2, A1, A3]} />)
    expect(screen.getByLabelText('Rank 1')).toBeInTheDocument()
    expect(aliases()[0]).toContain('Prismatic Newt')
    expect(screen.queryByText(/0x/)).toBeNull()
  })

  it('incorporates a proposed payout: winners sort to the top, get medals + amounts, in-the-money cards grow', () => {
    // Amber Fox (A1) wins 15, Silent Owl (A3) wins 5, Prismatic Newt (A2) gets nothing.
    const payout = new Map([[A1, 15000000n], [A3, 5000000n], [A2, 0n]])
    render(<PoolParticipants participants={P} payoutByAddress={payout} tokenSymbol="USDC" tokenDecimals={6} />)
    const cards = screen.getAllByTestId('participant-card')
    expect(cards[0]).toHaveTextContent('Amber Fox')       // highest payout first
    expect(cards[0].textContent).toContain('🥇')
    expect(cards[0]).toHaveClass('in-money')
    expect(cards[1]).toHaveTextContent('Silent Owl')
    expect(cards[1].textContent).toContain('🥈')
    // Out-of-the-money card is de-emphasised and shows no payout.
    expect(cards[2]).toHaveTextContent('Prismatic Newt')
    expect(cards[2]).toHaveClass('no-payout')
    expect(screen.getByText('15.0 USDC')).toBeInTheDocument()
    // Reordering is disabled once a payout is proposed (standings are payout-ranked).
    expect(screen.queryByRole('button', { name: /move/i })).toBeNull()
  })

  it('labels the section "Final standings" once resolved', () => {
    const payout = new Map([[A1, 20000000n]])
    render(<PoolParticipants participants={P} payoutByAddress={payout} resolved tokenDecimals={6} />)
    expect(screen.getByRole('heading', { name: /final standings/i })).toBeInTheDocument()
  })
})
