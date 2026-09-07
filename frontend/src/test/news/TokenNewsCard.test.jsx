/**
 * TokenNewsCard tests (spec 109 US1): every FeedReading state renders its DISTINCT honest copy,
 * third-party content stays text-only, retry re-invokes the seam, not-configured renders nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TokenNewsCard, { newsAgeLabel } from '../../components/news/TokenNewsCard'

const mockFetchTokenNews = vi.fn()
vi.mock('../../lib/news/newsClient', () => ({
  fetchTokenNews: (...args) => mockFetchTokenNews(...args),
}))

const ITEM = {
  id: '1',
  title: 'A headline with <b>markup-looking</b> text',
  url: 'https://news.example/a',
  source: { name: 'Example Wire', slug: 'example' },
  publishedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  sentiment: 1,
}

beforeEach(() => {
  mockFetchTokenNews.mockReset()
})

describe('TokenNewsCard', () => {
  it('renders read items as text with attribution, age, and an external link-out only', async () => {
    mockFetchTokenNews.mockResolvedValue({ state: 'read', items: [ITEM], fetchedAt: null, stale: false })
    render(<TokenNewsCard chainId={137} assetLabel="POL" />)
    const link = await screen.findByRole('link', { name: ITEM.title })
    expect(link).toHaveAttribute('href', ITEM.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    // Text-only rule: the markup-looking title renders as literal text, no injected <b>.
    expect(link.querySelector('b')).toBeNull()
    expect(screen.getByText(/Example Wire · 3h ago/)).toBeInTheDocument()
    // No third-party image ever renders.
    expect(document.querySelector('.token-news-card img')).toBeNull()
  })

  it('honest-empty and unreadable are DIFFERENT states with different words', async () => {
    mockFetchTokenNews.mockResolvedValue({ state: 'read', items: [], fetchedAt: null, stale: false })
    const { unmount } = render(<TokenNewsCard chainId={137} assetLabel="POL" />)
    expect(await screen.findByText('No recent items for POL.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    unmount()

    mockFetchTokenNews.mockResolvedValue({ state: 'unreadable', reason: 'upstream_unreachable' })
    render(<TokenNewsCard chainId={137} assetLabel="POL" />)
    expect(await screen.findByText('The news feed could not be read right now.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(/No recent items/)).toBeNull()
  })

  it('not-covered renders the honest absence sentence, no retry', async () => {
    mockFetchTokenNews.mockResolvedValue({ state: 'not-covered' })
    render(<TokenNewsCard chainId={137} address={'0x' + 'ab'.repeat(20)} assetLabel="MYSTERY" />)
    expect(await screen.findByText('No news source covers MYSTERY.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('not-configured renders NOTHING — no card, no empty affordance', async () => {
    mockFetchTokenNews.mockResolvedValue({ state: 'not-configured' })
    const { container } = render(<TokenNewsCard chainId={137} assetLabel="POL" />)
    await waitFor(() => expect(mockFetchTokenNews).toHaveBeenCalled())
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })

  it('retry re-invokes the seam', async () => {
    mockFetchTokenNews.mockResolvedValueOnce({ state: 'unreadable', reason: 'gateway_unreachable' })
    mockFetchTokenNews.mockResolvedValueOnce({ state: 'read', items: [ITEM], fetchedAt: null, stale: false })
    render(<TokenNewsCard chainId={137} assetLabel="POL" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: ITEM.title })).toBeInTheDocument()
    expect(mockFetchTokenNews).toHaveBeenCalledTimes(2)
  })

  it('newsAgeLabel is coarse and honest at every magnitude', () => {
    const now = Date.parse('2026-09-07T00:00:00Z')
    const at = (msAgo) => new Date(now - msAgo).toISOString()
    expect(newsAgeLabel(at(5 * 60_000), now)).toBe('5m ago')
    expect(newsAgeLabel(at(3 * 3600_000), now)).toBe('3h ago')
    expect(newsAgeLabel(at(5 * 86400_000), now)).toBe('5d ago')
    expect(newsAgeLabel(at(75 * 86400_000), now)).toBe('2mo ago')
    expect(newsAgeLabel('garbage', now)).toBe('')
  })
})
