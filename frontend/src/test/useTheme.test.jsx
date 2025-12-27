import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { ThemeContext } from '../contexts/ThemeContext'
import { useTheme } from '../hooks/useTheme'

describe('useTheme hook', () => {
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
})
