import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock both flow hooks so the tabbed modal is tested deterministically (no chain/IPFS).
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

describe('OpenChallengeModal (tabbed Maker/Taker)', () => {
  beforeEach(() => { createOpenChallenge.mockReset(); discover.mockReset(); accept.mockReset() })

  it('renders nothing when closed', () => {
    const { container } = render(<OpenChallengeModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows both Maker and Taker tabs and defaults to Maker', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.getByRole('tab', { name: /create a challenge/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /take a challenge/i })).toHaveAttribute('aria-selected', 'false')
    // Maker form is shown
    expect(screen.getByLabelText(/what's the wager/i)).toBeInTheDocument()
  })

  it('Maker: gates create until description + stake, then shows the generated code', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 9n, txHash: '0xabc' })
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const createBtn = screen.getByRole('button', { name: /create & generate code/i })
    expect(createBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Will it rain?' } })
    expect(createBtn).toBeEnabled()
    fireEvent.click(createBtn)
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
    expect(screen.getByText(/Save this code now/i)).toBeInTheDocument()
  })

  it('Taker: switching tabs, looking up by code, and accepting', async () => {
    discover.mockResolvedValue({ wagerId: 4n, wager: {}, terms: { description: 'Will it snow?' }, termsUnavailable: false, needsMembership: false })
    accept.mockResolvedValue({ txHash: '0xdef' })
    render(<OpenChallengeModal isOpen onClose={() => {}} initialTab="taker" />)

    const codeInput = screen.getByLabelText(/word code/i)
    const findBtn = screen.getByRole('button', { name: /find challenge/i })
    expect(findBtn).toBeDisabled()
    fireEvent.change(codeInput, { target: { value: 'river tiger kite zoo' } })
    expect(findBtn).toBeEnabled()
    fireEvent.click(findBtn)

    await waitFor(() => expect(discover).toHaveBeenCalledWith('river tiger kite zoo'))
    expect(await screen.findByText(/Will it snow/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept challenge/i }))
    await waitFor(() => expect(accept).toHaveBeenCalledWith('river tiger kite zoo', 4n))
    expect(await screen.findByText(/taken the challenge/i)).toBeInTheDocument()
  })

  it('Taker: prompts for membership when the taker is not a member', async () => {
    discover.mockResolvedValue({ wagerId: 1n, wager: {}, terms: { description: 'x' }, termsUnavailable: false, needsMembership: true })
    const onBuyMembership = vi.fn()
    render(<OpenChallengeModal isOpen onClose={() => {}} initialTab="taker" onBuyMembership={onBuyMembership} />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))
    const buyBtn = await screen.findByRole('button', { name: /membership/i })
    expect(screen.queryByRole('button', { name: /accept challenge/i })).not.toBeInTheDocument()
    fireEvent.click(buyBtn)
    expect(onBuyMembership).toHaveBeenCalled()
  })

  it('Taker: shows terms-unavailable but still allows accept', async () => {
    discover.mockResolvedValue({ wagerId: 2n, wager: {}, terms: null, termsUnavailable: true, needsMembership: false })
    render(<OpenChallengeModal isOpen onClose={() => {}} initialTab="taker" />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: 'river tiger kite zoo' } })
    fireEvent.click(screen.getByRole('button', { name: /find challenge/i }))
    expect(await screen.findByText(/terms unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept challenge/i })).toBeInTheDocument()
  })
})
