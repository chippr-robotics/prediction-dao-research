import { useState } from 'react'
import './SidebarNav.css'

const CATEGORIES = [
  { id: 'all', name: 'All Markets', icon: '🌐' },
  { id: 'trending', name: 'Trending', icon: '🔥' },
  { id: 'politics', name: 'Politics', icon: '🏛️' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'finance', name: 'Finance', icon: '💰' },
  { id: 'tech', name: 'Tech', icon: '💻' },
  { id: 'pop-culture', name: 'Pop Culture', icon: '🎬' },
  { id: 'crypto', name: 'Crypto', icon: '₿' },
  { id: 'other', name: 'Other Markets', icon: '📊' }
]

function SidebarNav({ selectedCategory = 'all', onCategoryChange }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

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

  return (
    <aside 
      className={`sidebar-nav ${isCollapsed ? 'collapsed' : ''}`}
      role="navigation"
      aria-label="Market categories"
    >
      <button
        className="collapse-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!isCollapsed}
      >
        {isCollapsed ? '→' : '←'}
      </button>

      <div className="sidebar-header">
        {!isCollapsed && <h2>Categories</h2>}
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
            title={isCollapsed ? category.name : ''}
          >
            <span className="category-icon" aria-hidden="true">{category.icon}</span>
            {!isCollapsed && <span className="category-name">{category.name}</span>}
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default SidebarNav
