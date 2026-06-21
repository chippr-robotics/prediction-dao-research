import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock both flow hooks so the tabbed modal renders deterministically (no chain/IPFS).
// Mirrors src/test/claimCode/OpenChallengeModal.test.jsx.
const createOpenChallenge = vi.fn()
const discover = vi.fn()
const accept = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})
vi.mock('../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ discover, accept, busy: false, error: null }),
}))

import OpenChallengeModal from '../../components/fairwins/OpenChallengeModal'

// vi.mock above replaces the whole useOpenChallengeAccept module, so translateAcceptRevert
// can't be imported from it here. This is the exact string that helper returns for
// 'NotOpenChallenge' (see hooks/useOpenChallengeAccept.js → translateAcceptRevert).
const NOT_OPEN_MESSAGE = 'This challenge is no longer open — someone may have already taken it.'

/**
 * T039 / SC-005 — Public (no-named-opponent) mode.
 *
 * An open challenge has no opponent named up front; anyone holding the code may take
 * the other side. When the wager is no longer open (someone already took it), the take
 * flow must surface a clean "no longer open / already taken" message, never crash.
 */
describe('OpenChallengeModal public mode state (SC-005)', () => {
  beforeEach(() => { createOpenChallenge.mockReset(); discover.mockReset(); accept.mockReset() })

  it('renders public / no-named-opponent messaging', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} initialTab="taker" />)
    // Modal subtitle states there is no named opponent.
    expect(screen.getByText(/no opponent named up front/i)).toBeInTheDocument()
    // Maker tab spells out that anyone with the code can take the other side.
    fireEvent.click(screen.getByRole('tab', { name: /create a challenge/i }))
    expect(screen.getByText(/anyone you share the code with can take the other side/i)).toBeInTheDocument()
  })

  it('surfaces a clean "no longer open" error when accept reverts NotOpenChallenge (no crash)', async () => {
    const friendly = NOT_OPEN_MESSAGE
    expect(friendly).toMatch(/no longer open|already/i)

    discover.mockResolvedValue({
      wagerId: 7n,
      wager: {},
      terms: { description: 'Will it rain?' },
      termsUnavailable: false,
      needsMembership: false,
    })
    // The hook translates the revert before rejecting (see useOpenChallengeAccept.accept).
    accept.mockRejectedValue(new Error(friendly))

    render(<OpenChallengeModal isOpen onClose={() => {}} initialTab="taker" />)

    // Drive lookup → found.
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))
    await waitFor(() => expect(discover).toHaveBeenCalledWith('river tiger kite zoo'))
    expect(await screen.findByText(/Will it rain/)).toBeInTheDocument()

    // Drive accept → reverts.
    fireEvent.click(screen.getByRole('button', { name: /accept challenge/i }))
    await waitFor(() => expect(accept).toHaveBeenCalled())

    // The error is surfaced as an alert banner, not an unhandled crash.
    const banner = await screen.findByText(/no longer open|already/i, { selector: '.fm-error-banner' })
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent(friendly)

    // The flow stays usable (still on the found phase with an accept button), no white screen.
    expect(screen.getByRole('button', { name: /accept challenge/i })).toBeInTheDocument()
  })
})
