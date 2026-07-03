import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const accept = vi.fn()
vi.mock('../../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ accept, busy: false, lookup: vi.fn(), discover: vi.fn(), error: null }),
}))

import TakeChallengePanel from '../TakeChallengePanel'
import { UIContext } from '../../../contexts/UIContext'

const matchOpen = { wagerId: 4n, wager: {}, terms: { description: 'Will it snow?' }, termsUnavailable: false, needsMembership: false }

describe('TakeChallengePanel (spec 037, US1)', () => {
  beforeEach(() => { accept.mockReset() })

  it('shows terms + funding steps and accepts (onProgress passed through)', async () => {
    accept.mockResolvedValue({ txHash: '0xdef' })
    render(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    expect(screen.getByText(/Will it snow/)).toBeInTheDocument()
    expect(screen.getByText(/Approve the stake token/i)).toBeInTheDocument()
    expect(screen.getByText(/Sign to authorize acceptance/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept challenge/i }))
    await waitFor(() => expect(accept).toHaveBeenCalledWith('river tiger kite zoo', 4n, expect.any(Function)))
    expect(await screen.findByText(/taken the challenge/i)).toBeInTheDocument()
  })

  it('moves the accept explainer and save-code note behind an info icon (spec 039 US2)', () => {
    render(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    expect(screen.queryByText(/binds you as the opponent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/save your code to re-read/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About accepting' }))
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/binds you as the opponent/i)
    expect(note).toHaveTextContent(/save your code to re-read/i)
  })

  it('prompts for membership when the taker is not a member (no accept button)', () => {
    const onBuyMembership = vi.fn()
    render(<TakeChallengePanel code="river tiger kite zoo" match={{ ...matchOpen, needsMembership: true }} onClose={() => {}} onBuyMembership={onBuyMembership} />)
    expect(screen.queryByRole('button', { name: /accept challenge/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /membership/i }))
    expect(onBuyMembership).toHaveBeenCalled()
  })

  it('shows terms-unavailable but still allows accept', () => {
    render(<TakeChallengePanel code="river tiger kite zoo" match={{ ...matchOpen, terms: null, termsUnavailable: true }} onClose={() => {}} />)
    expect(screen.getByText(/terms unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept challenge/i })).toBeInTheDocument()
  })

  it('surfaces a clean revert error without crashing (e.g. no-longer-open)', async () => {
    accept.mockRejectedValue(new Error('This challenge is no longer open — someone may have already taken it.'))
    render(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /accept challenge/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no longer open/i))
  })

  it('routes a success toast into the notification system (spec 037)', async () => {
    accept.mockResolvedValue({ txHash: '0xdef' })
    const showNotification = vi.fn()
    render(
      <UIContext.Provider value={{ showNotification }}>
        <TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />
      </UIContext.Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /accept challenge/i }))
    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.stringMatching(/taken the challenge/i), 'success', expect.any(Number)))
  })
})
