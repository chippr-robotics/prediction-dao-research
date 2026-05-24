/**
 * Tests for UserPreferencesContext / UserPreferencesProvider — targeting 70% coverage.
 * Tests preference loading/saving, recent searches, favorites, slippage, categories.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React, { useContext } from 'react'
import { UserPreferencesContext } from '../contexts/UserPreferencesContext.js'

// Mock useWeb3 with a mutable state so tests can change it
let mockAccount = '0x1234567890123456789012345678901234567890'
let mockIsConnected = true

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: () => ({
    account: mockAccount,
    isConnected: mockIsConnected,
  }),
}))

// Mock userStorage
const mockSaveUserPreference = vi.fn()
const mockClearUserPreferences = vi.fn()

vi.mock('../utils/userStorage', () => ({
  getUserPreference: vi.fn((_account, _key, defaultVal) => defaultVal),
  saveUserPreference: (...args) => mockSaveUserPreference(...args),
  clearUserPreferences: (...args) => mockClearUserPreferences(...args),
}))

import { UserPreferencesProvider } from '../contexts/UserPreferencesContext.jsx'

function wrapper({ children }) {
  return <UserPreferencesProvider>{children}</UserPreferencesProvider>
}

function usePrefs() {
  return useContext(UserPreferencesContext)
}

describe('UserPreferencesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccount = '0x1234567890123456789012345678901234567890'
    mockIsConnected = true
  })

  it('provides default preferences', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })
    expect(result.current.preferences).toBeDefined()
    expect(result.current.preferences.recentSearches).toEqual([])
    expect(result.current.preferences.favoriteMarkets).toEqual([])
    expect(result.current.preferences.defaultSlippage).toBe(0.5)
    expect(result.current.preferences.polymarketCategories).toEqual([])
  })

  it('provides isLoading state', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })
    expect(typeof result.current.isLoading).toBe('boolean')
  })

  it('addRecentSearch adds a search term', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.addRecentSearch('bitcoin')
    })

    expect(result.current.preferences.recentSearches).toContain('bitcoin')
    expect(mockSaveUserPreference).toHaveBeenCalled()
  })

  it('addRecentSearch deduplicates and limits to 10', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    // Add 12 searches
    for (let i = 0; i < 12; i++) {
      act(() => {
        result.current.addRecentSearch(`search-${i}`)
      })
    }

    expect(result.current.preferences.recentSearches.length).toBeLessThanOrEqual(10)
    // Most recent should be first
    expect(result.current.preferences.recentSearches[0]).toBe('search-11')
  })

  it('addRecentSearch moves duplicate to front', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.addRecentSearch('first')
    })
    act(() => {
      result.current.addRecentSearch('second')
    })
    act(() => {
      result.current.addRecentSearch('first')
    })

    expect(result.current.preferences.recentSearches[0]).toBe('first')
    expect(result.current.preferences.recentSearches.length).toBe(2)
  })

  it('addRecentSearch is no-op with no account', () => {
    mockAccount = null
    mockIsConnected = false

    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.addRecentSearch('test')
    })

    expect(result.current.preferences.recentSearches).toEqual([])
  })

  it('addRecentSearch is no-op with empty string', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.addRecentSearch('')
    })

    expect(result.current.preferences.recentSearches).toEqual([])
  })

  it('clearRecentSearches clears search history', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.addRecentSearch('test')
    })

    act(() => {
      result.current.clearRecentSearches()
    })

    expect(result.current.preferences.recentSearches).toEqual([])
    expect(mockSaveUserPreference).toHaveBeenCalledWith(
      expect.any(String),
      'recent_searches',
      [],
      true
    )
  })

  it('toggleFavoriteMarket adds and removes markets', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    // Add favorite
    act(() => {
      result.current.toggleFavoriteMarket('market-1')
    })
    expect(result.current.preferences.favoriteMarkets).toContain('market-1')

    // Remove favorite
    act(() => {
      result.current.toggleFavoriteMarket('market-1')
    })
    expect(result.current.preferences.favoriteMarkets).not.toContain('market-1')
  })

  it('setDefaultSlippage updates slippage', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.setDefaultSlippage(1.0)
    })

    expect(result.current.preferences.defaultSlippage).toBe(1.0)
  })

  it('setPolymarketCategories updates categories', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.setPolymarketCategories(['sports', 'politics'])
    })

    expect(result.current.preferences.polymarketCategories).toEqual(['sports', 'politics'])
  })

  it('setPolymarketCategories handles non-array input', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.setPolymarketCategories('not-array')
    })

    expect(result.current.preferences.polymarketCategories).toEqual([])
  })

  it('savePreference saves arbitrary key/value', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.savePreference('customKey', 'customValue')
    })

    expect(result.current.preferences.customKey).toBe('customValue')
    expect(mockSaveUserPreference).toHaveBeenCalled()
  })

  it('savePreference warns when no account', () => {
    mockAccount = null
    mockIsConnected = false

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.savePreference('key', 'value')
    })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no wallet connected'))
    consoleSpy.mockRestore()
  })

  it('clearAllPreferences resets everything', () => {
    const { result } = renderHook(() => usePrefs(), { wrapper })

    act(() => {
      result.current.addRecentSearch('test')
      result.current.toggleFavoriteMarket('m1')
    })

    act(() => {
      result.current.clearAllPreferences()
    })

    expect(result.current.preferences.recentSearches).toEqual([])
    expect(result.current.preferences.favoriteMarkets).toEqual([])
    expect(result.current.preferences.defaultSlippage).toBe(0.5)
    expect(mockClearUserPreferences).toHaveBeenCalled()
  })
})
