import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { axe } from 'vitest-axe'

// Enable the picker (it self-gates on chain capability) and provide preferences.
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: () => ({ capabilities: { polymarketSidebets: true } }),
}))
vi.mock('../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: {} }),
}))

import PolymarketBrowser from '../components/fairwins/PolymarketBrowser'
import { installGammaFetch, urlHas, urlHasAll } from './helpers/mockGammaFetch'
import {
  searchKnicksPayload,
  topEventsDefault,
  sportsEvents,
  cryptoEvents,
} from './fixtures/polymarket'

const renderInline = (props = {}) =>
  render(<PolymarketBrowser variant="inline" {...props} />)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PolymarketBrowser — search & grouping (US1)', () => {
  it('shows relevant grouped events; a multi-sub-market event expands and a single-market event selects directly', async () => {
    installGammaFetch([
      { match: urlHas('/public-search'), json: searchKnicksPayload },
      { match: urlHas('/events'), json: topEventsDefault },
    ])
    const onSelectMarket = vi.fn()
    renderInline({ onSelectMarket })

    fireEvent.change(screen.getByLabelText('Search Polymarket events'), {
      target: { value: 'knicks' },
    })

    // Grouped event row appears (3 sub-markets) — collapsed by default.
    const eventHeader = await screen.findByRole('button', { name: /Pacers vs\. Knicks/ })
    expect(eventHeader).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/3 markets/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Moneyline/ })).not.toBeInTheDocument()

    // Expand → sub-markets revealed → select one.
    fireEvent.click(eventHeader)
    expect(eventHeader).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(await screen.findByRole('button', { name: /Moneyline/ }))
    expect(onSelectMarket).toHaveBeenCalledWith(
      expect.objectContaining({ conditionId: '0xk1' }),
    )

    // Single-market event renders as a direct card.
    fireEvent.click(screen.getByRole('button', { name: /Will the Knicks win the championship\?/ }))
    expect(onSelectMarket).toHaveBeenCalledWith(
      expect.objectContaining({ conditionId: '0xkt' }),
    )
  })
})

describe('PolymarketBrowser — category browse (US2)', () => {
  it('narrows by category and unions multiple categories (OR), with multi-select chips', async () => {
    installGammaFetch([
      { match: urlHasAll('/events', 'tag_id=1'), json: sportsEvents },
      { match: urlHasAll('/events', 'tag_id=21'), json: cryptoEvents },
      { match: urlHas('/events'), json: topEventsDefault },
    ])
    renderInline()

    // Default top events.
    expect(await screen.findByText('Will the incumbent be re-elected?')).toBeInTheDocument()

    // Sports only.
    const sportsChip = screen.getByRole('button', { name: 'Sports' })
    fireEvent.click(sportsChip)
    expect(await screen.findByText('World Cup Winner')).toBeInTheDocument()
    expect(sportsChip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Will the incumbent be re-elected?')).not.toBeInTheDocument()

    // Add Crypto → union of sports OR crypto.
    fireEvent.click(screen.getByRole('button', { name: 'Crypto' }))
    expect(await screen.findByText('Will BTC be above $100k?')).toBeInTheDocument()
    expect(screen.getByText('World Cup Winner')).toBeInTheDocument()

    // Clear → back to default top events.
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('Will the incumbent be re-elected?')).toBeInTheDocument()
  })
})

describe('PolymarketBrowser — search within category (US3)', () => {
  it('preserves the typed query when toggling a category and constrains results to it', async () => {
    installGammaFetch([
      { match: urlHas('/public-search'), json: searchKnicksPayload },
      { match: urlHas('/events'), json: topEventsDefault },
    ])
    renderInline()
    const input = screen.getByLabelText('Search Polymarket events')

    fireEvent.change(input, { target: { value: 'knicks' } })
    await screen.findByRole('button', { name: /Pacers vs\. Knicks/ })

    // Toggle Crypto: the fixture events are Sports-tagged, so the constrained
    // search yields nothing — but the typed query must be preserved.
    fireEvent.click(screen.getByRole('button', { name: 'Crypto' }))
    expect(input).toHaveValue('knicks')
    expect(await screen.findByText(/No matching Polymarket events/)).toBeInTheDocument()

    // Removing the category broadens back to the query alone.
    fireEvent.click(screen.getByRole('button', { name: 'Crypto' }))
    expect(await screen.findByRole('button', { name: /Pacers vs\. Knicks/ })).toBeInTheDocument()
    expect(input).toHaveValue('knicks')
  })
})

describe('PolymarketBrowser — trustworthy states (US4)', () => {
  it('shows an error with a working Retry on failure', async () => {
    let failNext = true
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/public-search')) {
        if (failNext) {
          failNext = false
          return { ok: false, status: 500, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => searchKnicksPayload }
      }
      return { ok: true, status: 200, json: async () => topEventsDefault }
    })
    vi.stubGlobal('fetch', fetchMock)

    renderInline()
    fireEvent.change(screen.getByLabelText('Search Polymarket events'), {
      target: { value: 'knicks' },
    })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Could not load Polymarket markets/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: /Pacers vs\. Knicks/ })).toBeInTheDocument()
  })

  it('shows a distinct empty state when a category has no markets', async () => {
    installGammaFetch([
      { match: urlHasAll('/events', 'tag_id=1'), json: [] },
      { match: urlHas('/events'), json: topEventsDefault },
    ])
    renderInline()
    await screen.findByText('Will the incumbent be re-elected?')

    fireEvent.click(screen.getByRole('button', { name: 'Sports' }))
    expect(await screen.findByText(/No active markets match these categories/)).toBeInTheDocument()
  })

  it('has no accessibility violations in the default and expanded states', async () => {
    installGammaFetch([
      { match: urlHas('/public-search'), json: searchKnicksPayload },
      { match: urlHas('/events'), json: topEventsDefault },
    ])
    const { container } = renderInline()
    await screen.findByText('Will the incumbent be re-elected?')
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.change(screen.getByLabelText('Search Polymarket events'), {
      target: { value: 'knicks' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Pacers vs\. Knicks/ }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
