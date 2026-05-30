import { useState, useMemo, useCallback, useEffect } from 'react'
import { useChainTokens } from '../../hooks/useChainTokens'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useFriendMarkets } from '../../contexts/FriendMarketsContext.js'
import {
  usePolymarketSearch,
  usePolymarketTopMarkets,
} from '../../hooks/usePolymarketSearch'
import './PolymarketBrowser.css'

// Canonical filter chips. Slugs match Polymarket's `tag_slug` values; labels
// are what the user sees.
const QUICK_FILTERS = [
  { slug: 'politics', label: 'Politics' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'crypto', label: 'Crypto' },
  { slug: 'pop-culture', label: 'Pop Culture' },
  { slug: 'business', label: 'Business' },
  { slug: 'tech', label: 'Tech' },
]

const SEARCH_DEBOUNCE_MS = 350

const formatVolume = (v) => {
  if (v == null || Number.isNaN(v)) return null
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${Math.round(v)}`
}

const normaliseCategoryString = (c) => {
  if (!c) return ''
  if (Array.isArray(c)) return c.join(' ').toLowerCase()
  return String(c).toLowerCase()
}

/**
 * Build a Set of category slugs/keywords gleaned from the user's prior friend
 * markets. We don't have a structured category on past wagers, so we
 * substring-match against the description as a first pass.
 */
function buildHistoryCategorySet(friendMarkets) {
  const set = new Set()
  for (const m of friendMarkets || []) {
    const desc = (m?.description || '').toLowerCase()
    for (const { slug } of QUICK_FILTERS) {
      if (desc.includes(slug.replace('-', ' ')) || desc.includes(slug)) {
        set.add(slug)
      }
    }
  }
  return set
}

/**
 * Reusable Polymarket market browser. Used as a dashboard feed (variant="feed")
 * and as an in-modal market picker (variant="inline"). Self-gates on chain
 * capability — returns null on chains without Polymarket support.
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
  const { friendMarkets } = useFriendMarkets()

  // Filter state. We avoid an effect-driven sync from preferences by deriving
  // the effective filter set: if the user has touched the chips, use their
  // local state; otherwise fall back to the prop or the saved preference
  // (which may arrive async after the wallet connects).
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
    search: runSearch,
    clear: clearSearch,
  } = usePolymarketSearch({ limit })

  // Debounce-and-fire search whenever the query changes.
  useEffect(() => {
    if (!trimmedQuery) {
      clearSearch()
      return undefined
    }
    const handle = setTimeout(() => runSearch(trimmedQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [trimmedQuery, runSearch, clearSearch])

  const isSearchMode = trimmedQuery.length > 0
  const rawResults = isSearchMode ? searchResults : topResults
  const isLoading = isSearchMode ? searchLoading : topLoading
  const error = isSearchMode ? searchError : topError

  // History-boost ranking. Boost factor mixes user's saved category prefs
  // with categories inferred from their past wagers.
  const historySlugs = useMemo(() => buildHistoryCategorySet(friendMarkets), [friendMarkets])
  const savedSlugs = useMemo(
    () => new Set(preferences?.polymarketCategories || []),
    [preferences?.polymarketCategories],
  )

  const rankedResults = useMemo(() => {
    const scored = (rawResults || []).map((m) => {
      const cat = normaliseCategoryString(m.category)
      let boost = 1
      for (const slug of savedSlugs) {
        if (cat.includes(slug.replace('-', ' ')) || cat.includes(slug)) {
          boost += 0.5
          break
        }
      }
      for (const slug of historySlugs) {
        if (cat.includes(slug.replace('-', ' ')) || cat.includes(slug)) {
          boost += 0.5
          break
        }
      }
      const volume = Number(m.volume) || 0
      // Search results return relevance-ordered already — skip volume in their score
      // but keep history/category nudge so familiar markets still float up.
      const score = isSearchMode ? boost : (volume || 1) * boost
      return { market: m, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.market)
  }, [rawResults, savedSlugs, historySlugs, isSearchMode])

  const toggleCategory = useCallback((slug) => {
    // First touch: snapshot the currently-shown filter set so toggles operate
    // on it (the lazy initialiser may have missed the async-loaded preferences).
    const base = userTouched ? localCategories : activeCategories
    setUserTouched(true)
    setLocalCategories(
      base.includes(slug) ? base.filter((s) => s !== slug) : [...base, slug]
    )
    if (trimmedQuery) {
      setQuery('')
    }
  }, [userTouched, localCategories, activeCategories, trimmedQuery])

  const clearAllFilters = useCallback(() => {
    setUserTouched(true)
    setLocalCategories([])
  }, [])

  const handleRetry = useCallback(() => {
    if (isSearchMode) {
      runSearch(trimmedQuery)
    } else {
      refreshTop()
    }
  }, [isSearchMode, runSearch, trimmedQuery, refreshTop])

  if (!polymarketSidebetsEnabled) return null

  const rootClassName = `pmb pmb--${variant}${className ? ` ${className}` : ''}`

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

          {!isLoading && !error && rankedResults.length === 0 && (
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

          {!isLoading && !error && rankedResults.length > 0 && (
            <ul className={`pmb__grid pmb__grid--${variant}`} role="list">
              {rankedResults.map((m) => {
                const isSelected = selectedConditionId && m.conditionId === selectedConditionId
                const vol = formatVolume(m.volume)
                return (
                  <li key={m.conditionId} className="pmb__card-wrapper">
                    <button
                      type="button"
                      className={`pmb__card ${isSelected ? 'pmb__card--selected' : ''}`}
                      onClick={() => onSelectMarket?.(m)}
                    >
                      <div className="pmb__card-question">{m.question}</div>
                      <div className="pmb__card-meta">
                        {m.category && (
                          <span className="pmb__card-tag">{normaliseCategoryString(m.category)}</span>
                        )}
                        {vol && <span className="pmb__card-volume">{vol} vol</span>}
                      </div>
                      {isSelected && <span className="pmb__card-selected-badge">Selected</span>}
                    </button>
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
