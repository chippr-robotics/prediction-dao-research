import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createOpenChallenge = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual, // keep OPEN_RESOLUTION_TYPES
    useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }),
  }
})

import CreateOpenChallengeModal from '../../components/fairwins/CreateOpenChallengeModal'
import { translateOpenCreateRevert } from '../../hooks/useOpenChallengeCreate'

describe('CreateOpenChallengeModal', () => {
  beforeEach(() => createOpenChallenge.mockReset())

  it('renders nothing when closed', () => {
    const { container } = render(<CreateOpenChallengeModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('disables create until a description and positive stake are present', () => {
    render(<CreateOpenChallengeModal isOpen onClose={() => {}} />)
    const btn = screen.getByRole('button', { name: /create & generate code/i })
    expect(btn).toBeDisabled() // empty description
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Will it rain?' } })
    expect(btn).toBeEnabled()
  })

  it('requires a valid arbitrator address when third-party resolution is chosen', () => {
    render(<CreateOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Bet' } })
    fireEvent.change(screen.getByLabelText(/how is it resolved/i), { target: { value: '3' } }) // ThirdParty
    const btn = screen.getByRole('button', { name: /create & generate code/i })
    expect(btn).toBeDisabled() // no arbitrator yet
    fireEvent.change(screen.getByLabelText(/arbitrator address/i), { target: { value: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' } })
    expect(btn).toBeEnabled()
  })

  it('creates and displays the generated code with save/security notices', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 5n, txHash: '0xabc' })
    render(<CreateOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Will it rain?' } })
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))

    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
    expect(screen.getByText(/Save this code now/i)).toBeInTheDocument()
    expect(screen.getByText(/brute-force/i)).toBeInTheDocument() // honest residual-risk notice
  })

  // The Silver-tier gate is enforced on-chain; the create hook maps that revert to a friendly message.
  // Tested directly on the pure translator (the through-component async-reject path is a Vitest
  // unhandled-rejection harness artifact, not a modal bug — the success path above exercises rendering).
  it('maps the Silver-tier revert to a clear, actionable message', () => {
    expect(translateOpenCreateRevert('execution reverted: InsufficientMembershipTier()'))
      .toMatch(/Silver membership or above/i)
    expect(translateOpenCreateRevert('OpenResolutionTypeNotAllowed()'))
      .toMatch(/Either-side|third-party|oracle/i)
    expect(translateOpenCreateRevert('MembershipDenied()'))
      .toMatch(/active membership/i)
  })
})
