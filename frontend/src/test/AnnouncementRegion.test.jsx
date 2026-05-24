import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { UIContext } from '../contexts/UIContext'
import AnnouncementRegion from '../components/ui/AnnouncementRegion'

function createWrapper(announcement = '') {
  const value = {
    announcement,
    announce: vi.fn(),
    notification: null,
    showNotification: vi.fn(),
    hideNotification: vi.fn(),
    modal: null,
    showModal: vi.fn(),
    hideModal: vi.fn(),
    error: null,
    showError: vi.fn(),
    clearError: vi.fn(),
  }
  return function Wrapper({ children }) {
    return <UIContext.Provider value={value}>{children}</UIContext.Provider>
  }
}

describe('AnnouncementRegion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render with status role', () => {
    render(<AnnouncementRegion />, { wrapper: createWrapper() })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should have aria-live polite', () => {
    render(<AnnouncementRegion />, { wrapper: createWrapper() })
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('should have aria-atomic true', () => {
    render(<AnnouncementRegion />, { wrapper: createWrapper() })
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-atomic', 'true')
  })

  it('should render empty when no announcement', () => {
    render(<AnnouncementRegion />, { wrapper: createWrapper('') })
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
  })

  it('should render announcement text', () => {
    render(<AnnouncementRegion />, { wrapper: createWrapper('Market created successfully') })
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('Market created successfully')
  })

  it('should be visually hidden (sr-only)', () => {
    render(<AnnouncementRegion />, { wrapper: createWrapper() })
    const region = screen.getByRole('status')
    expect(region).toHaveClass('sr-only')
    expect(region.style.position).toBe('absolute')
    expect(region.style.width).toBe('1px')
    expect(region.style.height).toBe('1px')
    expect(region.style.overflow).toBe('hidden')
  })
})
