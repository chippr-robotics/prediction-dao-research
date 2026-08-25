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

  // Issue #1280 — a partial read is its own status. It is not `fresh` (the
  // update was not complete) and not `stale` (something WAS just read, and on
  // a first load there is no last-known data to be "showing").
  it('shows a partial badge that neither claims completeness nor cached data', () => {
    render(<FreshnessIndicator state={{ lastUpdated: Date.now() - 5000, status: 'partial' }} />)
    expect(screen.getByText(/partly updated \d+s ago — some sources unread/i)).toBeInTheDocument()
    expect(screen.queryByText(/stale — showing last known/i)).not.toBeInTheDocument()
  })

  it('reports a partial FIRST read without inventing a timestamp for it', () => {
    render(<FreshnessIndicator state={{ lastUpdated: null, status: 'partial' }} />)
    expect(screen.getByText(/^partly updated — some sources unread$/i)).toBeInTheDocument()
  })

  it('disables refresh while refreshing', () => {
    render(<FreshnessIndicator state={{ status: 'refreshing' }} onRefresh={vi.fn()} />)
    expect(screen.getByRole('button', { name: /refresh account data/i })).toBeDisabled()
    expect(screen.getByText(/updating/i)).toBeInTheDocument()
  })
})
