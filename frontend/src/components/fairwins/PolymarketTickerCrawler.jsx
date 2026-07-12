import { useState, useCallback, useEffect, useRef } from 'react'
import { useChainTokens } from '../../hooks/useChainTokens'
import { usePolymarketTopMarkets } from '../../hooks/usePolymarketSearch'
import './PolymarketTickerCrawler.css'

/**
 * Horizontally-scrolling ticker of top Polymarket markets on the dashboard.
 * Clicking a single-market entry opens the Open Oracle Challenge flow with that
 * market pre-selected (onSelectMarket). Entries backed by an event with several
 * sub-markets (e.g. a race with many candidates) don't select directly — they
 * open a small panel above the ticker listing the sub-markets so the user can
 * pick the exact one.
 *
 * The row is rendered twice and the track translated by -50% so the marquee
 * loops seamlessly; the second copy is aria-hidden and non-interactive so
 * assistive tech and clicks only ever hit each market once. The crawl pauses on
 * hover/focus (so entries are clickable) and while a sub-market panel is open,
 * and stops entirely under prefers-reduced-motion. Self-gates on chain
 * capability — renders nothing on networks without Polymarket support.
 */
function PolymarketTickerCrawler({ onSelectMarket, limit = 12 }) {
  const { capabilities } = useChainTokens()
  const polymarketSidebetsEnabled = Boolean(capabilities?.polymarketSidebets)
  const { results } = usePolymarketTopMarkets({ limit })
  // Which event's sub-market panel is open (null = none). Only one at a time.
  const [openEventId, setOpenEventId] = useState(null)
  const rootRef = useRef(null)

  // Dismiss the sub-market panel on outside click or Escape.
  useEffect(() => {
    if (openEventId == null) return undefined
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpenEventId(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpenEventId(null) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openEventId])

  const handleSelect = useCallback((market) => {
    setOpenEventId(null)
    onSelectMarket?.(market)
  }, [onSelectMarket])

  if (!polymarketSidebetsEnabled || !results?.length) return null

  const items = results
    .map((event) => {
      const markets = Array.isArray(event?.markets) ? event.markets : []
      const title = event?.title || markets[0]?.question || markets[0]?.label
      if (!markets.length || !title) return null
      return { id: event.id, title, markets }
    })
    .filter(Boolean)

  if (!items.length) return null

  const openItem = items.find((item) => item.id === openEventId) || null

  // A single ticker entry. Clones are static (non-interactive) so the marquee's
  // duplicate copy never fires a second selection or panel.
  const renderEntry = (item, clone) => {
    const isGroup = item.markets.length > 1

    if (clone) {
      return (
        <span className={`pm-ticker-item${isGroup ? ' pm-ticker-item--group' : ''}`}>
          {item.title}
          {isGroup && <span className="pm-ticker-count" aria-hidden="true">{item.markets.length}</span>}
        </span>
      )
    }

    if (!isGroup) {
      const market = item.markets[0]
      return (
        <button
          type="button"
          className="pm-ticker-item"
          onClick={() => handleSelect(market)}
        >
          {item.title}
        </button>
      )
    }

    const isOpen = openEventId === item.id
    return (
      <button
        type="button"
        className="pm-ticker-item pm-ticker-item--group"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenEventId((cur) => (cur === item.id ? null : item.id))}
      >
        {item.title}
        <span className="pm-ticker-count" aria-hidden="true">{item.markets.length}</span>
      </button>
    )
  }

  const renderGroup = (clone) => (
    <ul className="pm-ticker-group" aria-hidden={clone || undefined}>
      <li className="pm-ticker-label">Polymarket</li>
      {items.map((item, index) => (
        <li key={`${clone ? 'clone' : 'item'}-${index}-${item.id}`}>
          {renderEntry(item, clone)}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="pm-ticker-root" ref={rootRef}>
      {/* Sub-market list for the open group — sits above the ticker (outside the
          clipped track) so it can't be masked, with the group title beneath it. */}
      {openItem && (
        <div className="pm-ticker-submarkets" role="menu" aria-label={`${openItem.title} markets`}>
          <ul className="pm-ticker-submarket-list">
            {openItem.markets.map((market) => (
              <li key={market.conditionId}>
                <button
                  type="button"
                  role="menuitem"
                  className="pm-ticker-submarket"
                  onClick={() => handleSelect(market)}
                >
                  {market.label || market.question}
                </button>
              </li>
            ))}
          </ul>
          <p className="pm-ticker-submarkets-title">{openItem.title}</p>
        </div>
      )}

      <section
        className={`pm-ticker${openEventId != null ? ' pm-ticker--paused' : ''}`}
        aria-label="Polymarket ticker crawler"
      >
        <div className="pm-ticker-track">
          {renderGroup(false)}
          {renderGroup(true)}
        </div>
      </section>
    </div>
  )
}

export default PolymarketTickerCrawler
