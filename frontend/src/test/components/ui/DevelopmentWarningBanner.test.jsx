/**
 * Tests for DevelopmentWarningBanner component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import DevelopmentWarningBanner from '../../../components/ui/DevelopmentWarningBanner'

describe('DevelopmentWarningBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--dev-banner-height')
  })

  it('renders warning banner when not dismissed', () => {
    render(<DevelopmentWarningBanner />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/under active development/)).toBeTruthy()
  })

  it('renders a link to chipprbots.com', () => {
    render(<DevelopmentWarningBanner />)
    const link = screen.getByText('Visit chipprbots.com')
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('https://chipprbots.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('dismiss button hides banner and saves to localStorage', () => {
    render(<DevelopmentWarningBanner />)

    const dismissBtn = screen.getByLabelText('Dismiss warning banner')
    fireEvent.click(dismissBtn)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(localStorage.getItem('dev_warning_banner_dismissed')).toBe('true')
  })

  it('does not render when already dismissed in localStorage', () => {
    localStorage.setItem('dev_warning_banner_dismissed', 'true')
    render(<DevelopmentWarningBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sets CSS custom property for banner height when visible', () => {
    render(<DevelopmentWarningBanner />)
    expect(document.documentElement.style.getPropertyValue('--dev-banner-height')).toBe('45px')
  })

  it('sets CSS custom property to 0px when dismissed', () => {
    localStorage.setItem('dev_warning_banner_dismissed', 'true')
    render(<DevelopmentWarningBanner />)
    expect(document.documentElement.style.getPropertyValue('--dev-banner-height')).toBe('0px')
  })

  it('cleans up CSS custom property on unmount', () => {
    const { unmount } = render(<DevelopmentWarningBanner />)
    unmount()
    // After unmount, the property should be removed
    expect(document.documentElement.style.getPropertyValue('--dev-banner-height')).toBe('')
  })
})
