import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { UIContext } from '../contexts/UIContext'
import NotificationSystem from '../components/ui/NotificationSystem'

function createWrapper(notification = null) {
  const hideNotification = vi.fn()
  const value = {
    notification,
    showNotification: vi.fn(),
    hideNotification,
    announcement: '',
    announce: vi.fn(),
    modal: null,
    showModal: vi.fn(),
    hideModal: vi.fn(),
    error: null,
    showError: vi.fn(),
    clearError: vi.fn(),
  }
  function Wrapper({ children }) {
    return <UIContext.Provider value={value}>{children}</UIContext.Provider>
  }
  return { Wrapper, hideNotification }
}

describe('NotificationSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render nothing when notification is null', () => {
    const { Wrapper } = createWrapper(null)
    const { container } = render(<NotificationSystem />, { wrapper: Wrapper })
    expect(container.innerHTML).toBe('')
  })

  it('should render notification message', () => {
    const { Wrapper } = createWrapper({ message: 'Operation succeeded', type: 'success' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    expect(screen.getByText('Operation succeeded')).toBeInTheDocument()
  })

  it('should render with alert role', () => {
    const { Wrapper } = createWrapper({ message: 'Alert', type: 'info' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('should display success icon for success type', () => {
    const { Wrapper } = createWrapper({ message: 'Success', type: 'success' })
    const { container } = render(<NotificationSystem />, { wrapper: Wrapper })
    const icon = container.querySelector('.notification-icon')
    expect(icon.textContent).toContain('✓')
  })

  it('should display error icon for error type', () => {
    const { Wrapper } = createWrapper({ message: 'Error', type: 'error' })
    const { container } = render(<NotificationSystem />, { wrapper: Wrapper })
    const icon = container.querySelector('.notification-icon')
    expect(icon.textContent).toContain('✕')
  })

  it('should display warning icon for warning type', () => {
    const { Wrapper } = createWrapper({ message: 'Warning', type: 'warning' })
    const { container } = render(<NotificationSystem />, { wrapper: Wrapper })
    const icon = container.querySelector('.notification-icon')
    expect(icon.textContent).toContain('⚠')
  })

  it('should display info icon for default type', () => {
    const { Wrapper } = createWrapper({ message: 'Info', type: 'info' })
    const { container } = render(<NotificationSystem />, { wrapper: Wrapper })
    const icon = container.querySelector('.notification-icon')
    expect(icon.textContent).toContain('ℹ')
  })

  it('should apply type-specific CSS class', () => {
    const { Wrapper } = createWrapper({ message: 'Test', type: 'error' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('notification-error')
  })

  it('should use assertive aria-live for error type', () => {
    const { Wrapper } = createWrapper({ message: 'Error', type: 'error' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
  })

  it('should use polite aria-live for non-error types', () => {
    const { Wrapper } = createWrapper({ message: 'Info', type: 'success' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'polite')
  })

  it('should call hideNotification when close button is clicked', () => {
    const { Wrapper, hideNotification } = createWrapper({ message: 'Dismiss me', type: 'info' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    fireEvent.click(screen.getByLabelText('Close notification'))
    expect(hideNotification).toHaveBeenCalled()
  })

  it('should have aria-atomic set to true', () => {
    const { Wrapper } = createWrapper({ message: 'Test', type: 'info' })
    render(<NotificationSystem />, { wrapper: Wrapper })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-atomic', 'true')
  })
})
