import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Spec 034 — AddTokenDialog: browse the registry (US1) and add custom tokens by address
// (US2). useTokenRegistry, useWeb3, and resolveCustomToken are mocked.

const TOKEN = { chainId: 137, address: '0x1111111111111111111111111111111111111111', symbol: 'USDC', name: 'USD Coin', decimals: 6 }

const h = vi.hoisted(() => ({
  registry: { catalog: [], status: 'ready', isCustomOnly: false, search: () => [] },
  isWatched: () => false,
  resolveCustomToken: vi.fn(),
  onAdd: vi.fn(),
}))

vi.mock('../../../hooks/useWeb3', () => ({ useWeb3: () => ({ provider: {} }) }))
vi.mock('../../../hooks/useTokenRegistry', () => ({ useTokenRegistry: () => h.registry }))
vi.mock('../../../lib/tokens/resolveCustomToken', () => ({
  resolveCustomToken: (...args) => h.resolveCustomToken(...args),
}))

import AddTokenDialog from '../AddTokenDialog'

beforeEach(() => {
  h.registry = { catalog: [TOKEN], status: 'ready', isCustomOnly: false, search: () => [TOKEN] }
  h.isWatched = () => false
  h.resolveCustomToken = vi.fn()
  h.onAdd = vi.fn()
})

const renderDialog = () =>
  render(<AddTokenDialog chainId={137} onAdd={h.onAdd} isWatched={(...a) => h.isWatched(...a)} onClose={vi.fn()} />)

describe('AddTokenDialog — browse (US1)', () => {
  it('adds a registry token with source "registry"', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(h.onAdd).toHaveBeenCalledWith(expect.objectContaining({ ...TOKEN, source: 'registry' }))
  })

  it('shows "Added" (disabled) for an already-watched token', () => {
    h.isWatched = () => true
    renderDialog()
    const btn = screen.getByRole('button', { name: /added/i })
    expect(btn).toBeDisabled()
  })

  it('on a custom-only network, shows the honest notice in Browse and defaults to Custom', () => {
    h.registry = { catalog: [], status: 'ready', isCustomOnly: true, search: () => [] }
    renderDialog()
    // Defaults to the custom address form…
    expect(screen.getByLabelText(/token contract address/i)).toBeInTheDocument()
    // …and the Browse tab states no curated catalog exists.
    fireEvent.click(screen.getByRole('tab', { name: /browse registry/i }))
    expect(screen.getByText(/no curated token catalog/i)).toBeInTheDocument()
  })
})

describe('AddTokenDialog — custom (US2)', () => {
  const goCustomAndSubmit = (addr = '0x5555555555555555555555555555555555555555') => {
    fireEvent.click(screen.getByRole('tab', { name: /custom address/i }))
    fireEvent.change(screen.getByLabelText(/token contract address/i), { target: { value: addr } })
    fireEvent.click(screen.getByRole('button', { name: /add token/i }))
  }

  it('resolves a valid custom token and adds it with source "custom" (FR-003/004/025)', async () => {
    const resolved = { address: '0x5555555555555555555555555555555555555555', chainId: 137, source: 'custom', symbol: 'NEW', name: 'New', decimals: 18 }
    h.resolveCustomToken.mockResolvedValue(resolved)
    renderDialog()
    goCustomAndSubmit()
    await waitFor(() => expect(h.onAdd).toHaveBeenCalledWith(resolved))
  })

  it('rejects an unresolvable address with an honest error and adds nothing (FR-011)', async () => {
    h.resolveCustomToken.mockRejectedValue(new Error('Could not read this token.'))
    renderDialog()
    goCustomAndSubmit('0x6666666666666666666666666666666666666666')
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not read/i)
    expect(h.onAdd).not.toHaveBeenCalled()
  })

  it('prevents adding a duplicate (FR-010)', async () => {
    h.resolveCustomToken.mockResolvedValue({ address: '0x5555555555555555555555555555555555555555', chainId: 137, source: 'custom', symbol: 'DUP', name: '', decimals: 18 })
    h.isWatched = () => true
    renderDialog()
    goCustomAndSubmit()
    expect(await screen.findByText(/already in your watchlist/i)).toBeInTheDocument()
    expect(h.onAdd).not.toHaveBeenCalled()
  })
})
