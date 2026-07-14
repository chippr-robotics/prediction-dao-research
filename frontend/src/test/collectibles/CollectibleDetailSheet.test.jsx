/**
 * CollectibleDetailSheet (spec 055 US2) — traits/floor/offer with honest "none yet" states
 * (FR-003/FR-013), exact deep link (FR-004), modal behavior, read-only (FR-005), axe (FR-014).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import CollectibleDetailSheet from '../../components/collectibles/CollectibleDetailSheet'
import { fetchCollectibleDetail } from '../../lib/collectibles/gatewayClient'
import { useCollectibleSell } from '../../hooks/useCollectibleSell'

const SELLER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

vi.mock('../../lib/collectibles/gatewayClient', () => ({
  fetchCollectibleDetail: vi.fn(),
  CollectiblesUnavailable: class CollectiblesUnavailable extends Error {},
}))
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => ({ address: SELLER }) }))
vi.mock('../../hooks/useCollectibleSell', () => ({ useCollectibleSell: vi.fn() }))
vi.mock('../../components/collectibles/SellConfirm', () => ({
  default: ({ onClose }) => (
    <div data-testid="sell-confirm">
      <button onClick={onClose}>close-sell</button>
    </div>
  ),
}))

const sellState = (over = {}) => ({
  status: 'ready',
  reason: null,
  result: null,
  canSell: true,
  unsupportedReason: null,
  onWrongNetwork: false,
  loadFees: vi.fn(),
  preview: vi.fn(),
  submitListing: vi.fn(),
  acceptOffer: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  ...over,
})

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
  bestOfferHash: '0x' + 'cd'.repeat(32),
  listing: { orderHash: '0x' + 'ef'.repeat(32), maker: SELLER, price: { amount: '1', currency: 'ETH' } },
  fetchedAt: '2026-07-13T20:00:00Z',
  stale: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchCollectibleDetail.mockResolvedValue(DETAIL)
  useCollectibleSell.mockReturnValue(sellState())
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

  it('opens the Sell confirmation from the detail sheet (spec 056 US1)', async () => {
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^sell$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^sell$/i }))
    expect(screen.getByTestId('sell-confirm')).toBeInTheDocument()
  })

  it('accepting the best offer discloses on-chain gas before confirming (FR-006)', async () => {
    const state = sellState()
    useCollectibleSell.mockReturnValue(state)
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /accept best offer/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /accept best offer/i }))
    expect(screen.getByText(/you pay gas/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept & pay gas/i }))
    expect(state.acceptOffer).toHaveBeenCalledWith({ orderHash: DETAIL.bestOfferHash })
  })

  it('shows Cancel only for a listing this wallet owns, and cancels on confirm (spec 056 US3)', async () => {
    const state = sellState()
    useCollectibleSell.mockReturnValue(state)
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /cancel listing/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /cancel listing/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }))
    expect(state.cancel).toHaveBeenCalledWith(DETAIL.listing)
  })

  it('shows an honest reason (never a dead button) when the account type cannot sell (FR-019)', async () => {
    useCollectibleSell.mockReturnValue(sellState({ canSell: false, unsupportedReason: "Selling isn't available for passkey accounts yet." }))
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent(/passkey accounts yet/i))
    expect(screen.queryByRole('button', { name: /^sell$/i })).not.toBeInTheDocument()
    // The always-available fallback remains.
    expect(screen.getByRole('link', { name: /view on opensea/i })).toBeInTheDocument()
  })

  it('never offers a Buy affordance (sell-side only this phase)', async () => {
    render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('0.85 ETH')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /buy/i })).not.toBeInTheDocument()
  })

  it('has no axe violations (FR-014)', async () => {
    const { container } = render(<CollectibleDetailSheet item={ITEM} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Golden')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
