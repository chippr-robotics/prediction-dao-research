// Spec 043 — Custody shell renders both sub-sections, disables Off chain, gates On chain by Safe availability,
// and meets WCAG 2.1 AA.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

let walletCtx = { chainId: 63 }
vi.mock('../../hooks', () => ({ useWallet: () => walletCtx }))
vi.mock('../../hooks/useCustody', () => ({
  useCustody: () => ({ active: { mode: 'personal' }, operateAsVault: vi.fn(), operateAsPersonal: vi.fn() }),
}))

import CustodyPanel from '../../components/custody/CustodyPanel'

beforeEach(() => {
  walletCtx = { chainId: 63 }
})

describe('CustodyPanel', () => {
  it('renders On chain and Off chain sub-sections, Off chain disabled', () => {
    render(<CustodyPanel />)
    expect(screen.getByRole('heading', { name: /^On chain$/i })).toBeInTheDocument()
    const offchain = screen.getByRole('heading', { name: /^Off chain$/i }).closest('section')
    expect(offchain).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/coming later/i)).toBeInTheDocument()
  })

  it('shows the onboarding empty state on a supported network (Mordor 63)', () => {
    walletCtx = { chainId: 63 }
    render(<CustodyPanel />)
    expect(screen.getByText(/no vaults yet/i)).toBeInTheDocument()
  })

  it('shows an "unavailable on this network" state on an unsupported chain', () => {
    walletCtx = { chainId: 1 }
    render(<CustodyPanel />)
    expect(screen.getByText(/not available on this network/i)).toBeInTheDocument()
    expect(screen.queryByText(/no vaults yet/i)).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(<CustodyPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
