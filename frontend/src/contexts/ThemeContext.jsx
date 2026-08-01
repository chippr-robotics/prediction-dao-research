import { useState, useEffect, useCallback } from 'react'
import { ThemeContext } from './ThemeContext'
import { getActiveTenantId, tenantThemeClass } from '../config/tenant'
import { applyTenantTheme } from '../theme/tenantTheme'

/**
 * ThemeProvider manages the application's theme state
 * - Supports light/dark mode
 * - Persists theme preference to localStorage
 * - Default is light mode
 * - Applies the active tenant's platform-<id> class (spec 072); the tenant is
 *   fixed at build time, only the mode is user-switchable
 */
export function ThemeProvider({ children }) {
  // Initialize with light mode as default
  const [mode, setMode] = useState(() => {
    const savedMode = localStorage.getItem('themeMode')
    return savedMode || 'light'
  })

  // Inject non-default tenant theme tokens once (no-op for the default tenant)
  useEffect(() => {
    applyTenantTheme()
  }, [])

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement

    // Remove existing theme classes (any platform-* left by the pre-hydration script)
    root.classList.remove('theme-light', 'theme-dark')
    for (const cls of Array.from(root.classList)) {
      if (cls.startsWith('platform-')) root.classList.remove(cls)
    }

    // Add current theme classes
    root.classList.add(`theme-${mode}`)
    root.classList.add(tenantThemeClass())

    // Save to localStorage; themePlatform feeds the index.html pre-hydration
    // script so the correct platform class is applied before hydration
    localStorage.setItem('themeMode', mode)
    localStorage.setItem('themePlatform', getActiveTenantId())
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
