import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig()
  return { ...actual, useNavigate: () => navigateMock }
})

import EntryGate from '../components/compliance/EntryGate'

const ACK_KEY = 'fairwins.entryGate.ack.v1'

describe('EntryGate (T040)', () => {
  beforeEach(() => {
    localStorage.clear()
    navigateMock.mockReset()
  })

  it('shows the gate on first visit (no prior acknowledgement)', () => {
    render(<EntryGate />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Before you enter FairWins/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
  })

  it('links the current versioned Terms and Risk Disclosure', () => {
    render(<EntryGate />)
    expect(screen.getByRole('link', { name: /Terms & Conditions/i })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: /Risk Disclosure/i })).toHaveAttribute('href', '/risk')
  })

  it('shows a VPN/circumvention warning', () => {
    render(<EntryGate />)
    expect(screen.getByText(/VPN, proxy, or any means to misrepresent/i)).toBeInTheDocument()
  })

  it('Enter records acknowledgement and hides the gate', () => {
    render(<EntryGate />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const ack = JSON.parse(localStorage.getItem(ACK_KEY))
    expect(ack).toBeTruthy()
    expect(ack.terms).toMatch(/^[0-9a-f]{64}$/)
    expect(ack.risk).toMatch(/^[0-9a-f]{64}$/)
  })

  it('Leave navigates away to the landing page', () => {
    render(<EntryGate />)
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(navigateMock).toHaveBeenCalledWith('/')
  })

  it('does NOT re-gate a returning visitor who already acknowledged', () => {
    localStorage.setItem(ACK_KEY, JSON.stringify({ terms: 'x', risk: 'y', at: 'earlier' }))
    render(<EntryGate />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
