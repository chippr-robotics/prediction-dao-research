import { useMemo, useRef } from 'react'
import Fuse from 'fuse.js'

/**
 * Custom hook for implementing fuzzy search using Fuse.js
 * @param {Array} items - Array of items to search through
 * @param {string} searchQuery - The search query string
 * @param {Object} optionsOverride - Optional Fuse.js configuration overrides
 * @returns {Array} Filtered array of items based on search query
 */
function useFuseSearch(items, searchQuery, optionsOverride = {}) {
  // Use ref to cache options and avoid unnecessary Fuse recreation
  const optionsRef = useRef(optionsOverride)

  // Only update ref if options keys/values actually changed
  const optionsKeys = Object.keys(optionsOverride).sort().join(',')
  const optionsValues = Object.values(optionsOverride).map(String).join(',')
  const prevKeys = Object.keys(optionsRef.current).sort().join(',')
  const prevValues = Object.values(optionsRef.current).map(String).join(',')

  if (optionsKeys !== prevKeys || optionsValues !== prevValues) {
    optionsRef.current = optionsOverride
  }

  // Create Fuse instance - memoized to avoid recreation on every render
  const fuse = useMemo(() => {
    if (!items || items.length === 0) {
      return null
    }

    // Default Fuse.js options optimized for market search
    const fuseOptions = {
      keys: ['proposalTitle', 'description', 'category'],
      threshold: 0.3, // 0.0 = perfect match, 1.0 = match anything
      distance: 100,
      minMatchCharLength: 2,
      shouldSort: true,
      includeScore: true,
      useExtendedSearch: false,
      ignoreLocation: true,
      ...optionsRef.current
    }

    return new Fuse(items, fuseOptions)
  }, [items, optionsKeys, optionsValues])

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
