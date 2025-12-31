import { useState, useEffect, useCallback } from 'react'
import { ThemeContext } from './ThemeContext'

/**
 * ThemeProvider manages the application's theme state
 * - Supports light/dark mode
 * - Supports platform-specific themes (ClearPath, FairWins)
 * - Persists theme preference to localStorage
 * - Default is light mode
 */
export function ThemeProvider({ children }) {
  // Initialize with light mode as default
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('themeMode')
    return savedMode || 'light'
  })

  // Current platform (clearpath or fairwins)
  const [platform, setPlatform] = useState(() => {
    const savedPlatform = localStorage.getItem('themePlatform')
    return savedPlatform || 'fairwins'
  })

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement
    
    // Remove existing theme classes
    root.classList.remove('theme-light', 'theme-dark', 'platform-clearpath', 'platform-fairwins')
    
    // Add current theme classes
    root.classList.add(`theme-${mode}`)
    root.classList.add(`platform-${platform}`)
    
    // Save to localStorage
    localStorage.setItem('themeMode', mode)
    localStorage.setItem('themePlatform', platform)
  }, [mode, platform])

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  const setThemeMode = useCallback((newMode) => {
    if (newMode === 'light' || newMode === 'dark') {
      setMode(newMode)
    }
  }, [])

  const setThemePlatform = useCallback((newPlatform) => {
    if (newPlatform === 'clearpath' || newPlatform === 'fairwins') {
      setPlatform(newPlatform)
    }
  }, [])

  const value = {
    mode,
    platform,
    toggleMode,
    setThemeMode,
    setThemePlatform,
    isDark: mode === 'dark',
    isLight: mode === 'light',
    isClearPath: platform === 'clearpath',
    isFairWins: platform === 'fairwins',
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
