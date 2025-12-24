import { useRef, useState, useEffect } from 'react'
import MarketTile from './MarketTile'
import './CategoryRow.css'

function CategoryRow({ 
  title, 
  markets = [], 
  onMarketClick,
  selectedMarketId,
  icon
}) {
  const scrollerRef = useRef(null)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [isHovering, setIsHovering] = useState(false)

  // Duplicate markets for infinite loop effect
  const duplicatedMarkets = [...markets, ...markets, ...markets]

  useEffect(() => {
    if (!scrollerRef.current || isHovering) return

    const scroller = scrollerRef.current
    const scrollWidth = scroller.scrollWidth / 3 // Since we tripled the content
    
    // Auto-scroll
    const interval = setInterval(() => {
      setScrollPosition((prev) => {
        const newPos = prev + 1
        // Reset to beginning when reaching the middle copy
        if (newPos >= scrollWidth) {
          scroller.scrollLeft = 0
          return 0
        }
        scroller.scrollLeft = newPos
        return newPos
      })
    }, 30)

    return () => clearInterval(interval)
  }, [isHovering])

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
    <div className="category-row">
      <div className="category-row-header">
        <div className="category-title-group">
          {icon && <span className="category-icon-large" aria-hidden="true">{icon}</span>}
          <h2>{title}</h2>
          <span className="market-count">({markets.length} markets)</span>
        </div>
        <div className="scroll-controls">
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
        className="category-scroller"
        ref={scrollerRef}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        role="region"
        aria-label={`${title} markets`}
      >
        <div className="scroller-track-infinite">
          {duplicatedMarkets.map((market, index) => (
            <div key={`${market.id}-${index}`} className="scroller-item-small">
              <MarketTile 
                market={market}
                onClick={onMarketClick}
                isActive={selectedMarketId === market.id}
                compact={true}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CategoryRow
