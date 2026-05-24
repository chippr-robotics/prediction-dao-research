/**
 * Tests for ThemeProvider — targeting 90% coverage.
 * Tests theme state management, persistence, toggle, and setThemeMode.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { ThemeProvider } from '../contexts/ThemeContext.jsx'
import { useTheme } from '../hooks/useTheme'

function wrapper({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'platform-clearpath', 'platform-fairwins')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'platform-clearpath', 'platform-fairwins')
  })

  it('defaults to light mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.mode).toBe('light')
    expect(result.current.isLight).toBe(true)
    expect(result.current.isDark).toBe(false)
  })

  it('persists theme to localStorage', () => {
    renderHook(() => useTheme(), { wrapper })
    expect(localStorage.getItem('themeMode')).toBe('light')
  })

  it('loads saved theme from localStorage', () => {
    localStorage.setItem('themeMode', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.mode).toBe('dark')
    expect(result.current.isDark).toBe(true)
    expect(result.current.isLight).toBe(false)
  })

  it('toggleMode switches between light and dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.mode).toBe('light')

    act(() => {
      result.current.toggleMode()
    })

    expect(result.current.mode).toBe('dark')
    expect(result.current.isDark).toBe(true)

    act(() => {
      result.current.toggleMode()
    })

    expect(result.current.mode).toBe('light')
    expect(result.current.isLight).toBe(true)
  })

  it('setThemeMode sets to dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setThemeMode('dark')
    })

    expect(result.current.mode).toBe('dark')
  })

  it('setThemeMode sets to light', () => {
    localStorage.setItem('themeMode', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setThemeMode('light')
    })

    expect(result.current.mode).toBe('light')
  })

  it('setThemeMode ignores invalid values', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setThemeMode('invalid')
    })

    expect(result.current.mode).toBe('light') // unchanged
  })

  it('applies theme class to document root', () => {
    renderHook(() => useTheme(), { wrapper })
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(document.documentElement.classList.contains('platform-fairwins')).toBe(true)
  })

  it('removes old theme class when switching', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggleMode()
    })

    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.classList.contains('theme-light')).toBe(false)
  })

  it('saves to localStorage on mode change', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggleMode()
    })

    expect(localStorage.getItem('themeMode')).toBe('dark')
  })
})
