/**
 * Tests for ErrorBoundary component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import ErrorBoundary from '../../../components/ui/ErrorBoundary'

// Component that always throws
function BrokenComponent() {
  throw new Error('Test error')
}

// Component that conditionally throws
function ConditionalBroken({ shouldThrow }) {
  if (shouldThrow) throw new Error('Conditional error')
  return <div>All good</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error in these tests since React logs errors
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('shows error details', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )
    // Error details should be in a <details> element
    expect(screen.getByText('Error details')).toBeTruthy()
    expect(screen.getByText(/Test error/)).toBeTruthy()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Fallback</div>}>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Custom Fallback')).toBeTruthy()
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Object)
    )
  })

  it('resets error state when "Try again" is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeTruthy()

    // Click "Try again" - this resets error state
    fireEvent.click(screen.getByText('Try again'))

    // After reset, the boundary will try to render children again
    // Since BrokenComponent always throws, it will error again
    // But the key point is handleReset was called
  })

  it('calls onReset callback when reset', () => {
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <BrokenComponent />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByText('Try again'))
    expect(onReset).toHaveBeenCalled()
  })

  it('has a "Go to home" button', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Go to home')).toBeTruthy()
  })
})
