import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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
    // The create form spells out that anyone with the code can take the other side.
    expect(screen.getByText(/anyone you share the code with can take the other side/i)).toBeInTheDocument()
  })
})
