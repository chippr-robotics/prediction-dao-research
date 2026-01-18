import { useRef } from 'react'
import MarketTile from './MarketTile'
import SubcategoryFilter from './SubcategoryFilter'
import './CategoryRow.css'

function CategoryRow({
  title,
  markets = [],
  onMarketClick,
  selectedMarketId,
  icon,
  subcategories = [],
  selectedSubcategories = [],
  onSubcategoryToggle
}) {
  const scrollerRef = useRef(null)

  const scroll = (direction) => {
    if (scrollerRef.current) {
      const scrollAmount = 300
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
          {icon && (
            <span className="category-icon-large" aria-hidden="true">
              {typeof icon === 'string' && icon.endsWith('.svg') ? (
                <img src={icon} alt="" className="category-icon-img" />
              ) : (
                icon
              )}
            </span>
          )}
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

      {/* Subcategory Filter Section */}
      {subcategories && subcategories.length > 0 && (
        <SubcategoryFilter
          subcategories={subcategories}
          selectedSubcategories={selectedSubcategories}
          onSubcategoryToggle={onSubcategoryToggle}
          categoryName={title}
        />
      )}
      
      <div 
        className="category-scroller"
        ref={scrollerRef}
        role="region"
        aria-label={`${title} markets`}
      >
        <div className="scroller-track">
          {markets.map((market) => (
            <div key={market.id} className="scroller-item-small">
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
