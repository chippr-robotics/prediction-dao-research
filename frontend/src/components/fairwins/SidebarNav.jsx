import { useState } from 'react'
import { useIsMobile } from '../../hooks/useMediaQuery'
import './SidebarNav.css'

const CATEGORIES = [
  { id: 'dashboard', name: 'Dashboard', icon: '📊' },
  { id: 'trending', name: 'Trending', icon: '🔥' },
  { id: 'politics', name: 'Politics', icon: '🏛️' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'finance', name: 'Finance', icon: '💰' },
  { id: 'tech', name: 'Tech', icon: '💻' },
  { id: 'pop-culture', name: 'Pop Culture', icon: '🎬' },
  { id: 'crypto', name: 'Crypto', icon: '₿' },
  { id: 'other', name: 'Other Markets', icon: '🌐' },
  { id: 'all-table', name: 'All Markets Table', icon: '📋', powerUser: true }
]

function SidebarNav({ selectedCategory = 'dashboard', onCategoryChange }) {
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

  // On mobile, render as bottom navigation bar
  if (isMobile) {
    return (
      <nav 
        className="bottom-nav-bar"
        role="navigation"
        aria-label="Market categories"
      >
        <div className="bottom-nav-scroll">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`bottom-nav-item ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category.id)}
              onKeyDown={(e) => handleKeyDown(e, category.id)}
              aria-current={selectedCategory === category.id ? 'page' : undefined}
              aria-label={`View ${category.name}`}
            >
              <span className="bottom-nav-icon" aria-hidden="true">{category.icon}</span>
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
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-item ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => handleCategoryClick(category.id)}
            onKeyDown={(e) => handleKeyDown(e, category.id)}
            aria-current={selectedCategory === category.id ? 'page' : undefined}
            aria-label={`View ${category.name}`}
            title={!isExpanded ? category.name : ''}
          >
            <span className="category-icon" aria-hidden="true">{category.icon}</span>
            {isExpanded && <span className="category-name">{category.name}</span>}
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default SidebarNav
