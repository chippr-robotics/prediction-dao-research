import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the accept hook so the modal's flow logic is tested deterministically (no chain/IPFS).
const discover = vi.fn()
const accept = vi.fn()
vi.mock('../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ discover, accept, busy: false, error: null }),
}))

import TakeChallengeModal from '../../components/fairwins/TakeChallengeModal'

describe('TakeChallengeModal', () => {
  beforeEach(() => {
    discover.mockReset()
    accept.mockReset()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<TakeChallengeModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('disables "Find challenge" until the code is four valid words', () => {
    render(<TakeChallengeModal isOpen onClose={() => {}} />)
    const button = screen.getByRole('button', { name: /find challenge/i })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river amber tiger' } })
    expect(button).toBeDisabled() // only 3 words
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    expect(button).toBeEnabled()
  })

  it('looks up a challenge, shows decrypted terms, and accepts', async () => {
    discover.mockResolvedValue({
      wagerId: 7n,
      wager: {},
      terms: { description: 'Will it rain tomorrow?' },
      termsUnavailable: false,
      needsMembership: false,
    })
    accept.mockResolvedValue({ txHash: '0xabc123def456789' })
    const onAccepted = vi.fn()

    render(<TakeChallengeModal isOpen onClose={() => {}} onAccepted={onAccepted} />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))

    await waitFor(() => expect(discover).toHaveBeenCalledWith('river tiger kite zoo'))
    expect(await screen.findByText(/Will it rain tomorrow/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /accept challenge/i }))
    await waitFor(() => expect(accept).toHaveBeenCalledWith('river tiger kite zoo', 7n))
    await waitFor(() => expect(onAccepted).toHaveBeenCalled())
    expect(screen.getByText(/you're now the opponent/i)).toBeInTheDocument()
  })

  it('prompts for membership instead of accept when the taker is not a member', async () => {
    discover.mockResolvedValue({ wagerId: 1n, wager: {}, terms: { description: 'x' }, termsUnavailable: false, needsMembership: true })
    const onBuyMembership = vi.fn()
    render(<TakeChallengeModal isOpen onClose={() => {}} onBuyMembership={onBuyMembership} />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))
    const buyBtn = await screen.findByRole('button', { name: /membership/i })
    expect(screen.queryByRole('button', { name: /accept challenge/i })).not.toBeInTheDocument()
    fireEvent.click(buyBtn)
    expect(onBuyMembership).toHaveBeenCalled()
  })

  it('shows a "terms unavailable" notice but still allows accept', async () => {
    discover.mockResolvedValue({ wagerId: 2n, wager: {}, terms: null, termsUnavailable: true, needsMembership: false })
    render(<TakeChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))
    expect(await screen.findByText(/terms unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept challenge/i })).toBeInTheDocument()
  })

  it('surfaces a lookup error (e.g. wrong code) without revealing a wager', async () => {
    discover.mockRejectedValue(new Error('No open challenge matches that code.'))
    render(<TakeChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))
    expect(await screen.findByText(/No open challenge matches/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept challenge/i })).not.toBeInTheDocument()
  })
})
