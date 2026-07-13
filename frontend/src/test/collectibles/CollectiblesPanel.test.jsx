/**
 * CollectiblesPanel (spec 055 US1) — grid render, empty/degraded states, flagged-item
 * toggle (FR-012), quantity badge, image fallback, read-only guarantee, axe pass (FR-014).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import CollectiblesPanel from '../../components/collectibles/CollectiblesPanel'
import { useCollectibles } from '../../hooks/useCollectibles'

vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ isConnected: true, openConnectModal: vi.fn() }),
}))
vi.mock('../../hooks/useCollectibles', () => ({
  useCollectibles: vi.fn(),
}))
vi.mock('../../components/collectibles/CollectibleDetailSheet', () => ({
  default: ({ item }) => (item ? <div data-testid="collectible-sheet">{item.name}</div> : null),
}))

const ITEMS = [
  {
    chainId: 137,
    contract: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
    identifier: '1',
    name: 'Cool Cat #1',
    collectionSlug: 'cool-cats',
    imageUrl: 'https://img.example/1.png',
    quantity: 1,
    isFlagged: false,
    openseaUrl: 'https://opensea.io/assets/matic/0xaaa/1',
  },
  {
    chainId: 137,
    contract: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
    identifier: '2',
    name: 'Copies',
    collectionSlug: 'cool-cats',
    imageUrl: null,
    quantity: 5,
    isFlagged: false,
    openseaUrl: 'https://opensea.io/assets/matic/0xaaa/2',
  },
  {
    chainId: 137,
    contract: '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb',
    identifier: '3',
    name: 'Sus Airdrop',
    collectionSlug: 'spam-co',
    imageUrl: null,
    quantity: 1,
    isFlagged: true,
    openseaUrl: 'https://opensea.io/assets/matic/0xbbb/3',
  },
]

const hookState = (overrides = {}) => ({
  supported: true,
  status: 'ready',
  chainId: 137,
  items: ITEMS,
  hasMore: false,
  loadMore: vi.fn(),
  loadingMore: false,
  stale: false,
  fetchedAt: '2026-07-13T20:00:00Z',
  refresh: vi.fn(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  useCollectibles.mockReturnValue(hookState())
})

describe('CollectiblesPanel', () => {
  it('renders owned items as cards and hides flagged items by default (FR-012)', () => {
    render(<CollectiblesPanel />)
    expect(screen.getByText('Cool Cat #1')).toBeInTheDocument()
    expect(screen.queryByText('Sus Airdrop')).not.toBeInTheDocument()
    // The toggle reveals them without deleting anything.
    fireEvent.click(screen.getByRole('checkbox', { name: /flagged as spam/i }))
    expect(screen.getByText('Sus Airdrop')).toBeInTheDocument()
  })

  it('shows the owned quantity for multi-copy items and a placeholder for missing images', () => {
    render(<CollectiblesPanel />)
    expect(screen.getByText('×5')).toBeInTheDocument()
    const copies = screen.getByRole('button', { name: /Copies, cool-cats/i })
    expect(copies.querySelector('img')).toBeNull() // placeholder, not a broken img
  })

  it('falls back to the placeholder when an image errors, keeping the item selectable', () => {
    render(<CollectiblesPanel />)
    const img = screen.getByRole('button', { name: /Cool Cat #1/i }).querySelector('img')
    fireEvent.error(img)
    const card = screen.getByRole('button', { name: /Cool Cat #1/i })
    expect(card.querySelector('img')).toBeNull()
    fireEvent.click(card)
    expect(screen.getByTestId('collectible-sheet')).toHaveTextContent('Cool Cat #1')
  })

  it('renders the empty state with an OpenSea explore link for empty wallets', () => {
    useCollectibles.mockReturnValue(hookState({ status: 'empty', items: [] }))
    render(<CollectiblesPanel />)
    expect(screen.getByText(/no collectibles here yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /explore opensea/i })).toBeInTheDocument()
  })

  it('renders an explicit degraded state with retry + marketplace link on outage (FR-008)', () => {
    useCollectibles.mockReturnValue(hookState({ status: 'degraded', items: [] }))
    render(<CollectiblesPanel />)
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open opensea/i })).toHaveAttribute('href', 'https://opensea.io')
  })

  it('labels stale cached data with its fetch time (FR-013)', () => {
    useCollectibles.mockReturnValue(hookState({ stale: true }))
    render(<CollectiblesPanel />)
    expect(screen.getByRole('status')).toHaveTextContent(/cached data/i)
  })

  it('offers a load-more affordance for large holdings (SC-007)', () => {
    const state = hookState({ hasMore: true })
    useCollectibles.mockReturnValue(state)
    render(<CollectiblesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /load more/i }))
    expect(state.loadMore).toHaveBeenCalled()
  })

  it('is strictly read-only: no buy/sell/list/transfer affordances anywhere (FR-005)', () => {
    render(<CollectiblesPanel />)
    for (const label of [/buy/i, /sell/i, /^list/i, /transfer/i, /make offer/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('has no axe violations in the ready state (FR-014)', async () => {
    const { container } = render(<CollectiblesPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
