import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecentActivityFeed from '../../components/account/RecentActivityFeed'

const TX_A = '0x' + 'aa'.repeat(32)
const TX_B = '0x' + 'bb'.repeat(32)
const NOW = Date.now()

const entries = [
  {
    entryId: `oc:80002:wt:${TX_A}-1-payout`,
    chainId: 80002,
    class: 'wager',
    kind: 'payout',
    direction: 'in',
    status: 'settled',
    tokenSymbol: 'USDC',
    amount: 190,
    valueUsd: 190,
    valuationStatus: 'valued',
    timestamp: NOW - 60_000,
    timestampProvenance: 'chain',
    txHash: TX_A,
    refs: { wagerId: '1' },
  },
  {
    entryId: `oc:80002:wt:${TX_B}-1-deposit`,
    chainId: 80002,
    class: 'wager',
    kind: 'deposit',
    direction: 'out',
    status: 'settled',
    tokenSymbol: 'USDC',
    amount: 100,
    valueUsd: 100,
    valuationStatus: 'valued',
    timestamp: NOW - 120_000,
    timestampProvenance: 'chain',
    txHash: TX_B,
    refs: { wagerId: '1' },
  },
  {
    entryId: 'cl:t-9',
    chainId: 80002,
    class: 'transfer',
    kind: 'send',
    direction: 'none',
    status: 'failed',
    failureReason: 'Smart Account does not have sufficient funds to execute the User Operation.',
    tokenSymbol: 'USDC',
    amount: 1,
    valueUsd: null,
    valuationStatus: 'unvalued',
    timestamp: null,
    timestampProvenance: 'unavailable',
    txHash: null,
    refs: { route: 'gasless' },
  },
]

describe('RecentActivityFeed (spec 051 US1)', () => {
  it('lists entries of every class with kind label, amount and token', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    expect(screen.getByText('Payout')).toBeInTheDocument()
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getAllByText('USDC').length).toBeGreaterThanOrEqual(2)
  })

  it('builds an explorer link only for entries with a real transaction hash', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    const links = screen.getAllByRole('link', { name: /view tx/i })
    expect(links).toHaveLength(2) // the failed client entry has no tx to link
    expect(links[0]).toHaveAttribute('href', expect.stringContaining(`/tx/${TX_A}`))
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('amoy.polygonscan.com'))
  })

  it('marks failed entries with a Failed badge and the verbatim reason (FR-003)', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText(/sufficient funds/)).toBeInTheDocument()
  })

  it('renders an explicit "date unavailable" state instead of a fabricated relative time (FR-006)', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    expect(screen.getByText(/date unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText(/20645d/)).not.toBeInTheDocument()
  })

  it('flags unvalued entries instead of showing $0 (FR-016)', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    expect(screen.getByText(/unvalued/i)).toBeInTheDocument()
  })

  it('filters by activity class', async () => {
    const user = userEvent.setup()
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    await user.click(screen.getByRole('button', { name: 'Transfers' }))
    expect(screen.queryByText('Payout')).not.toBeInTheDocument()
    expect(screen.getByText('Transfer')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All activity' }))
    expect(screen.getByText('Payout')).toBeInTheDocument()
  })

  it('shows an empty state when there is no activity', () => {
    render(<RecentActivityFeed entries={[]} chainId={80002} />)
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument()
  })

  it('renders entries in the order given (repository sorts newest first)', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Payout')).toBeInTheDocument()
  })

  it('discloses stale classes and the pruning marker', () => {
    render(
      <RecentActivityFeed
        entries={entries}
        chainId={80002}
        staleClasses={['earn']}
        prunedBefore={Date.UTC(2024, 0, 1)}
      />,
    )
    expect(screen.getByText(/could not be refreshed/i)).toBeInTheDocument()
    expect(screen.getByText(/pruned from device history/i)).toBeInTheDocument()
  })
})
