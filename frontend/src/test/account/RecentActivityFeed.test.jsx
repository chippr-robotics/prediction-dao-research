import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import RecentActivityFeed from '../../components/account/RecentActivityFeed'

const activity = [
  { id: 'a', direction: 'payout', amount: 190, symbol: 'USDC', usdValue: 190, timestamp: 2_000_000, txHash: '0xabc', wagerId: '1' },
  { id: 'b', direction: 'deposit', amount: 100, symbol: 'USDC', usdValue: 100, timestamp: 1_000_000, txHash: '0xdef', wagerId: '1' },
]

describe('RecentActivityFeed (spec 020 US4)', () => {
  it('lists entries with direction, amount and token', () => {
    render(<RecentActivityFeed activity={activity} chainId={80002} />)
    expect(screen.getByText('Payout')).toBeInTheDocument()
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.getAllByText('USDC').length).toBe(2)
  })

  it('builds an explorer transaction link for the active network', () => {
    render(<RecentActivityFeed activity={activity} chainId={80002} />)
    const links = screen.getAllByRole('link', { name: /view tx/i })
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('/tx/0xabc'))
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('amoy.polygonscan.com'))
  })

  it('shows an empty state when there is no activity', () => {
    render(<RecentActivityFeed activity={[]} chainId={80002} />)
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument()
  })

  it('renders newest entry first', () => {
    render(<RecentActivityFeed activity={activity} chainId={80002} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Payout')).toBeInTheDocument()
  })
})
