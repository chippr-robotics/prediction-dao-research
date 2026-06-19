import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FreshnessIndicator from '../../components/account/FreshnessIndicator'

describe('FreshnessIndicator (spec 020 US5)', () => {
  it('shows a relative "updated" time', () => {
    render(<FreshnessIndicator state={{ lastUpdated: Date.now() - 5000, status: 'fresh' }} />)
    expect(screen.getByText(/updated \d+s ago/i)).toBeInTheDocument()
  })

  it('invokes onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(<FreshnessIndicator state={{ lastUpdated: Date.now(), status: 'fresh' }} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: /refresh account data/i }))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('shows a stale badge without blanking on error', () => {
    render(<FreshnessIndicator state={{ lastUpdated: Date.now() - 90000, status: 'stale' }} />)
    expect(screen.getByText(/stale — showing last known/i)).toBeInTheDocument()
  })

  it('disables refresh while refreshing', () => {
    render(<FreshnessIndicator state={{ status: 'refreshing' }} onRefresh={vi.fn()} />)
    expect(screen.getByRole('button', { name: /refresh account data/i })).toBeDisabled()
    expect(screen.getByText(/updating/i)).toBeInTheDocument()
  })
})
