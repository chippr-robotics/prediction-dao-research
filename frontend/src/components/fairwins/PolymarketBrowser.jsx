import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useChainTokens } from '../../hooks/useChainTokens'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import {
  usePolymarketSearch,
  usePolymarketTopMarkets,
} from '../../hooks/usePolymarketSearch'
import './PolymarketBrowser.css'

// Canonical filter chips. Slugs map to Polymarket numeric tag ids inside the
// hooks; labels are what the user sees.
const QUICK_FILTERS = [
  { slug: 'politics', label: 'Politics' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'crypto', label: 'Crypto' },
  { slug: 'pop-culture', label: 'Pop Culture' },
  { slug: 'business', label: 'Business' },
  { slug: 'tech', label: 'Tech' },
]

const SEARCH_DEBOUNCE_MS = 325

const formatVolume = (v) => {
  if (v == null || Number.isNaN(v)) return null
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${Math.round(v)}`
}

/**
 * Reusable Polymarket market browser. Used as a dashboard feed (variant="feed")
 * and as an in-modal market picker (variant="inline"). Self-gates on chain
 * capability — returns null on chains without Polymarket support.
 *
 * Results are grouped by event: an event with several related markets (e.g. a
 * game's moneyline/spreads/over-unders) shows as one expandable row; a
 * single-market event selects directly.
 */
function PolymarketBrowser({
  onSelectMarket,
  variant = 'feed',
  defaultCategories,
  limit = 12,
  showFilters = true,
  selectedConditionId = null,
  className = '',
}) {
  const { capabilities } = useChainTokens()
  const polymarketSidebetsEnabled = Boolean(capabilities?.polymarketSidebets)

  const { preferences } = useUserPreferences()

  // Filter state. Derive the effective filter set: if the user has touched the
  // chips, use their local state; otherwise fall back to the prop or the saved
  // preference (which may arrive async after the wallet connects).
  const [userTouched, setUserTouched] = useState(false)
  const [localCategories, setLocalCategories] = useState(() => {
    if (Array.isArray(defaultCategories)) return defaultCategories
    return Array.isArray(preferences?.polymarketCategories) ? preferences.polymarketCategories : []
  })
  const activeCategories = useMemo(() => {
    if (userTouched) return localCategories
    if (Array.isArray(defaultCategories)) return defaultCategories
    return Array.isArray(preferences?.polymarketCategories) ? preferences.polymarketCategories : []
  }, [userTouched, localCategories, defaultCategories, preferences])

  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim()

  const [expandedEventIds, setExpandedEventIds] = useState(() => new Set())

  // Feed-variant accordion state. Inline variant is always expanded.
  const [isExpanded, setIsExpanded] = useState(false)
  const isFeed = variant === 'feed'
  const showContent = !isFeed || isExpanded

  const {
    results: topResults,
    isLoading: topLoading,
    error: topError,
    refresh: refreshTop,
  } = usePolymarketTopMarkets({ categories: activeCategories, limit })

  const {
    results: searchResults,
    isLoading: searchLoading,
    error: searchError,
    runSearch,
    clear: clearSearch,
  } = usePolymarketSearch({ limit, categories: activeCategories })

  // Single debounce: drive the (immediate) hook search from the input. The hook
  // re-creates runSearch when the active categories change, so this effect also
  // re-fires to keep search constrained to the selected categories.
  const debounceRef = useRef(null)
  useEffect(() => {
    if (!trimmedQuery) {
      clearSearch()
      return undefined
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(trimmedQuery), SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmedQuery, runSearch, clearSearch])

  const isSearchMode = trimmedQuery.length > 0
  const events = isSearchMode ? searchResults : topResults
  const isLoading = isSearchMode ? searchLoading : topLoading
  const error = isSearchMode ? searchError : topError

  const toggleCategory = useCallback((slug) => {
    const base = userTouched ? localCategories : activeCategories
    setUserTouched(true)
    setLocalCategories(
      base.includes(slug) ? base.filter((s) => s !== slug) : [...base, slug],
    )
    // NOTE: the query is intentionally preserved here so toggling a filter
    // refines (not resets) an in-progress search.
  }, [userTouched, localCategories, activeCategories])

  const clearAllFilters = useCallback(() => {
    setUserTouched(true)
    setLocalCategories([])
  }, [])

  const toggleEvent = useCallback((eventId) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }, [])

  const handleRetry = useCallback(() => {
    if (isSearchMode) runSearch(trimmedQuery)
    else refreshTop()
  }, [isSearchMode, runSearch, trimmedQuery, refreshTop])

  if (!polymarketSidebetsEnabled) return null

  const rootClassName = `pmb pmb--${variant}${className ? ` ${className}` : ''}`

  const renderMarketCard = (market) => {
    const isSelected = selectedConditionId && market.conditionId === selectedConditionId
    const vol = formatVolume(market.volume)
    return (
      <button
        type="button"
        className={`pmb__card ${isSelected ? 'pmb__card--selected' : ''}`}
        onClick={() => onSelectMarket?.(market)}
      >
        <div className="pmb__card-question">{market.label || market.question}</div>
        <div className="pmb__card-meta">
          {vol && <span className="pmb__card-volume">{vol} vol</span>}
        </div>
        {isSelected && <span className="pmb__card-selected-badge">Selected</span>}
      </button>
    )
  }

  return (
    <section className={rootClassName} aria-label="Polymarket markets">
      {isFeed && (
        <button
          type="button"
          className="pmb__header pmb__header--toggle"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          data-expanded={isExpanded ? 'true' : 'false'}
        >
          <span className="pmb__header-text">
            <span className="pmb__title">Top from Polymarket</span>
            <span className="pmb__subtitle">Tap a market to start a wager</span>
          </span>
          <span className="pmb__toggle-chevron" aria-hidden="true">{'▼'}</span>
        </button>
      )}

      {variant === 'inline' && (
        <div className="pmb__search-row">
          <input
            type="text"
            className="pmb__search-input"
            placeholder="Search Polymarket events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search Polymarket events"
          />
          {query && (
            <button
              type="button"
              className="pmb__search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {showContent && (
        <>
          {showFilters && (
            <div className="pmb__filters" role="group" aria-label="Category filters">
              {QUICK_FILTERS.map(({ slug, label }) => {
                const isActive = activeCategories.includes(slug)
                return (
                  <button
                    key={slug}
                    type="button"
                    className={`pmb__chip ${isActive ? 'pmb__chip--active' : ''}`}
                    onClick={() => toggleCategory(slug)}
                    aria-pressed={isActive}
                  >
                    {label}
                  </button>
                )
              })}
              {activeCategories.length > 0 && (
                <button
                  type="button"
                  className="pmb__chip pmb__chip--clear"
                  onClick={clearAllFilters}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="pmb__error" role="alert">
              <span>Could not load Polymarket markets: {error}</span>
              <button type="button" className="pmb__retry" onClick={handleRetry}>
                Retry
              </button>
            </div>
          )}

          {isLoading && !error && (
            <div className={`pmb__grid pmb__grid--${variant}`} aria-busy="true">
              {Array.from({ length: variant === 'inline' ? 4 : 6 }).map((_, i) => (
                <div key={i} className="pmb__card pmb__card--skeleton" aria-hidden="true" />
              ))}
            </div>
          )}

          {!isLoading && !error && events.length === 0 && (
            <div className="pmb__empty">
              {isSearchMode ? (
                <p>No matching Polymarket events.</p>
              ) : activeCategories.length > 0 ? (
                <>
                  <p>No active markets match these categories.</p>
                  <button type="button" className="pmb__link" onClick={clearAllFilters}>
                    Browse all categories
                  </button>
                </>
              ) : (
                <p>No active Polymarket markets right now.</p>
              )}
            </div>
          )}

          {!isLoading && !error && events.length > 0 && (
            <ul className={`pmb__grid pmb__grid--${variant}`} role="list">
              {events.map((ev) => {
                // Single-market event: select directly, no expand affordance.
                if (ev.markets.length === 1) {
                  return (
                    <li key={ev.id} className="pmb__card-wrapper">
                      {renderMarketCard(ev.markets[0])}
                    </li>
                  )
                }

                const isOpen = expandedEventIds.has(ev.id)
                const vol = formatVolume(ev.volume)
                return (
                  <li key={ev.id} className="pmb__event">
                    <button
                      type="button"
                      className="pmb__event-header"
                      onClick={() => toggleEvent(ev.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="pmb__event-title">{ev.title}</span>
                      <span className="pmb__event-meta">
                        <span className="pmb__event-count">{ev.markets.length} markets</span>
                        {vol && <span className="pmb__card-volume">{vol} vol</span>}
                        <span className="pmb__event-chevron" aria-hidden="true">
                          {isOpen ? '▾' : '▸'}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="pmb__submarkets" role="list">
                        {ev.markets.map((market) => (
                          <li key={market.conditionId} className="pmb__card-wrapper">
                            {renderMarketCard(market)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

export default PolymarketBrowser
