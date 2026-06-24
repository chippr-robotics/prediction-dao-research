import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActivityPanel from '../ActivityPanel'
import { fetchActivity } from '../tokenSubgraph'

// Phase 13 (P3-b, US12, T092): activity feed — renders indexed events with category filtering, and disables
// truthfully on subgraph-less networks (FR-043).

vi.mock('../tokenSubgraph', () => ({ fetchHolders: vi.fn(), fetchActivity: vi.fn() }))
vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({ name: 'Ethereum Classic Mordor', explorer: { baseUrl: 'https://explorer.test' } }),
}))

const A = (n) => '0x' + String(n).padStart(40, '0')
const token = { tokenAddress: A(170), symbol: 'TKN' }
const caps = { decimals: 18 }

describe('ActivityPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders activity rows and filters by category', async () => {
    fetchActivity.mockResolvedValue({
      available: true,
      activity: [
        { id: '1', type: 'mint', actor: A(1), to: A(1), amount: '1000000000000000000', timestamp: '1700000000', txHash: '0xabc' },
        { id: '2', type: 'transfer', from: A(1), to: A(2), actor: A(1), amount: '500000000000000000', timestamp: '1700000100', txHash: '0xdef' },
      ],
    })
    const user = userEvent.setup()
    render(<ActivityPanel token={token} caps={caps} chainId={80002} />)
    expect(await screen.findByText('Mint')).toBeInTheDocument()
    expect(screen.getByText('Transfer')).toBeInTheDocument()

    // Filter to Admin — neither row is an admin event, so the empty state shows.
    await user.click(screen.getByRole('radio', { name: /admin/i }))
    expect(screen.getByText(/no admin activity indexed yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Mint')).not.toBeInTheDocument()
  })

  it('disables truthfully on a subgraph-less network', async () => {
    fetchActivity.mockResolvedValue({ available: false, activity: [] })
    render(<ActivityPanel token={token} caps={caps} chainId={63} />)
    await waitFor(() =>
      expect(screen.getByText(/no subgraph deployed, so the event history is unavailable/i)).toBeInTheDocument()
    )
  })
})
