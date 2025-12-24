import { useRef } from 'react'
import MarketTile from './MarketTile'
import './HorizontalMarketScroller.css'

function HorizontalMarketScroller({ 
  title = "Related Markets", 
  markets = [], 
  onMarketClick,
  selectedMarketId 
}) {
  const scrollerRef = useRef(null)

  const scroll = (direction) => {
    if (scrollerRef.current) {
      const scrollAmount = 350
      const newPosition = direction === 'left' 
        ? scrollerRef.current.scrollLeft - scrollAmount
        : scrollerRef.current.scrollLeft + scrollAmount
      
      scrollerRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      })
    }
  }

  if (markets.length === 0) {
    return null
  }

  return (
    <div className="horizontal-market-scroller">
      <div className="scroller-header">
        <h3>{title}</h3>
        <div className="scroller-controls">
          <button 
            className="scroll-btn left"
            onClick={() => scroll('left')}
            aria-label="Scroll left"
          >
            ←
          </button>
          <button 
            className="scroll-btn right"
            onClick={() => scroll('right')}
            aria-label="Scroll right"
          >
            →
          </button>
        </div>
      </div>
      
      <div 
        className="scroller-track"
        ref={scrollerRef}
        role="region"
        aria-label={title}
      >
        {markets.map((market) => (
          <div key={market.id} className="scroller-item">
            <MarketTile 
              market={market}
              onClick={onMarketClick}
              isActive={selectedMarketId === market.id}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default HorizontalMarketScroller
