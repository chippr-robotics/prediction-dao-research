// Spec 043 — Custody shell renders both sub-sections, disables Off chain, gates On chain by Safe availability,
// and meets WCAG 2.1 AA.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

let walletCtx = { chainId: 63 }
vi.mock('../../hooks', () => ({ useWallet: () => walletCtx }))
// The Verify area reads the wallet through useWalletManagement (like useActiveAccount does), so
// the shell now needs both seams mocked — Protect genuinely uses the connected identity.
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => walletCtx }))
vi.mock('../../hooks/useCustody', () => ({
  useCustody: () => ({ active: { mode: 'personal' }, operateAsVault: vi.fn(), operateAsPersonal: vi.fn() }),
}))

import CustodyPanel from '../../components/custody/CustodyPanel'

beforeEach(() => {
  walletCtx = { chainId: 63 }
})

describe('CustodyPanel', () => {
  it('renders On chain, Verify and Off chain sub-sections, Off chain disabled', () => {
    render(<CustodyPanel />)
    expect(screen.getByRole('heading', { name: /^On chain$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Verify$/i })).toBeInTheDocument()
    const offchain = screen.getByRole('heading', { name: /^Off chain$/i }).closest('section')
    expect(offchain).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/coming later/i)).toBeInTheDocument()
  })

  it('shows the onboarding empty state on a supported network (Mordor 63)', () => {
    walletCtx = { chainId: 63 }
    render(<CustodyPanel />)
    expect(screen.getByText(/no vaults yet/i)).toBeInTheDocument()
  })

  // Spec 068 (FR-005) — an unsupported connected network withdraws vault CREATION only. The vault
  // list keeps rendering, because a member's vaults live on their own chains and must not vanish
  // because the wallet happens to be pointed somewhere else.
  it('withdraws vault creation on an unsupported chain but keeps the vault list', () => {
    walletCtx = { chainId: 1 }
    render(<CustodyPanel />)
    expect(screen.getByText(/cannot be created on this network/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^create vault$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/no vaults yet/i)).toBeInTheDocument()
  })

  // Verify needs no deployment anywhere, so unlike the vault sections it is never withdrawn by the
  // connected network — a member can always check a signature they were handed.
  it('keeps Verify available on a chain with no custody deployment', () => {
    walletCtx = { chainId: 1 }
    render(<CustodyPanel />)
    expect(screen.getByRole('heading', { name: /^Verify$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /check a signature/i })).toBeInTheDocument()
  })

  it('names the custody chains a member can switch to (FR-005)', () => {
    walletCtx = { chainId: 1 }
    render(<CustodyPanel />)
    expect(screen.getByText(/custody is available on/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(<CustodyPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
