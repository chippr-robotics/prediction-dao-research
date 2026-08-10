import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

// Control the resolver hook; stub the panels + router so we test the modal's routing/messaging only.
const { mockState, submit, reset } = vi.hoisted(() => ({
  mockState: { current: null },
  submit: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('../../../hooks/useUnifiedLookup', () => ({ useUnifiedLookup: () => mockState.current }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../TakeChallengePanel', () => ({ default: ({ code, match }) => <div data-testid="take-panel">take:{code}:{String(match?.wagerId)}</div> }))
vi.mock('../JoinPoolPanel', () => ({ default: ({ summary }) => <div data-testid="join-panel">join:{summary?.address}</div> }))

import UnifiedLookupModal from '../UnifiedLookupModal'

function setState(s) { mockState.current = { status: 'idle', result: null, submit, reset, ...s } }

// The phrase is entered one word per box (spec 037 feedback), so drive all four.
const wordBoxes = () => [0, 1, 2, 3].map((i) => screen.getByRole('textbox', { name: `Word ${i + 1}` }))
const typePhrase = (phrase) => {
  const boxes = wordBoxes()
  phrase.split(' ').forEach((w, i) => fireEvent.change(boxes[i], { target: { value: w } }))
}

describe('UnifiedLookupModal (spec 037, US1)', () => {
  beforeEach(() => { submit.mockReset(); reset.mockReset(); setState({}) })

  it('renders nothing when closed', () => {
    setState({})
    const { container } = render(<UnifiedLookupModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows one phrase entry (no type selector) and submits the phrase without any signature', () => {
    setState({})
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    // One "Four-word phrase" entry, taken a word at a time (four boxes, not a free-text field).
    const boxes = wordBoxes()
    expect(screen.getByLabelText(/four-word phrase/i, { selector: '[role="group"]' })).toContainElement(boxes[0])
    typePhrase('crystal orbit harbor velvet')
    fireEvent.click(screen.getByRole('button', { name: /^find$/i }))
    expect(submit).toHaveBeenCalledWith('crystal orbit harbor velvet')
    // No "take a challenge" / "join a pool" type tabs — a single entry point (FR-001/002).
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('accepts a whole phrase dropped into one box (paste, autofill, voice)', () => {
    setState({})
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    // A phrase can arrive in a single box with no paste event to intercept; every word must survive.
    fireEvent.change(wordBoxes()[0], { target: { value: 'crystal orbit harbor velvet' } })
    fireEvent.click(screen.getByRole('button', { name: /^find$/i }))
    expect(submit).toHaveBeenCalledWith('crystal orbit harbor velvet')
  })

  it('will not look up a phrase that is not four wordlist words', () => {
    setState({})
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    const find = () => screen.getByRole('button', { name: /^find$/i })
    expect(find()).toBeDisabled() // nothing typed yet

    typePhrase('crystal orbit harbor')
    expect(find()).toBeDisabled() // only three words

    fireEvent.change(wordBoxes()[3], { target: { value: 'zzzz' } })
    expect(find()).toBeDisabled() // fourth word is not in the wordlist
    fireEvent.click(find())
    expect(submit).not.toHaveBeenCalled()

    fireEvent.change(wordBoxes()[3], { target: { value: 'velvet' } })
    expect(find()).toBeEnabled()
  })

  it('offers an example phrase the form will actually accept', () => {
    setState({})
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    const example = screen.getByText(/^e\.g\. /i).textContent.replace(/^e\.g\. /i, '').trim()
    typePhrase(example)
    expect(screen.getByRole('button', { name: /^find$/i })).toBeEnabled()
  })

  it('moves the lookup guidance behind an info icon (spec 039 US2)', () => {
    setState({})
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    expect(screen.queryByText(/whatever the words point to/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About: Four-word phrase' }))
    expect(screen.getByRole('note')).toHaveTextContent(/whatever the words point to/i)
  })

  it('routes a challenge result to the take panel with the normalized code', () => {
    setState({ status: 'result', result: { kind: 'challenge', match: { wagerId: 9n }, actionable: true } })
    render(<UnifiedLookupModal isOpen onClose={() => {}} initialPhrase="Abandon-Ability Able  About" />)
    expect(screen.getByTestId('take-panel')).toHaveTextContent('take:abandon ability able about:9')
  })

  it('routes a pool result to the join panel', () => {
    setState({ status: 'result', result: { kind: 'pool', match: { address: '0xpool' }, actionable: true } })
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    expect(screen.getByTestId('join-panel')).toHaveTextContent('join:0xpool')
  })

  it('distinguishes "no match" from "couldn\'t check"', () => {
    setState({ status: 'result', result: { kind: 'none' } })
    const { rerender } = render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    expect(screen.getByText(/no pool or challenge matches/i)).toBeInTheDocument()

    setState({ status: 'result', result: { kind: 'lookup-failed', sources: ['pool'] } })
    rerender(<UnifiedLookupModal isOpen onClose={() => {}} />)
    expect(screen.getByText(/couldn’t check right now/i)).toBeInTheDocument()
  })

  it('offers a chooser on collision and opens the picked side', () => {
    setState({ status: 'result', result: { kind: 'collision', challenge: { wagerId: 1n }, pool: { address: '0xp' } } })
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    expect(screen.getByText(/match both a challenge and a pool/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /open the pool/i }))
    expect(screen.getByTestId('join-panel')).toHaveTextContent('join:0xp')
  })

  it('shows a format hint for a malformed phrase', () => {
    setState({ status: 'result', result: { kind: 'format-error', message: 'Enter exactly four words.' } })
    render(<UnifiedLookupModal isOpen onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/exactly four words/i)
  })
})
