import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const accept = vi.fn()
vi.mock('../../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ accept, busy: false, lookup: vi.fn(), discover: vi.fn(), error: null }),
}))

import TakeChallengePanel from '../TakeChallengePanel'
import { UIContext } from '../../../contexts/UIContext'
import { WalletContext } from '../../../contexts/WalletContext'

const matchOpen = { wagerId: 4n, wager: {}, terms: { description: 'Will it snow?' }, termsUnavailable: false, needsMembership: false }

// A connected taker — the take flow needs an address, so most cases render with one.
const connectedWallet = { address: '0xTaker', account: '0xTaker', openConnectModal: vi.fn() }

function renderPanel(ui, wallet = connectedWallet) {
  return render(<WalletContext.Provider value={wallet}>{ui}</WalletContext.Provider>)
}

describe('TakeChallengePanel (spec 037, US1)', () => {
  beforeEach(() => { accept.mockReset(); connectedWallet.openConnectModal.mockReset() })

  it('shows terms + funding steps and accepts (onProgress passed through)', async () => {
    accept.mockResolvedValue({ txHash: '0xdef' })
    renderPanel(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    expect(screen.getByText(/Will it snow/)).toBeInTheDocument()
    expect(screen.getByText(/Approve the stake token/i)).toBeInTheDocument()
    expect(screen.getByText(/Sign to authorize acceptance/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }))
    await waitFor(() => expect(accept).toHaveBeenCalledWith('river tiger kite zoo', 4n, expect.any(Function)))
    expect(await screen.findByText(/taken the challenge/i)).toBeInTheDocument()
  })

  it('renders the challenge as plain prose, not a JSON code block', () => {
    renderPanel(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    const text = screen.getByText('Will it snow?')
    // Readable paragraph, never the raw `{ "description": … }` dump.
    expect(text.tagName).toBe('P')
    expect(text).toHaveClass('tc-terms-text')
    expect(screen.queryByText(/"description"/)).toBeNull()
  })

  it('offers a Connect affordance instead of dead-ending accept when no wallet is connected', () => {
    const openConnectModal = vi.fn()
    renderPanel(
      <TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />,
      { address: null, account: null, openConnectModal }
    )
    // No "Lock In!" accept button while disconnected — a connect prompt instead.
    expect(screen.queryByRole('button', { name: /^lock in!$/i })).toBeNull()
    const connectBtn = screen.getByRole('button', { name: /connect wallet to lock in/i })
    fireEvent.click(connectBtn)
    expect(openConnectModal).toHaveBeenCalled()
    // Never silently calls accept without a wallet.
    expect(accept).not.toHaveBeenCalled()
  })

  it('moves the accept explainer and save-code note behind an info icon (spec 039 US2)', () => {
    renderPanel(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    expect(screen.queryByText(/binds you as the opponent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/save your code to re-read/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About accepting' }))
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/binds you as the opponent/i)
    expect(note).toHaveTextContent(/save your code to re-read/i)
  })

  it('prompts for membership when the taker is not a member (no accept button)', () => {
    const onBuyMembership = vi.fn()
    renderPanel(<TakeChallengePanel code="river tiger kite zoo" match={{ ...matchOpen, needsMembership: true }} onClose={() => {}} onBuyMembership={onBuyMembership} />)
    expect(screen.queryByRole('button', { name: /lock in/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /membership/i }))
    expect(onBuyMembership).toHaveBeenCalled()
  })

  it('shows terms-unavailable but still allows accept', () => {
    renderPanel(<TakeChallengePanel code="river tiger kite zoo" match={{ ...matchOpen, terms: null, termsUnavailable: true }} onClose={() => {}} />)
    expect(screen.getByText(/terms unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lock in/i })).toBeInTheDocument()
  })

  it('surfaces a clean revert error without crashing (e.g. no-longer-open)', async () => {
    accept.mockRejectedValue(new Error('This challenge is no longer open — someone may have already taken it.'))
    renderPanel(<TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no longer open/i))
  })

  it('routes a success toast into the notification system (spec 037)', async () => {
    accept.mockResolvedValue({ txHash: '0xdef' })
    const showNotification = vi.fn()
    renderPanel(
      <UIContext.Provider value={{ showNotification }}>
        <TakeChallengePanel code="river tiger kite zoo" match={matchOpen} onClose={() => {}} />
      </UIContext.Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }))
    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.stringMatching(/taken the challenge/i), 'success', expect.any(Number)))
  })
})
