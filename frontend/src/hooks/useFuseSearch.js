import { useMemo } from 'react'
import Fuse from 'fuse.js'

// Default Fuse.js options optimized for market search
const DEFAULT_FUSE_OPTIONS = {
  keys: ['proposalTitle', 'description', 'category'],
  threshold: 0.3, // 0.0 = perfect match, 1.0 = match anything
  distance: 100,
  minMatchCharLength: 2,
  shouldSort: true,
  includeScore: true,
  useExtendedSearch: false,
  ignoreLocation: true
}

/**
 * Custom hook for implementing fuzzy search using Fuse.js
 * @param {Array} items - Array of items to search through
 * @param {string} searchQuery - The search query string
 * @returns {Array} Filtered array of items based on search query
 */
function useFuseSearch(items, searchQuery) {
  // Create Fuse instance - memoized to avoid recreation on every render
  const fuse = useMemo(() => {
    if (!items || items.length === 0) {
      return null
    }
    return new Fuse(items, DEFAULT_FUSE_OPTIONS)
  }, [items])

  // Perform search - memoized to avoid re-searching with same query
  const searchResults = useMemo(() => {
    // If no search query, return all items
    if (!searchQuery || searchQuery.trim() === '') {
      return items
    }

    // If no fuse instance, return empty array
    if (!fuse) {
      return []
    }

    // Perform search and extract items from results
    const results = fuse.search(searchQuery)
    return results.map(result => result.item)
  }, [fuse, searchQuery, items])

  return searchResults
}

export default useFuseSearch
