import React, { useState } from 'react'
import { useIsMobile } from '../../hooks/useMediaQuery'
import './SidebarNav.css'

// Import SVG icons
import dashboardIcon from '../../assets/dashboard_no_text.svg'
import trendingIcon from '../../assets/trending_no_text.svg'
import politicsIcon from '../../assets/politics_no_text.svg'
import sportsIcon from '../../assets/sports_no_text.svg'
import financeIcon from '../../assets/finance_no_text.svg'
import techIcon from '../../assets/tech_no_text.svg'
import popCultureIcon from '../../assets/pop-culture_no_text.svg'
import cryptoIcon from '../../assets/crypto_no_text.svg'
import weatherIcon from '../../assets/weather_no_text.svg'
import otherMarketsIcon from '../../assets/other_markets_no_text.svg'
import allMarketsIcon from '../../assets/all_markets_no_text.svg'

const CATEGORIES = [
  // P2P Wager Management
  { id: 'dashboard', name: 'My Wagers', icon: dashboardIcon },
  // Browse Markets (for finding events to wager on)
  { id: 'trending', name: 'Trending', icon: trendingIcon, section: 'browse' },
  { id: 'sports', name: 'Sports', icon: sportsIcon, section: 'browse' },
  { id: 'crypto', name: 'Crypto', icon: cryptoIcon, section: 'browse' },
  { id: 'politics', name: 'Politics', icon: politicsIcon, section: 'browse' },
  { id: 'finance', name: 'Finance', icon: financeIcon, section: 'browse' },
  { id: 'tech', name: 'Tech', icon: techIcon, section: 'browse' },
  { id: 'pop-culture', name: 'Pop Culture', icon: popCultureIcon, section: 'browse' },
  { id: 'weather', name: 'Weather', icon: weatherIcon, section: 'browse' },
  { id: 'other', name: 'Other Markets', icon: otherMarketsIcon, section: 'browse' },
  { id: 'perpetuals', name: 'Perpetuals', icon: '\uD83D\uDCC8', isEmoji: true, section: 'browse' },
  { id: 'all-table', name: 'All Markets Table', icon: allMarketsIcon, powerUser: true, section: 'browse' }
]

function SidebarNav({ selectedCategory = 'dashboard', onCategoryChange, userRoles = [] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isMobile = useIsMobile()

  const handleCategoryClick = (categoryId) => {
    if (onCategoryChange) {
      onCategoryChange(categoryId)
    }
  }

  const handleKeyDown = (e, categoryId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCategoryClick(categoryId)
    }
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  const handleToggleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpanded()
    }
  }

  // Filter categories based on role requirements
  const visibleCategories = CATEGORIES.filter(category => {
    if (category.requiresRole) {
      return userRoles.includes(category.requiresRole)
    }
    return true
  })

  // On mobile, render as bottom navigation bar
  if (isMobile) {
    return (
      <nav 
        className="bottom-nav-bar"
        role="navigation"
        aria-label="Market categories"
      >
        <div className="bottom-nav-scroll">
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              className={`bottom-nav-item ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category.id)}
              onKeyDown={(e) => handleKeyDown(e, category.id)}
              aria-current={selectedCategory === category.id ? 'page' : undefined}
              aria-label={`View ${category.name}`}
            >
              <span className="bottom-nav-icon" aria-hidden="true">
                {category.isEmoji ? (
                  <span className="category-emoji">{category.icon}</span>
                ) : typeof category.icon === 'string' && category.icon.endsWith('.svg') ? (
                  <img src={category.icon} alt="" className="category-icon-img" />
                ) : (
                  category.icon
                )}
              </span>
              <span className="bottom-nav-label">{category.name}</span>
            </button>
          ))}
        </div>
      </nav>
    )
  }

  // Desktop: render as sidebar
  return (
    <aside 
      className={`sidebar-nav ${isExpanded ? 'expanded' : 'collapsed'}`}
      aria-label="Market categories"
    >
      <div className="sidebar-header">
        <button
          className="toggle-btn"
          onClick={toggleExpanded}
          onKeyDown={handleToggleKeyDown}
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={isExpanded}
        >
          <span className="toggle-icon" aria-hidden="true">
            {isExpanded ? '◀' : '▶'}
          </span>
        </button>
        {isExpanded && <h2>Categories</h2>}
      </div>

      <nav className="category-list">
        {visibleCategories.map((category, index) => (
          <React.Fragment key={category.id}>
            {index > 0 && category.section === 'browse' && visibleCategories[index - 1]?.section !== 'browse' && (
              <div className="sidebar-divider" aria-hidden="true">
                {isExpanded && <span className="divider-label">Browse Markets</span>}
              </div>
            )}
            <button
              className={`category-item ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category.id)}
              onKeyDown={(e) => handleKeyDown(e, category.id)}
              aria-current={selectedCategory === category.id ? 'page' : undefined}
              aria-label={`View ${category.name}`}
              title={!isExpanded ? category.name : ''}
            >
              <span className="category-icon" aria-hidden="true">
                {category.isEmoji ? (
                  <span className="category-emoji">{category.icon}</span>
                ) : typeof category.icon === 'string' && category.icon.endsWith('.svg') ? (
                  <img src={category.icon} alt="" className="category-icon-img" />
                ) : (
                  category.icon
                )}
              </span>
              {isExpanded && <span className="category-name">{category.name}</span>}
            </button>
          </React.Fragment>
        ))}
      </nav>
    </aside>
  )
}

export default SidebarNav
