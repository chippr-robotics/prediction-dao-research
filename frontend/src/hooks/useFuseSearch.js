import { useMemo } from 'react'
import Fuse from 'fuse.js'

/**
 * Custom hook for implementing fuzzy search using Fuse.js
 * @param {Array} items - Array of items to search through
 * @param {string} searchQuery - The search query string
 * @param {Object} optionsOverride - Optional Fuse.js configuration overrides
 * @returns {Array} Filtered array of items based on search query
 */
function useFuseSearch(items, searchQuery, optionsOverride = {}) {
  // Create a stable stringified version of options for dependency tracking
  const optionsJson = JSON.stringify(optionsOverride)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const optionsKey = useMemo(() => optionsJson, [optionsJson])

  // Create Fuse instance - memoized to avoid recreation on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      ...optionsOverride
    }

    return new Fuse(items, fuseOptions)
  }, [items, optionsKey])

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
