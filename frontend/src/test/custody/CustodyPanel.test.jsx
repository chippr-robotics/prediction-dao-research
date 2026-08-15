// Spec 043 + 085 — Custody shell renders the three areas as accordion sections (On chain open by
// default), gates On chain creation by Safe availability, serves Off chain hardware accounts, and
// meets WCAG 2.1 AA.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  localStorage.clear()
})

/** The accordion trigger for a section, by its visible title. */
const trigger = (name) => screen.getByRole('button', { name })

describe('CustodyPanel', () => {
  it('renders On chain, Verify and Off chain as accordion sections, On chain open', () => {
    render(<CustodyPanel />)
    expect(trigger(/^On chain$/i)).toHaveAttribute('aria-expanded', 'true')
    // Collapsed sections carry their one-line summary in the trigger (spec 085 FR-009).
    expect(trigger(/Verify/i)).toHaveAttribute('aria-expanded', 'false')
    expect(trigger(/Off chain/i)).toHaveAttribute('aria-expanded', 'false')
    // The spec-043 placeholder is gone — Off chain is a live section now.
    expect(screen.queryByText(/coming later/i)).not.toBeInTheDocument()
  })

  it('opens one section at a time (exclusive accordion)', () => {
    render(<CustodyPanel />)
    fireEvent.click(trigger(/Off chain/i))
    expect(trigger(/^Off chain$/i)).toHaveAttribute('aria-expanded', 'true')
    expect(trigger(/On chain/i)).toHaveAttribute('aria-expanded', 'false')
  })

  it('serves the hardware wallet area under Off chain', () => {
    render(<CustodyPanel />)
    fireEvent.click(trigger(/Off chain/i))
    // No wallet connected in this mock → the honest gate, not a dead control.
    expect(screen.getByText(/connect your wallet to add hardware accounts/i)).toBeInTheDocument()
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
    fireEvent.click(trigger(/Verify/i))
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
