import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegisterExternalDao from '../RegisterExternalDao'

// Spec 042 US2 — register/track flow. Client-side framework detection (OZ vs Bravo) gates validation; on a
// registry-less network the submit routes to trackDAO (device-local). Invalid/unknown addresses are rejected
// with a truthful reason and nothing is tracked.

const h = vi.hoisted(() => ({ detect: vi.fn(), track: vi.fn() }))

vi.mock('../connectors', () => ({
  detectFramework: (...a) => h.detect(...a),
  getConnector: (fw) => ({ framework: fw, validate: async () => ({ ok: true, name: 'Uniswap Governor Bravo' }) }),
}))
// CpAddressField → AddressBookButton → wallet hooks would throw without a provider.
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../../../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn() }) }))

const ADDR = '0x408ED6354d4973f66138C91495F2f2FCbd8724C3'

function renderForm(hasRegistry = false) {
  return render(<RegisterExternalDao reader={{}} track={h.track} hasRegistry={hasRegistry} onRegistered={() => {}} />)
}

describe('RegisterExternalDao registry-less track (spec 042 US2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detects the framework, then tracks device-local on a registry-less network', async () => {
    h.detect.mockResolvedValue(1) // GovernorBravo
    h.track.mockResolvedValue({ added: true })
    const user = userEvent.setup()
    renderForm(false)
    await user.type(screen.getByLabelText(/governor address/i), ADDR)
    await user.click(screen.getByRole('button', { name: /validate/i }))
    await waitFor(() => expect(screen.getByText(/Recognized Governor Bravo contract/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /track dao/i }))
    await waitFor(() => expect(h.track).toHaveBeenCalledWith(expect.objectContaining({ address: ADDR, framework: 1 })))
  })

  it('rejects an unrecognized contract with a truthful reason — nothing tracked', async () => {
    h.detect.mockResolvedValue('unknown')
    const user = userEvent.setup()
    renderForm(false)
    await user.type(screen.getByLabelText(/governor address/i), ADDR)
    await user.click(screen.getByRole('button', { name: /validate/i }))
    await waitFor(() => expect(screen.getByText(/Not a recognized governance contract/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /track dao/i })).toBeDisabled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('labels the primary action "Register DAO" on a registry network', async () => {
    h.detect.mockResolvedValue(0)
    renderForm(true)
    expect(screen.getByRole('button', { name: /register dao/i })).toBeInTheDocument()
  })
})
