import { useMemo } from 'react'
import ModernMarketCard from './ModernMarketCard'
import { useMarketNullification } from '../../hooks/useMarketNullification'
import './MarketGrid.css'

function MarketGrid({ markets = [], onMarketClick, selectedMarketId, loading = false }) {
  // Get nullification filtering functionality
  const { filterMarkets, isLoading: nullificationLoading } = useMarketNullification()

  // Filter out nullified markets
  const activeMarkets = useMemo(() => {
    if (nullificationLoading) return markets
    return filterMarkets(markets)
  }, [markets, filterMarkets, nullificationLoading])
  if (loading) {
    return (
      <div className="market-grid-loading" role="status" aria-live="polite">
        <div className="loading-skeleton" aria-hidden="true"></div>
        <div className="loading-skeleton" aria-hidden="true"></div>
        <div className="loading-skeleton" aria-hidden="true"></div>
        <div className="loading-skeleton" aria-hidden="true"></div>
        <div className="loading-skeleton" aria-hidden="true"></div>
        <div className="loading-skeleton" aria-hidden="true"></div>
        <span className="sr-only">Loading markets...</span>
      </div>
    )
  }

  if (activeMarkets.length === 0) {
    return (
      <div className="market-grid-empty" role="status">
        <div className="empty-icon" aria-hidden="true">📊</div>
        <h3>No Markets Found</h3>
        <p>There are no markets in this category yet. Check back soon!</p>
      </div>
    )
  }

  // Determine how many cards are in the first row based on grid layout (typically 3 on desktop)
  const firstRowCount = 0 // disable first row expand for now

  return (
    <div
      className="market-grid"
      role="grid"
      aria-label="Market grid"
      data-filtered-count={markets.length - activeMarkets.length}
    >
      {activeMarkets.map((market, index) => (
        <div key={market.id} role="gridcell">
          <ModernMarketCard
            market={market}
            onClick={onMarketClick}
            onTrade={onMarketClick}
            isActive={selectedMarketId === market.id}
            isFirstRow={index < firstRowCount}
          />
        </div>
      ))}
    </div>
  )
}

export default MarketGrid
