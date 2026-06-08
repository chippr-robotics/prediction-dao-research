import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { switchSpy } = vi.hoisted(() => ({ switchSpy: vi.fn() }))
vi.mock('../hooks/useWeb3', () => ({ useWeb3: () => ({ switchNetwork: switchSpy }) }))

import NetworkUnavailableNotice from '../components/ui/NetworkUnavailableNotice'

describe('NetworkUnavailableNotice', () => {
  it('renders an actionable alert naming the target network', () => {
    render(<NetworkUnavailableNotice feature="Membership purchases" targetName="Polygon" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/isn’t available on this network/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /switch to Polygon/i })).toBeInTheDocument()
  })

  it('invokes switchNetwork when the switch action is clicked', () => {
    render(<NetworkUnavailableNotice targetName="Polygon" />)
    fireEvent.click(screen.getByRole('button', { name: /switch to Polygon/i }))
    expect(switchSpy).toHaveBeenCalled()
  })
})
