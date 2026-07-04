import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// Mock the create flow so the modal renders deterministically (no chain/IPFS).
const createOpenChallenge = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})

import OpenChallengeModal from '../../components/fairwins/OpenChallengeModal'
import { buildTakeChallengeUrl, parseTakeChallengeParams } from '../../utils/claimCode/deepLink.js'

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
    const createBtn = screen.getByRole('button', { name: /create & generate code/i })
    expect(createBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
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
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    const form = createOpenChallenge.mock.calls[0][0]
    expect(typeof form.acceptDeadline).toBe('number')
    expect(typeof form.resolveDeadline).toBe('number')
    expect(form.resolveDeadline).toBeGreaterThan(form.acceptDeadline)
    expect(form.acceptDeadline).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('Maker: deadlines use the shared timeline element — draggable dots plus tap-to-set modal', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const acceptDot = screen.getByRole('slider', { name: /open for acceptance until/i })
    const resolveDot = screen.getByRole('slider', { name: /must be resolved by/i })
    expect(acceptDot).toBeInTheDocument()
    expect(resolveDot).toBeInTheDocument()
    // No native picker field or "type a date" link anywhere in the form (FR-005).
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.queryByText(/tap to type a date/i)).toBeNull()

    // Stepping the accept dot's keyboard control drags the resolve deadline
    // with it, keeping the original gap (legacy slider behavior, preserved).
    const before = resolveDot.getAttribute('aria-valuenow')
    fireEvent.keyDown(acceptDot, { key: 'ArrowRight', shiftKey: true })
    expect(Number(resolveDot.getAttribute('aria-valuenow'))).toBe(Number(before) + 60 * 60 * 1000)

    // Tapping a tile opens the shared set-time modal, not an inline input.
    fireEvent.click(screen.getByRole('button', { name: /resolve by:/i }))
    expect(screen.getByRole('dialog', { name: /set date and time/i })).toBeInTheDocument()
  })

  it('Maker: the set-time modal rejects a resolve time outside the allowed range', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    const createBtn = screen.getByRole('button', { name: /create & generate code/i })
    expect(createBtn).toBeEnabled()

    // Tap the Resolve-by tile and try to type a time before the allowed window.
    fireEvent.click(screen.getByRole('button', { name: /resolve by:/i }))
    const dialog = screen.getByRole('dialog', { name: /set date and time/i })
    const input = within(dialog).getByLabelText(/must be resolved by/i)
    fireEvent.change(input, { target: { value: '2000-01-01T00:00' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/pick a time between/i)
    expect(within(dialog).getByRole('button', { name: 'Set' })).toBeDisabled()
    // Out-of-range input never reaches form state, so create stays enabled.
    expect(createBtn).toBeEnabled()
  })

  it('Maker: the USDC stake entry is formatted as money ($ prefix, interactive token control, 2-decimal blur)', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const stake = screen.getByLabelText(/stake — each side/i, { selector: 'input' })
    expect(stake).toHaveValue(10) // default 10.00
    fireEvent.change(stake, { target: { value: '12.5' } })
    fireEvent.blur(stake)
    expect(stake.value).toBe('12.50')
    // Money chrome around the input.
    expect(screen.getByText('$')).toBeInTheDocument()
    // Stake token control is always interactive (spec 038 FR-011), even
    // though open challenges only support USDC on this network today.
    const tokenControl = screen.getByLabelText(/^stake token$/i)
    expect(tokenControl.tagName).toBe('SELECT')
    expect(tokenControl).not.toBeDisabled()
    expect(tokenControl.value).toBe('USDC')
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
    expect(screen.queryByText(/only USDC is supported/i)).toBeNull()
    expect(screen.queryByText(/single-party self-resolution/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: "About: What's the wager?" }))
    expect(screen.getByRole('note')).toHaveTextContent(/the taker takes the opposite/i)

    fireEvent.click(screen.getByRole('button', { name: 'About: Stake — each side' }))
    expect(screen.getAllByRole('note')).toHaveLength(1)
    expect(screen.getByRole('note')).toHaveTextContent(/only USDC is supported/i)

    fireEvent.click(screen.getByRole('button', { name: 'About: How is it resolved?' }))
    expect(screen.getByRole('note')).toHaveTextContent(/single-party self-resolution/i)
  })

  it('keeps dynamic text inline on the success screen: security warning visible, backup explainer behind its icon', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 9n, txHash: '0xabc' })
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))
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
