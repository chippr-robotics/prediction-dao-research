import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the create flow so the modal renders deterministically (no chain/IPFS).
const createOpenChallenge = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})

import OpenChallengeModal from '../../components/fairwins/OpenChallengeModal'
import { buildTakeChallengeUrl, parseTakeChallengeParams } from '../../utils/claimCode/deepLink.js'

// Enter a stake amount on the payments-style number pad (spec 052). Each pad key
// is a button named for its digit; the decimal key is named "Decimal point".
const tapAmount = (amount) => {
  for (const ch of String(amount)) {
    fireEvent.click(screen.getByRole('button', { name: ch === '.' ? 'Decimal point' : ch }))
  }
}

describe('OpenChallengeModal (create-only; taking moved to the unified lookup, spec 037)', () => {
  beforeEach(() => { createOpenChallenge.mockReset() })

  it('renders nothing when closed', () => {
    const { container } = render(<OpenChallengeModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('is create-only — no mode tabs/pills at all, just the create form (testing feedback)', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByLabelText(/what's the wager/i, { selector: 'input' })).toBeInTheDocument()
  })

  it('Maker: gates create until description + stake, then shows the generated code + a scannable QR', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 9n, txHash: '0xabc' })
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const createBtn = screen.getByRole('button', { name: /lock in/i })
    expect(createBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    // Description alone isn't enough — a positive stake is still required (FR-016).
    expect(createBtn).toBeDisabled()
    tapAmount('10')
    expect(createBtn).toBeEnabled()
    fireEvent.click(createBtn)
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
    expect(screen.getByText(/Save this code now/i)).toBeInTheDocument()
    // A scannable QR (deep link into the unified take flow) is shown alongside the code.
    expect(screen.getByText(/scan to take/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/QR code to take this challenge/i)).toBeInTheDocument()
    // Testing feedback: the created view hides the wager id and copies via an icon button.
    expect(screen.queryByText(/#9/)).toBeNull()
    const copyBtn = screen.getByRole('button', { name: /copy code/i })
    expect(copyBtn).toBeInTheDocument()
    expect(copyBtn).not.toHaveTextContent(/copy/i) // icon-only — the name comes from aria-label
  })

  it('Maker: passes the chosen accept/resolve deadlines (seconds) to createOpenChallenge', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 1n, txHash: '0x1' })
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    tapAmount('10')
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }))
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    const form = createOpenChallenge.mock.calls[0][0]
    expect(typeof form.acceptDeadline).toBe('number')
    expect(typeof form.resolveDeadline).toBe('number')
    expect(form.resolveDeadline).toBeGreaterThan(form.acceptDeadline)
    expect(form.acceptDeadline).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  // The editable deadline timeline (draggable dots + tap-to-set modal) was removed
  // in the round-4 home redesign to reach the no-scroll goal; deadlines now submit
  // from fixed sensible defaults (still asserted by the "passes the chosen
  // accept/resolve deadlines" test above). The former timeline UI tests were
  // dropped along with the control.

  it('Maker: the stake is entered on the payments-style number pad (hero amount + USDC token, spec 052)', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    // Starts in the zero state ($0) — the amount is the hero, driven by the pad.
    const hero = screen.getByTestId('amount-keypad-hero')
    expect(hero).toHaveTextContent('$0')
    tapAmount('12.5')
    expect(hero).toHaveTextContent('$12.5')
    // A 3rd fractional digit is ignored (cents precision).
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    expect(hero).toHaveTextContent('$12.5')
    // Backspace removes the right-most character.
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(hero).toHaveTextContent('$12.')
    // The stake token (USDC) is shown compactly beside the amount.
    expect(screen.getByText('USDC')).toBeInTheDocument()
  })

  it('deep-link helpers round-trip the code through a take URL', () => {
    const url = buildTakeChallengeUrl('river tiger kite zoo')
    expect(url).toMatch(/\/app\?oc=take&code=/)
    const { search } = new URL(url)
    expect(parseTakeChallengeParams(search)).toBe('river tiger kite zoo')
    expect(parseTakeChallengeParams('?foo=bar')).toBeNull()
  })
})

describe('OpenChallengeModal explainers behind info icons (spec 039 US1)', () => {
  beforeEach(() => { createOpenChallenge.mockReset() })

  it('hides the static field explainers by default and reveals each from its icon, one at a time', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.queryByText(/the taker takes the opposite/i)).toBeNull()
    expect(screen.queryByText(/single-party self-resolution/i)).toBeNull()

    // The stake caption + its InfoTip were removed to conserve space (spec 052 feedback);
    // the remaining field explainers still reveal one at a time from their icons.
    fireEvent.click(screen.getByRole('button', { name: "About: What's the wager?" }))
    expect(screen.getByRole('note')).toHaveTextContent(/the taker takes the opposite/i)

    fireEvent.click(screen.getByRole('button', { name: 'About: How is it resolved?' }))
    expect(screen.getByRole('note')).toHaveTextContent(/single-party self-resolution/i)
  })

  it('keeps dynamic text inline on the success screen: security warning visible, backup explainer behind its icon', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 9n, txHash: '0xabc' })
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    tapAmount('10')
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }))
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    await screen.findByText('river tiger kite zoo')

    // The four-word-code risk warning is a security disclosure — always inline (FR-005).
    expect(screen.getByText(/brute-force/i)).toBeInTheDocument()
    expect(screen.getByText(/Save this code now/i)).toBeInTheDocument()

    // The backup explainer sits behind an icon and shows the current-state variant (FR-009).
    expect(screen.queryByText(/encrypted copy of this code/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'About: Encrypted backup' }))
    expect(screen.getByRole('note')).toHaveTextContent(/encrypted copy/i)
  })
})

// ---------------------------------------------------------------------------
// Spec 041 foundational changes: oracle-aware revert translation and the sealed
// `oracle` metadata block (the claimant reads the bet even with live data down).
// ---------------------------------------------------------------------------
import { translateOpenCreateRevert } from '../../hooks/useOpenChallengeCreate'
import { deriveFromCode } from '../../utils/claimCode/deriveFromCode.js'
import { generateCode } from '../../utils/claimCode/wordlist.js'
import { encryptEnvelopeCode, decryptEnvelopeCode } from '../../utils/crypto/envelopeEncryption.js'

describe('Oracle open challenges — create-hook foundations (spec 041)', () => {
  it('translates the oracle-linkage reverts to actionable messages (FR-008)', () => {
    expect(translateOpenCreateRevert('ConditionAlreadyResolved()')).toMatch(/already resolved/i)
    expect(translateOpenCreateRevert('PolymarketRequired()')).toMatch(/pick a polymarket market/i)
    expect(translateOpenCreateRevert('PolymarketDisallowed()')).toMatch(/oracle-settled/i)
    expect(translateOpenCreateRevert('AdapterNotSet()')).toMatch(/available on this network/i)
    // Existing translations are untouched.
    expect(translateOpenCreateRevert('InsufficientMembershipTier()')).toMatch(/silver/i)
  })

  it('a sealed payload with an oracle block round-trips through the code envelope (D4/FR-014)', () => {
    const code = generateCode()
    const { symKey } = deriveFromCode(code)
    const plaintext = {
      description: '"Will ETH flip BTC?" — creator takes Yes',
      createdAt: '2026-07-05T00:00:00.000Z',
      oracle: {
        source: 'polymarket',
        conditionId: '0xabc123',
        question: 'Will ETH flip BTC?',
        outcomes: ['Yes', 'No'],
        creatorSide: 0,
        endDate: '2026-12-31T00:00:00Z',
        slug: 'will-eth-flip-btc',
      },
    }
    const envelope = encryptEnvelopeCode(plaintext, symKey)
    const { symKey: rederived } = deriveFromCode(code)
    expect(decryptEnvelopeCode(envelope, rederived)).toEqual(plaintext)
  })

  it('legacy payloads without an oracle block still round-trip unchanged (FR-018 of 024)', () => {
    const code = generateCode()
    const { symKey } = deriveFromCode(code)
    const plaintext = { description: 'Plain user-defined challenge', createdAt: undefined }
    const envelope = encryptEnvelopeCode(plaintext, symKey)
    const recovered = decryptEnvelopeCode(envelope, symKey)
    expect(recovered.description).toBe('Plain user-defined challenge')
    expect(recovered.oracle).toBeUndefined()
  })
})
