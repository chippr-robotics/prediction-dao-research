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
    expect(screen.getByLabelText(/what's the wager/i)).toBeInTheDocument()
  })

  it('Maker: gates create until description + stake, then shows the generated code + a scannable QR', async () => {
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
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Will it rain?' } })
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    const form = createOpenChallenge.mock.calls[0][0]
    expect(typeof form.acceptDeadline).toBe('number')
    expect(typeof form.resolveDeadline).toBe('number')
    expect(form.resolveDeadline).toBeGreaterThan(form.acceptDeadline)
    expect(form.acceptDeadline).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('Maker: deadlines use the timeline element — sliders plus tap-to-type manual entry', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    // Slide the acceptance deadline out to 72h — the resolve deadline keeps its gap.
    const acceptSlider = screen.getByLabelText(/open for acceptance until/i)
    const resolveSlider = screen.getByLabelText(/must be resolved by/i)
    expect(acceptSlider).toHaveAttribute('type', 'range')
    expect(resolveSlider).toHaveAttribute('type', 'range')
    fireEvent.change(acceptSlider, { target: { value: '72' } })
    expect(Number(acceptSlider.value)).toBe(72)
    expect(Number(resolveSlider.value)).toBe(7 * 24)

    // No manual input until a tile is tapped.
    expect(screen.queryByLabelText(/exact date & time/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /resolve by/i }))
    expect(screen.getByLabelText(/exact date & time/i)).toBeInTheDocument()
  })

  it('Maker: disables create when the resolve time is not after the accept time', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/what's the wager/i), { target: { value: 'Will it rain?' } })
    const createBtn = screen.getByRole('button', { name: /create & generate code/i })
    expect(createBtn).toBeEnabled()
    // Tap the Resolve-by tile to type an exact (past) time manually.
    fireEvent.click(screen.getByRole('button', { name: /resolve by/i }))
    fireEvent.change(screen.getByLabelText(/exact date & time/i), { target: { value: '2000-01-01T00:00' } })
    expect(createBtn).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/future/i)
  })

  it('Maker: the USDC stake entry is formatted as money ($ prefix, 2-decimal blur)', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    const stake = screen.getByLabelText(/stake — each side/i)
    expect(stake).toHaveValue(10) // default 10.00
    fireEvent.change(stake, { target: { value: '12.5' } })
    fireEvent.blur(stake)
    expect(stake.value).toBe('12.50')
    // Money chrome around the input.
    expect(screen.getByText('$')).toBeInTheDocument()
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
