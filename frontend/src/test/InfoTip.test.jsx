import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InfoTip from '../components/ui/InfoTip'

// Contract: specs/039-wager-info-tooltips/contracts/infotip-component.md (B1–B8)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('InfoTip', () => {
  it('renders an icon-only trigger with an accessible name and no visible bubble (B8)', () => {
    render(<InfoTip label="About: Stake">Enter the amount in USD.</InfoTip>)
    const btn = screen.getByRole('button', { name: 'About: Stake' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter the amount in USD.')).not.toBeInTheDocument()
  })

  it('opens the bubble on click and closes on a second click (B1, B2)', async () => {
    const user = userEvent.setup()
    render(<InfoTip label="About: Stake">Enter the amount in USD.</InfoTip>)
    const btn = screen.getByRole('button', { name: 'About: Stake' })

    await user.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const bubble = screen.getByRole('note')
    expect(bubble).toHaveTextContent('Enter the amount in USD.')
    expect(btn.getAttribute('aria-controls')).toBe(bubble.parentElement.id)

    await user.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('opens with Enter and Space from the keyboard (B1)', async () => {
    const user = userEvent.setup()
    render(<InfoTip label="About: Stake">Stake help.</InfoTip>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'About: Stake' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('note')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    await user.keyboard(' ')
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('places the bubble content in an aria-live region so it is announced (B1)', async () => {
    const user = userEvent.setup()
    render(<InfoTip label="About: Stake">Stake help.</InfoTip>)
    await user.click(screen.getByRole('button', { name: 'About: Stake' }))
    const bubble = screen.getByRole('note')
    expect(bubble.parentElement).toHaveAttribute('aria-live', 'polite')
  })

  it('closes on mousedown outside without stealing focus (B3)', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <InfoTip label="About: Stake">Stake help.</InfoTip>
        <input aria-label="Other field" />
      </div>
    )
    await user.click(screen.getByRole('button', { name: 'About: Stake' }))
    expect(screen.getByRole('note')).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: 'Other field' })
    input.focus()
    fireEvent.mouseDown(input)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('closes on Escape and returns focus to the trigger (B4)', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <InfoTip label="About: Stake">Stake help.</InfoTip>
        <input aria-label="Other field" />
      </div>
    )
    const btn = screen.getByRole('button', { name: 'About: Stake' })
    await user.click(btn)
    screen.getByRole('textbox', { name: 'Other field' }).focus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(btn).toHaveFocus()
  })

  it('swallows the Escape that closes the bubble so an enclosing modal stays open (B4)', async () => {
    const user = userEvent.setup()
    const modalEscape = vi.fn()
    document.addEventListener('keydown', modalEscape)
    try {
      render(<InfoTip label="About: Stake">Stake help.</InfoTip>)
      await user.click(screen.getByRole('button', { name: 'About: Stake' }))

      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(screen.queryByRole('note')).not.toBeInTheDocument()
      expect(modalEscape).not.toHaveBeenCalled()

      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(modalEscape).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', modalEscape)
    }
  })

  it('keeps at most one bubble open across instances (B5)', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <InfoTip label="About: Stake">Stake help.</InfoTip>
        <InfoTip label="About: Deadline">Deadline help.</InfoTip>
      </div>
    )
    await user.click(screen.getByRole('button', { name: 'About: Stake' }))
    expect(screen.getByRole('note')).toHaveTextContent('Stake help.')

    await user.click(screen.getByRole('button', { name: 'About: Deadline' }))
    const bubbles = screen.getAllByRole('note')
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]).toHaveTextContent('Deadline help.')
  })

  it('cleans up its document listeners on unmount (B6)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<InfoTip label="About: Stake">Stake help.</InfoTip>)
    await user.click(screen.getByRole('button', { name: 'About: Stake' }))
    unmount()
    // No open bubble left behind and no listener errors on further events.
    expect(document.querySelector('.infotip-bubble')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(document.body)
  })

  it('shows current-state content at open time (FR-009)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<InfoTip label="About: Resolution">Either side submits.</InfoTip>)
    await user.click(screen.getByRole('button', { name: 'About: Resolution' }))
    expect(screen.getByRole('note')).toHaveTextContent('Either side submits.')

    rerender(<InfoTip label="About: Resolution">An arbitrator decides.</InfoTip>)
    expect(screen.getByRole('note')).toHaveTextContent('An arbitrator decides.')
  })

  it('shifts the bubble back into the viewport when it would overflow (B7)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 400, configurable: true })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300, height: 80, top: 100, bottom: 180, left: 200, right: 500,
      x: 200, y: 100, toJSON: () => {},
    })
    render(<InfoTip label="About: Stake">Stake help.</InfoTip>)
    await user.click(screen.getByRole('button', { name: 'About: Stake' }))

    const bubble = screen.getByRole('note')
    // right edge (500) must be pulled inside 400 - 8 gutter → shift of -108px
    expect(bubble.style.getPropertyValue('--infotip-shift')).toBe('-108px')
  })
})
