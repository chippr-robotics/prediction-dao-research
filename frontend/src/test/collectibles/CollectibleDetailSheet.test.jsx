/**
 * CollectibleDetailSheet (spec 055 US2) — traits/floor/offer with honest "none yet" states
 * (FR-003/FR-013), exact deep link (FR-004), modal behavior, read-only (FR-005), axe (FR-014).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import CollectibleDetailSheet from '../../components/collectibles/CollectibleDetailSheet'
import { fetchCollectibleDetail } from '../../lib/collectibles/gatewayClient'

vi.mock('../../lib/collectibles/gatewayClient', () => ({
  fetchCollectibleDetail: vi.fn(),
  CollectiblesUnavailable: class CollectiblesUnavailable extends Error {},
}))

const ITEM = {
  chainId: 137,
  contract: '0x2953399124F0cBB46d2CbACD8A89cF0599974963',
  identifier: '1234',
  name: 'Cool Cat #1234',
  collectionSlug: 'cool-cats',
  imageUrl: 'https://img.example/1234.png',
  quantity: 1,
  isFlagged: false,
  openseaUrl: 'https://opensea.io/assets/matic/0x2953399124f0cbb46d2cbacd8a89cf0599974963/1234',
}

const DETAIL = {
  ...ITEM,
  description: 'A very cool cat.',
  traits: [{ traitType: 'Fur', value: 'Golden' }],
  owner: null,
  collection: {
    slug: 'cool-cats',
    name: 'Cool Cats',
    imageUrl: null,
    openseaUrl: 'https://opensea.io/collection/cool-cats',
    floorPrice: { amount: '0.85', currency: 'ETH' },
  },
  bestOffer: { amount: '0.79', currency: 'WETH' },
  fetchedAt: '2026-07-13T20:00:00Z',
  stale: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchCollectibleDetail.mockResolvedValue(DETAIL)
})

describe('CollectibleDetailSheet', () => {
  it('renders nothing without an item', () => {
    const { container } = render(<CollectibleDetailSheet item={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows traits, labeled floor price, and best offer from the composed detail (FR-003)', async () => {
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Golden')).toBeInTheDocument())
    expect(screen.getByText('0.85 ETH')).toBeInTheDocument()
    expect(screen.getByText('0.79 WETH')).toBeInTheDocument()
    expect(screen.getByText('Cool Cats')).toBeInTheDocument()
    expect(fetchCollectibleDetail).toHaveBeenCalledWith(137, ITEM.contract, '1234')
  })

  it('renders explicit "none yet" states instead of zeros when floor/offer are missing (FR-013)', async () => {
    fetchCollectibleDetail.mockResolvedValue({ ...DETAIL, collection: { ...DETAIL.collection, floorPrice: null }, bestOffer: null })
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/no floor price yet/i)).toBeInTheDocument())
    expect(screen.getByText(/no offers yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/^0\s/)).not.toBeInTheDocument()
  })

  it('degrades market fields to "unavailable" when the detail fetch fails, keeping grid data visible', async () => {
    fetchCollectibleDetail.mockRejectedValue(new Error('down'))
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByText(/unavailable right now/i)).toHaveLength(2))
    expect(screen.getByRole('heading', { name: 'Cool Cat #1234' })).toBeInTheDocument()
  })

  it('deep-links to the exact item on OpenSea in a new browsing context (FR-004)', async () => {
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    const link = screen.getByRole('link', { name: /view on opensea/i })
    expect(link).toHaveAttribute('href', ITEM.openseaUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('labels stale market data with its fetch time (FR-013)', async () => {
    fetchCollectibleDetail.mockResolvedValue({ ...DETAIL, stale: true })
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/out of date/i))
  })

  it('closes on Escape and via the backdrop scrim', async () => {
    const onClose = vi.fn()
    render(<CollectibleDetailSheet item={ITEM} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /close collectible details/i }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('offers no in-app trading affordances — the deep link is the only action (FR-005)', async () => {
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('0.85 ETH')).toBeInTheDocument())
    for (const label of [/buy/i, /sell/i, /accept/i, /transfer/i, /make offer/i, /^list/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.getByText(/happen on OpenSea/i)).toBeInTheDocument()
  })

  it('has no axe violations (FR-014)', async () => {
    const { container } = render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Golden')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
