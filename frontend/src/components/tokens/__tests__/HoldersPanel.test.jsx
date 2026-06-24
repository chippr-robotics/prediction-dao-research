import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HoldersPanel from '../HoldersPanel'
import { fetchHolders } from '../tokenSubgraph'

// Phase 13 (P3-b, US10, T092): holder cap table — renders ranked holders + % of supply from the subgraph, and
// disables truthfully (no fabricated rows) on subgraph-less networks (FR-043).

vi.mock('../tokenSubgraph', () => ({ fetchHolders: vi.fn(), fetchActivity: vi.fn() }))
vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({ name: 'Ethereum Classic Mordor', explorer: { baseUrl: '' } }),
}))

const A = (n) => '0x' + String(n).padStart(40, '0')
const token = { tokenAddress: A(170), symbol: 'TKN' }
const caps = { decimals: 18 }

describe('HoldersPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a ranked cap table with % of supply', async () => {
    fetchHolders.mockResolvedValue({
      available: true,
      holders: [
        { account: A(1), balance: '600000000000000000000', firstHeldAt: '1700000000' },
        { account: A(2), balance: '400000000000000000000', firstHeldAt: '1700000000' },
      ],
    })
    render(<HoldersPanel token={token} caps={caps} chainId={80002} />)
    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('600.0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled()
  })

  it('disables truthfully on a subgraph-less network', async () => {
    fetchHolders.mockResolvedValue({ available: false, holders: [] })
    render(<HoldersPanel token={token} caps={caps} chainId={63} />)
    await waitFor(() =>
      expect(screen.getByText(/no subgraph deployed, so the cap table is unavailable/i)).toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument()
  })
})
