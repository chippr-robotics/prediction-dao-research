import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { ThemeContext, ThemeProvider } from '../contexts/ThemeContext'
import { useTheme } from '../hooks/useTheme'

describe('useTheme hook', () => {
  // Clear localStorage before and after each test
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should return theme context value when provider exists', () => {
    const mockThemeValue = {
      theme: 'dark',
      toggleTheme: vi.fn(),
      isDarkMode: true
    }

    const wrapper = ({ children }) => (
      <ThemeContext.Provider value={mockThemeValue}>
        {children}
      </ThemeContext.Provider>
    )

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current).toEqual(mockThemeValue)
    expect(result.current.theme).toBe('dark')
    expect(result.current.isDarkMode).toBe(true)
  })

  it('should throw error when used outside ThemeProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useTheme())
    }).toThrow('useTheme must be used within a ThemeProvider')

    consoleError.mockRestore()
  })

  it('should access theme functions from context', () => {
    const mockToggleTheme = vi.fn()
    const mockThemeValue = {
      theme: 'light',
      toggleTheme: mockToggleTheme,
      isDarkMode: false
    }

    const wrapper = ({ children }) => (
      <ThemeContext.Provider value={mockThemeValue}>
        {children}
      </ThemeContext.Provider>
    )

    const { result } = renderHook(() => useTheme(), { wrapper })

    result.current.toggleTheme()
    expect(mockToggleTheme).toHaveBeenCalled()
  })

  it('should default to fairwins platform when no saved platform exists', () => {
    const wrapper = ({ children }) => (
      <ThemeProvider>
        {children}
      </ThemeProvider>
    )

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.platform).toBe('fairwins')
    expect(result.current.isFairWins).toBe(true)
    expect(result.current.isClearPath).toBe(false)
  })

  it('should use saved platform from localStorage if available', () => {
    localStorage.setItem('themePlatform', 'clearpath')

    const wrapper = ({ children }) => (
      <ThemeProvider>
        {children}
      </ThemeProvider>
    )

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.platform).toBe('clearpath')
    expect(result.current.isClearPath).toBe(true)
    expect(result.current.isFairWins).toBe(false)
  })
})
