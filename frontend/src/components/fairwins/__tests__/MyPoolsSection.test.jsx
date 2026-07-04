import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const navigate = vi.fn()
const { mockPools } = vi.hoisted(() => ({ mockPools: { current: [] } }))
vi.mock('../../../hooks/useMyPools', () => ({ useMyPools: () => ({ items: mockPools.current, loading: false }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

import MyPoolsSection from '../MyPoolsSection'

describe('MyPoolsSection (spec 037, US2)', () => {
  beforeEach(() => { navigate.mockReset(); mockPools.current = [] })

  it('renders nothing when the user has no pools (FR-019)', () => {
    const { container } = render(<MyPoolsSection />)
    expect(container.firstChild).toBeNull()
  })

  it('lists active pools with type + status and routes on click; terminal pools move to History (spec 040 US5)', () => {
    mockPools.current = [
      { type: 'pool', id: '0xa', title: 'Pool #3', status: 'Joining open', bucket: 'active', route: '/pools/0xa' },
      { type: 'pool', id: '0xb', title: 'Pool #4', status: 'Resolved', bucket: 'history', route: '/pools/0xb' },
    ]
    // Active (non-history) tab shows only the active pool — the terminal pool is filed under History.
    render(<MyPoolsSection activeTab="participating" />)
    expect(screen.getByText('Pool #3')).toBeInTheDocument()
    expect(screen.getByText('Joining open')).toBeInTheDocument()
    expect(screen.queryByText('Pool #4')).not.toBeInTheDocument()
    expect(screen.getAllByText('Pool')).toHaveLength(1) // only the active pool renders here
    // The per-row Active/Past chip was removed (the tab conveys the bucket).
    expect(screen.queryByText('Past')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /open pool #3/i }))
    expect(navigate).toHaveBeenCalledWith('/pools/0xa')
  })
})
