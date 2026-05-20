import { useState, useEffect, useCallback } from 'react'
import { ThemeContext } from './ThemeContext'

/**
 * ThemeProvider manages the application's theme state
 * - Supports light/dark mode
 * - Persists theme preference to localStorage
 * - Default is light mode
 */
export function ThemeProvider({ children }) {
  // Initialize with light mode as default
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('themeMode')
    return savedMode || 'light'
  })

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement

    // Remove existing theme classes
    root.classList.remove('theme-light', 'theme-dark', 'platform-clearpath', 'platform-fairwins')

    // Add current theme classes
    root.classList.add(`theme-${mode}`)
    root.classList.add('platform-fairwins')

    // Save to localStorage
    localStorage.setItem('themeMode', mode)
  }, [mode])

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  const setThemeMode = useCallback((newMode) => {
    if (newMode === 'light' || newMode === 'dark') {
      setMode(newMode)
    }
  }, [])

  const value = {
    mode,
    toggleMode,
    setThemeMode,
    isDark: mode === 'dark',
    isLight: mode === 'light',
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
