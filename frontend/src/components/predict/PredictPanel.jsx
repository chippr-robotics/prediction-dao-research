/**
 * PredictPanel (spec 057 US1) — the Finance → Predict tab: browse/search live Polymarket markets and
 * open one to buy or sell outcome shares through FairWins' builder code.
 *
 * Soft-fail + honest state: hidden entirely on unsupported networks (the tab never renders this panel
 * off Polygon, FR-018); degraded upstream shows an explicit unavailable state with the Polymarket link
 * still offered (never stranded, FR-017); stale cached data is labeled. Trading lives in the market
 * detail sheet → TradeConfirm, where the builder fee is disclosed honestly.
 */
import { useState } from 'react'
import EmptyState from '../account/EmptyState'
import { usePredictMarkets } from '../../hooks/usePredictMarkets'
import MarketDetailSheet from './MarketDetailSheet'
import './PredictPanel.css'

const POLYMARKET_URL = 'https://polymarket.com'

function MarketCard({ market, onOpen }) {
  const top = market.outcomes[0]
  return (
    <li className="predict-card">
      <button
        type="button"
        className="predict-card-button"
        onClick={() => onOpen(market)}
        aria-haspopup="dialog"
        aria-label={`${market.question}${market.category ? `, ${market.category}` : ''}`}
      >
        <span className="predict-card-question">{market.question}</span>
        <span className="predict-card-meta">
          {market.category && <span className="predict-card-category">{market.category}</span>}
          {top?.price != null && (
            <span className="predict-card-price">
              {top.name} {Math.round(Number(top.price) * 100)}¢
            </span>
          )}
          {!market.tradable && <span className="predict-card-closed">Closed</span>}
        </span>
      </button>
    </li>
  )
}

export default function PredictPanel() {
  const [query, setQuery] = useState('')
  const { status, markets, hasMore, loadMore, loadingMore, stale, fetchedAt, refresh } = usePredictMarkets({ q: query })
  const [openMarket, setOpenMarket] = useState(null)

  return (
    <section className="predict-panel" aria-label="Predict">
      <div className="predict-panel-header">
        <div>
          <h3>Predict</h3>
          <p className="predict-panel-subtitle">
            Trade Polymarket prediction markets. Open a market to buy or sell outcome shares — a small
            FairWins builder fee applies to each trade, shown before you sign.
          </p>
        </div>
        {(status === 'ready' || status === 'empty') && (
          <button type="button" className="predict-refresh" onClick={refresh}>
            Refresh
          </button>
        )}
      </div>

      <label className="predict-search">
        <span className="sr-only">Search markets</span>
        <input
          type="search"
          placeholder="Search markets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search markets"
        />
      </label>

      {stale && (
        <p className="predict-stale-banner" role="status">
          Showing cached data{fetchedAt ? ` from ${new Date(fetchedAt).toLocaleString()}` : ''} — the market data
          source is temporarily unreachable.
        </p>
      )}

      {status === 'loading' ? (
        <p className="predict-loading" role="status">
          Loading markets…
        </p>
      ) : status === 'degraded' ? (
        <div className="predict-degraded" role="status">
          <p>Market data is temporarily unavailable. Your funds are safe — this only affects display.</p>
          <div className="predict-degraded-actions">
            <button type="button" onClick={refresh}>
              Try again
            </button>
            <a href={POLYMARKET_URL} target="_blank" rel="noopener noreferrer">
              Open Polymarket ↗
            </a>
          </div>
        </div>
      ) : status === 'empty' ? (
        <EmptyState
          title="No markets found"
          message={query ? 'No markets match your search. Try a different term.' : 'No markets are available right now.'}
          ctaLabel="Open Polymarket"
          onCta={() => window.open(POLYMARKET_URL, '_blank', 'noopener,noreferrer')}
        />
      ) : (
        <>
          <ul className="predict-grid">
            {markets.map((m) => (
              <MarketCard key={m.conditionId} market={m} onOpen={setOpenMarket} />
            ))}
          </ul>
          {hasMore && (
            <button type="button" className="predict-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      <MarketDetailSheet
        key={openMarket ? openMarket.conditionId : 'closed'}
        market={openMarket}
        onClose={() => setOpenMarket(null)}
      />
    </section>
  )
}
