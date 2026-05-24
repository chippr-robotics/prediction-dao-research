/**
 * Tests for ThemeToggle component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ThemeContext } from '../../../contexts/ThemeContext'
import ThemeToggle from '../../../components/ui/ThemeToggle'

function renderWithTheme(mode = 'light', toggleMode = vi.fn()) {
  const value = {
    mode,
    toggleMode,
    isDark: mode === 'dark',
    isLight: mode === 'light',
  }
  return render(
    <ThemeContext.Provider value={value}>
      <ThemeToggle />
    </ThemeContext.Provider>
  )
}

describe('ThemeToggle', () => {
  it('renders toggle button', () => {
    renderWithTheme()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('shows sun icon in dark mode', () => {
    renderWithTheme('dark')
    expect(screen.getByLabelText('Switch to light mode')).toBeTruthy()
  })

  it('shows moon icon in light mode', () => {
    renderWithTheme('light')
    expect(screen.getByLabelText('Switch to dark mode')).toBeTruthy()
  })

  it('calls toggleMode when clicked', () => {
    const toggleMode = vi.fn()
    renderWithTheme('light', toggleMode)
    fireEvent.click(screen.getByRole('button'))
    expect(toggleMode).toHaveBeenCalled()
  })

  it('has descriptive sr-only text in light mode', () => {
    renderWithTheme('light')
    expect(screen.getByText(/Currently in light mode/)).toBeTruthy()
  })

  it('has descriptive sr-only text in dark mode', () => {
    renderWithTheme('dark')
    expect(screen.getByText(/Currently in dark mode/)).toBeTruthy()
  })

  it('has correct title attribute in light mode', () => {
    renderWithTheme('light')
    expect(screen.getByTitle('Switch to dark mode')).toBeTruthy()
  })

  it('has correct title attribute in dark mode', () => {
    renderWithTheme('dark')
    expect(screen.getByTitle('Switch to light mode')).toBeTruthy()
  })
})
