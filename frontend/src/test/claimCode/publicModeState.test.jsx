import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the create flow so the modal renders deterministically (no chain/IPFS).
const createOpenChallenge = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})

import OpenChallengeModal from '../../components/fairwins/OpenChallengeModal'

/**
 * SC-005 — Public (no-named-opponent) mode. An open challenge has no opponent named up front;
 * anyone holding the code may take the other side. (The take flow's "no longer open" revert
 * handling now lives with the unified lookup — see TakeChallengePanel.test.jsx.)
 */
describe('OpenChallengeModal public mode state (SC-005)', () => {
  beforeEach(() => { createOpenChallenge.mockReset() })

  it('renders public / no-named-opponent messaging', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    // Modal subtitle states there is no named opponent.
    expect(screen.getByText(/no opponent named up front/i)).toBeInTheDocument()
    // The full explainer moved behind the subtitle's info icon (spec 039):
    // hidden by default, revealed in a bubble on demand.
    expect(screen.queryByText(/anyone you share the code with can take the other side/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About open challenges' }))
    expect(screen.getByRole('note')).toHaveTextContent(/anyone you share the code with can take the other side/i)
  })
})
