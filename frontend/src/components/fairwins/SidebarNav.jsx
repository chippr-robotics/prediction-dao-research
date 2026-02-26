import React, { useState } from 'react'
import { useIsMobile } from '../../hooks/useMediaQuery'
import './SidebarNav.css'

// Import SVG icons
import dashboardIcon from '../../assets/dashboard_no_text.svg'

const CATEGORIES = [
  // P2P Wager Management
  { id: 'dashboard', name: 'My Wagers', icon: dashboardIcon }
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

  // On mobile, no bottom nav needed with only the dashboard
  if (isMobile) {
    return null
  }

  // Desktop: render as sidebar
  return (
    <aside
      className={`sidebar-nav ${isExpanded ? 'expanded' : 'collapsed'}`}
      aria-label="Navigation"
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
        {isExpanded && <h2>Navigation</h2>}
      </div>

      <nav className="category-list">
        {visibleCategories.map((category) => (
          <React.Fragment key={category.id}>
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
