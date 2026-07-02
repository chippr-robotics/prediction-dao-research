/**
 * PoolParticipants tests (pool-manager tester feedback, items 3–4): anonymous alias cards for everyone,
 * alphabetical until the creator arranges an order, creator-only reordering.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PoolParticipants from '../components/pools/PoolParticipants'
import { sortParticipants } from '../lib/pools/participantOrder'

const P = [
  { commitment: '3', label: 'Silent Owl', suffix: '03' },
  { commitment: '1', label: 'Amber Fox', suffix: '01' },
  { commitment: '2', label: 'Prismatic Newt', suffix: '02' },
]

const aliases = () => screen.getAllByTestId('participant-card').map((el) => el.textContent)

describe('sortParticipants', () => {
  it('is alphabetical by alias without a creator order', () => {
    expect(sortParticipants(P, null).map((p) => p.label)).toEqual(['Amber Fox', 'Prismatic Newt', 'Silent Owl'])
  })
  it('follows the creator order, appending unknown commitments alphabetically', () => {
    expect(sortParticipants(P, ['2', '3']).map((p) => p.label)).toEqual(['Prismatic Newt', 'Silent Owl', 'Amber Fox'])
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
    expect(onReorder).toHaveBeenCalledWith(['1', '3', '2'])
  })

  it('shows rank numbers once an order exists and never shows wallets', () => {
    render(<PoolParticipants participants={P} isCreator={false} order={['2', '1', '3']} />)
    expect(screen.getByLabelText('Rank 1')).toBeInTheDocument()
    expect(aliases()[0]).toContain('Prismatic Newt')
    expect(screen.queryByText(/0x/)).toBeNull()
  })

  it('incorporates a proposed payout: winners sort to the top, get medals + amounts, in-the-money cards grow', () => {
    // Amber Fox (commitment 1) wins 15, Silent Owl (3) wins 5, Prismatic Newt (2) gets nothing.
    const payout = new Map([['1', 15000000n], ['3', 5000000n], ['2', 0n]])
    render(<PoolParticipants participants={P} payoutByCommitment={payout} tokenSymbol="USDC" tokenDecimals={6} />)
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
    const payout = new Map([['1', 20000000n]])
    render(<PoolParticipants participants={P} payoutByCommitment={payout} resolved tokenDecimals={6} />)
    expect(screen.getByRole('heading', { name: /final standings/i })).toBeInTheDocument()
  })
})
