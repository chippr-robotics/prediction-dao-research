import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import './SubcategoryFilter.css'

/**
 * SubcategoryFilter Component
 * Displays a fuzzy-searchable list of subcategory filter buttons below category titles
 * 
 * @param {Array} subcategories - Array of subcategory objects { id, name, parent }
 * @param {Array} selectedSubcategories - Array of currently selected subcategory IDs
 * @param {Function} onSubcategoryToggle - Callback when subcategory is toggled
 * @param {string} categoryName - Name of the parent category for accessibility
 * @param {string} sortBy - Current sort option
 * @param {Function} onSortChange - Callback when sort option changes
 */
function SubcategoryFilter({ 
  subcategories = [], 
  selectedSubcategories = [], 
  onSubcategoryToggle,
  categoryName = 'Category',
  sortBy = 'endTime',
  onSortChange
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)

  // Configure Fuse.js for fuzzy searching subcategories
  const fuse = useMemo(() => {
    if (!subcategories || subcategories.length === 0) return null

    const fuseOptions = {
      keys: ['name', 'id'],
      threshold: 0.3, // More lenient fuzzy matching
      distance: 100,
      minMatchCharLength: 1,
      shouldSort: true,
      includeScore: true,
      ignoreLocation: true
    }

    return new Fuse(subcategories, fuseOptions)
  }, [subcategories])

  // Filter subcategories based on search query
  const filteredSubcategories = useMemo(() => {
    if (!searchQuery || searchQuery.trim() === '') {
      return subcategories
    }

    if (!fuse) {
      return []
    }

    const results = fuse.search(searchQuery)
    return results.map(result => result.item)
  }, [fuse, searchQuery, subcategories])

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
  }

  // Handle subcategory button click
  const handleSubcategoryClick = (subcategoryId) => {
    if (onSubcategoryToggle) {
      onSubcategoryToggle(subcategoryId)
    }
  }

  // Handle clear all selections
  const handleClearAll = () => {
    selectedSubcategories.forEach(subId => {
      if (onSubcategoryToggle) {
        onSubcategoryToggle(subId)
      }
    })
  }

  // Don't render if no subcategories
  if (!subcategories || subcategories.length === 0) {
    return null
  }

  const hasActiveFilters = selectedSubcategories.length > 0
  const showingCount = filteredSubcategories.length
  const totalCount = subcategories.length

  return (
    <div className="subcategory-filter">
      <div className="subcategory-filter-header">
        <button
          className="accordion-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} filters and sort`}
        >
          {isExpanded ? '▼' : '▶'} Filters & Sort
        </button>
        {hasActiveFilters && (
          <button
            className="clear-filters-btn"
            onClick={handleClearAll}
            aria-label="Clear all subcategory filters"
          >
            Clear All ({selectedSubcategories.length})
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="subcategory-controls">
            <div className="subcategory-search-container">
              <input
                type="text"
                className="subcategory-search-input"
                placeholder="Search subcategories..."
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label={`Search ${categoryName} subcategories`}
              />
              <span className="search-icon" aria-hidden="true">🔍</span>
            </div>
            
            {onSortChange && (
              <div className="sort-controls">
                <label htmlFor={`sort-select-${categoryName}`}>Sort by:</label>
                <select 
                  id={`sort-select-${categoryName}`}
                  value={sortBy} 
                  onChange={(e) => onSortChange(e.target.value)}
                  className="sort-select"
                  aria-label={`Sort ${categoryName} markets`}
                >
                  <option value="endTime">Ending Time</option>
                  <option value="marketValue">Market Value</option>
                  <option value="volume24h">Volume (24h)</option>
                  <option value="activity">Activity (Trades)</option>
                  <option value="popularity">Popularity (Traders)</option>
                  <option value="probability">Probability (YES%)</option>
                </select>
              </div>
            )}
          </div>

          <div className="subcategory-buttons-container" role="group" aria-label={`${categoryName} subcategories`}>
            {filteredSubcategories.length === 0 ? (
              <div className="no-subcategories-message">
                No subcategories found for "{searchQuery}"
              </div>
            ) : (
              <>
                {filteredSubcategories.map(subcategory => {
                  const isSelected = selectedSubcategories.includes(subcategory.id)
                  return (
                    <button
                      key={subcategory.id}
                      className={`subcategory-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSubcategoryClick(subcategory.id)}
                      aria-pressed={isSelected}
                      aria-label={`Filter by ${subcategory.name}`}
                    >
                      {subcategory.name}
                      {isSelected && <span className="check-icon" aria-hidden="true">✓</span>}
                    </button>
                  )
                })}
              </>
            )}
          </div>

          {searchQuery && (
            <div className="subcategory-count" aria-live="polite">
              Showing {showingCount} of {totalCount} subcategories
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SubcategoryFilter
