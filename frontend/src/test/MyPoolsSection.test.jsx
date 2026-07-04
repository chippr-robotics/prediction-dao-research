import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const items = []
vi.mock('../hooks/useMyPools', () => ({
  useMyPools: () => ({ items, loading: false, refresh: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

import MyPoolsSection from '../components/fairwins/MyPoolsSection'

const activePool = { id: 'a', title: 'Active Pool', status: 'Open', bucket: 'active', route: '/pool/a' }
const pastPool = { id: 'b', title: 'Past Pool', status: 'Resolved', bucket: 'history', route: '/pool/b' }

describe('MyPoolsSection (spec 040 US5)', () => {
  beforeEach(() => { items.length = 0 })

  it('shows only active pools on a non-history tab', () => {
    items.push(activePool, pastPool)
    render(<MyPoolsSection activeTab="participating" />)
    expect(screen.getByText('Active Pool')).toBeInTheDocument()
    expect(screen.queryByText('Past Pool')).not.toBeInTheDocument()
  })

  it('shows only terminal pools on the History tab', () => {
    items.push(activePool, pastPool)
    render(<MyPoolsSection activeTab="history" />)
    expect(screen.getByText('Past Pool')).toBeInTheDocument()
    expect(screen.queryByText('Active Pool')).not.toBeInTheDocument()
  })

  it('renders nothing when there are no pools for the active tab', () => {
    items.push(pastPool) // only a terminal pool
    const { container } = render(<MyPoolsSection activeTab="created" />)
    expect(container.querySelector('.mm-pools-section')).toBeNull()
  })

  it('drops the per-row Active/Past chip (the tab conveys bucket)', () => {
    items.push(activePool)
    render(<MyPoolsSection activeTab="participating" />)
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    expect(screen.queryByText('Past')).not.toBeInTheDocument()
  })

  it('never prompts for decrypt words to view a member pool (spec 040 US3)', () => {
    items.push(activePool)
    render(<MyPoolsSection activeTab="participating" />)
    // Pools deep-link out; there is no code/word entry field in this surface.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/decrypt|claim code|four-word/i)).not.toBeInTheDocument()
  })
})
