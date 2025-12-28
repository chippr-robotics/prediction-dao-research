import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import useFuseSearch from '../hooks/useFuseSearch'

describe('useFuseSearch', () => {
  const mockMarkets = [
    {
      id: 1,
      proposalTitle: 'NFL Super Bowl 2025: Chiefs win',
      description: 'Will the Kansas City Chiefs win the Super Bowl?',
      category: 'sports'
    },
    {
      id: 2,
      proposalTitle: 'Bitcoin Price Above $100k',
      description: 'Will Bitcoin price exceed $100,000 by end of 2025?',
      category: 'crypto'
    },
    {
      id: 3,
      proposalTitle: 'Tech Stock Rally Continues',
      description: 'Will tech stocks maintain their rally through Q1?',
      category: 'finance'
    }
  ]

  it('should return all items when search query is empty', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, '')
    )
    
    expect(result.current).toHaveLength(3)
    expect(result.current).toEqual(mockMarkets)
  })

  it('should filter items based on title search', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'Bitcoin')
    )
    
    expect(result.current).toHaveLength(1)
    expect(result.current[0].proposalTitle).toBe('Bitcoin Price Above $100k')
  })

  it('should filter items based on description search', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'Kansas City')
    )
    
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe(1)
  })

  it('should filter items based on category search', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'crypto')
    )
    
    expect(result.current).toHaveLength(1)
    expect(result.current[0].category).toBe('crypto')
  })

  it('should perform fuzzy search with typos', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'Bitcon')  // typo in Bitcoin
    )
    
    // Fuse.js should still find Bitcoin with fuzzy matching
    expect(result.current.length).toBeGreaterThan(0)
  })

  it('should return empty array when no matches found', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'xyzabc123')
    )
    
    expect(result.current).toHaveLength(0)
  })

  it('should handle empty items array', () => {
    const { result } = renderHook(() => 
      useFuseSearch([], 'test')
    )
    
    expect(result.current).toHaveLength(0)
  })

  it('should be case insensitive', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'nfl')
    )
    
    expect(result.current).toHaveLength(1)
    expect(result.current[0].proposalTitle).toContain('NFL')
  })

  it('should search across multiple fields', () => {
    const { result } = renderHook(() => 
      useFuseSearch(mockMarkets, 'tech')
    )
    
    // Should match "tech" in category and in title
    expect(result.current.length).toBeGreaterThan(0)
  })
})
