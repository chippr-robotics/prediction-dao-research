import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecentActivityFeed from '../../components/account/RecentActivityFeed'

const TX_A = '0x' + 'aa'.repeat(32)
const TX_B = '0x' + 'bb'.repeat(32)
/*
 * The clock is PINNED to midday, not read from the wall.
 *
 * This file used to take `Date.now()` at module load and place entries 60s and 120s before it, then
 * assert a "Today" bucket. Within ~2 minutes of local midnight both entries fall on the PREVIOUS
 * day, no "Today" group renders, and the assertion fails — a real ~2-minute window every day in
 * which CI is red for no reason. Observed failing at 00:05 UTC (job 94300335340), on a PR whose
 * diff touched no activity-feed code.
 *
 * Midday is chosen so neither the -120s offsets below nor any timezone the suite runs under can
 * push an entry across a day boundary.
 */
const NOW = new Date('2026-03-15T12:00:00.000Z').getTime()

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterAll(() => {
  vi.useRealTimers()
})

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
    wagerTitle: 'Pizza bet with Sam',
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
    refs: { wagerId: '2' },
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

  it('says which wager an entry belongs to: the wager message, or "Wager #id" when untitled', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    // The payout carries its wager's message (annotated upstream from the
    // member's wager records — the same title My Wagers renders).
    expect(screen.getByText('Pizza bet with Sam')).toBeInTheDocument()
    // The deposit's wager has no known title — the id still identifies it.
    expect(screen.getByText('Wager #2')).toBeInTheDocument()
    // Non-wager entries get no context line.
    expect(screen.queryByText(/Wager #(?!2)/)).not.toBeInTheDocument()
  })

  it('finds wager entries by their message and by wager id', async () => {
    const user = userEvent.setup()
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    await user.click(screen.getByRole('button', { name: /search activity/i }))
    const input = screen.getByRole('searchbox', { name: /search activity/i })
    await user.type(input, 'pizza bet')
    expect(screen.getByText('Payout')).toBeInTheDocument()
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '#2')
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.queryByText('Payout')).not.toBeInTheDocument()
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

  it('filters by activity class from the filter dropdown (spec 074 follow-up)', async () => {
    const user = userEvent.setup()
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    // Class options are behind the Filter button, not an always-on chip row.
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /filter activity by type/i }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Transfers' }))
    expect(screen.queryByText('Payout')).not.toBeInTheDocument()
    expect(screen.getByText('Transfer')).toBeInTheDocument()
    // Picking closes the menu; the active class shows on the button badge.
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument()
    expect(screen.getByText('Transfers')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /filter activity by type/i }))
    await user.click(screen.getByRole('menuitemradio', { name: 'All activity' }))
    expect(screen.getByText('Payout')).toBeInTheDocument()
  })

  it('searches transactions behind the search icon (spec 074 follow-up)', async () => {
    const user = userEvent.setup()
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /search activity/i }))
    const input = screen.getByRole('searchbox', { name: /search activity/i })
    await user.type(input, 'payout')
    expect(screen.getByText('Payout')).toBeInTheDocument()
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument()
    // A tx-hash fragment locates the transaction too.
    await user.clear(input)
    await user.type(input, TX_B.slice(0, 10))
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.queryByText('Payout')).not.toBeInTheDocument()
    // No matches → honest "no matching activity" state, not the generic empty.
    await user.clear(input)
    await user.type(input, 'zzz-no-match')
    expect(screen.getByText(/no matching activity/i)).toBeInTheDocument()
    // Collapsing search clears the query.
    await user.click(screen.getByRole('button', { name: /hide activity search/i }))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
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

  it('groups activity by day by default, with an "Undated" bucket for missing timestamps', () => {
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    // Default grouping shouldn't badge the button — "By day" is the baseline.
    expect(screen.queryByText('By day')).not.toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Undated')).toBeInTheDocument()
    // Group headers are presentational, not list rows — order-of-rows checks stay unaffected.
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Payout')).toBeInTheDocument()
  })

  it('switches grouping via the Group control (spec 074 follow-up)', async () => {
    const user = userEvent.setup()
    render(<RecentActivityFeed entries={entries} chainId={80002} />)
    await user.click(screen.getByRole('button', { name: /group activity/i }))
    expect(screen.getByRole('menuitemradio', { name: 'By day' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: 'No grouping' }))
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.queryByText('Undated')).not.toBeInTheDocument()
    expect(screen.getByText('No grouping')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /group activity/i }))
    await user.click(screen.getByRole('menuitemradio', { name: 'By week' }))
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Undated')).toBeInTheDocument()
  })

  it('discloses stale classes and the per-network pruning marker', () => {
    render(
      <RecentActivityFeed
        entries={entries}
        chainId={80002}
        staleClasses={['earn on Polygon Amoy']}
        prunedByChain={[{ chainId: 80002, network: 'Polygon Amoy', before: Date.UTC(2024, 0, 1) }]}
      />,
    )
    expect(screen.getByText(/could not be refreshed/i)).toBeInTheDocument()
    expect(screen.getByText(/entries on polygon amoy before .* pruned from device history/i)).toBeInTheDocument()
  })
})

describe('RecentActivityFeed — merged multi-network record (spec 092)', () => {
  const TX_C = '0x' + 'cc'.repeat(32)
  const mordorEntry = {
    entryId: `oc:63:wt:${TX_C}-9-payout`,
    chainId: 63,
    class: 'wager',
    kind: 'payout',
    direction: 'in',
    status: 'settled',
    tokenSymbol: 'CUSD',
    amount: 40,
    valueUsd: 40,
    valuationStatus: 'valued',
    timestamp: NOW - 30_000,
    timestampProvenance: 'chain',
    txHash: TX_C,
    refs: { wagerId: '9' },
  }
  const merged = [mordorEntry, ...entries]

  it('tags every row with its own network', () => {
    render(<RecentActivityFeed entries={merged} chainId={80002} />)
    expect(screen.getByText('Ethereum Classic Mordor')).toBeInTheDocument()
    expect(screen.getAllByText('Polygon Amoy').length).toBeGreaterThanOrEqual(2)
  })

  it("explorer links target the entry's own network, not the active one", () => {
    render(<RecentActivityFeed entries={merged} chainId={80002} />)
    const links = screen.getAllByRole('link', { name: /view tx/i })
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs.some((h) => h.includes('etc-mordor.blockscout.com') && h.includes(TX_C))).toBe(true)
    expect(hrefs.some((h) => h.includes('amoy.polygonscan.com'))).toBe(true)
  })

  it('discloses unreachable networks by name, distinct from class staleness', () => {
    render(
      <RecentActivityFeed entries={merged} chainId={80002} partialChains={['Ethereum Classic']} />,
    )
    expect(
      screen.getByText(/some networks could not be read: ethereum classic/i),
    ).toBeInTheDocument()
  })

  it('offers a network filter only for multi-network records, composing with class filter and search', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<RecentActivityFeed entries={entries} chainId={80002} />)
    // Single-network record: no network control.
    expect(screen.queryByRole('button', { name: /filter activity by network/i })).not.toBeInTheDocument()

    rerender(<RecentActivityFeed entries={merged} chainId={80002} />)
    await user.click(screen.getByRole('button', { name: /filter activity by network/i }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Ethereum Classic Mordor' }))
    // Only the Mordor payout remains.
    expect(screen.getByText('Payout')).toBeInTheDocument()
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument()
    expect(screen.queryByText('Transfer')).not.toBeInTheDocument()

    // Composes with search: a query that only matches the filtered-out chain
    // yields the honest no-match state.
    await user.click(screen.getByRole('button', { name: /search activity/i }))
    await user.type(screen.getByRole('searchbox', { name: /search activity/i }), 'pizza bet')
    expect(screen.getByText(/no matching activity/i)).toBeInTheDocument()

    // Back to all networks restores the merged record.
    await user.click(screen.getByRole('button', { name: /hide activity search/i }))
    await user.click(screen.getByRole('button', { name: /filter activity by network/i }))
    await user.click(screen.getByRole('menuitemradio', { name: 'All networks' }))
    expect(screen.getByText('Deposit')).toBeInTheDocument()
  })

  it('finds entries by network name through search', async () => {
    const user = userEvent.setup()
    render(<RecentActivityFeed entries={merged} chainId={80002} />)
    await user.click(screen.getByRole('button', { name: /search activity/i }))
    await user.type(screen.getByRole('searchbox', { name: /search activity/i }), 'mordor')
    expect(screen.getByText('Payout')).toBeInTheDocument()
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument()
  })
})
