import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DeadlineTimeline from '../components/fairwins/DeadlineTimeline'

const NOW = Date.UTC(2026, 5, 1, 0, 0)
const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS

function twoMilestones() {
  return [
    {
      key: 'accept', label: 'Open for acceptance until', tileHead: 'Open until',
      value: NOW + 2 * DAY_MS, min: NOW + HOUR_MS, max: NOW + 30 * DAY_MS,
      editable: true, hint: 'accept hint',
      segmentColor: 'var(--timeline-accept)', dotClass: 'is-accept', tileClass: 'is-accept',
    },
    {
      key: 'resolve', label: 'Must be resolved by', tileHead: 'Resolve by',
      value: NOW + 9 * DAY_MS, min: NOW + 2 * DAY_MS + HOUR_MS, max: NOW + 92 * DAY_MS,
      editable: true, hint: 'resolve hint',
      segmentColor: 'var(--timeline-active)', dotClass: 'is-resolve', tileClass: 'is-resolve',
    },
  ]
}

function threeMilestones() {
  const endMin = NOW + HOUR_MS
  const endMax = NOW + 21 * DAY_MS
  return [
    {
      key: 'accept', label: 'Accept by', tileHead: 'Accept by',
      value: NOW + 1.5 * DAY_MS, min: endMin, max: endMax, editable: false,
      segmentColor: 'var(--timeline-accept)', dotClass: 'is-accept', tileClass: 'is-accept',
    },
    {
      key: 'end', label: 'End Date & Time', tileHead: 'Ends',
      value: NOW + 3 * DAY_MS, min: endMin, max: endMax, editable: true,
      segmentColor: 'var(--timeline-active)', dotClass: 'is-end', tileClass: 'is-ends',
    },
    {
      key: 'resolve', label: 'Resolve by', tileHead: 'Resolve by',
      value: NOW + 5 * DAY_MS, min: endMin, max: endMax + 2 * DAY_MS, editable: false,
      segmentColor: 'var(--timeline-resolve)', dotClass: 'is-resolve', tileClass: 'is-resolve',
    },
  ]
}

// Pointer-drag math reads the track's bounding rect; jsdom returns all zeros
// by default, so give it a stable 200px-wide box for deterministic math.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, y: 0, left: 0, right: 200, top: 0, bottom: 10, width: 200, height: 10, toJSON() {},
  }))
})

describe('DeadlineTimeline (spec 038 US1)', () => {
  it('renders one draggable slider per editable milestone and none for read-only ones', () => {
    render(<DeadlineTimeline milestones={threeMilestones()} onChange={() => {}} idPrefix="fm" />)
    expect(screen.getAllByRole('slider')).toHaveLength(1)
    expect(screen.getByRole('slider', { name: 'End Date & Time' })).toBeInTheDocument()
  })

  it('renders no native datetime-local field and no "tap to type a date" link (FR-005)', () => {
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={() => {}} idPrefix="oc" />)
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.queryByText(/tap to type a date/i)).toBeNull()
  })

  it('renders a read-only tile (not a button) for non-editable milestones', () => {
    render(<DeadlineTimeline milestones={threeMilestones()} onChange={() => {}} idPrefix="fm" />)
    const acceptTile = document.getElementById('fm-accept-tile')
    expect(acceptTile.tagName).toBe('DIV')
    const endTile = document.getElementById('fm-end-tile')
    expect(endTile.tagName).toBe('BUTTON')
  })

  it('exposes editable milestone bounds via ARIA slider attributes', () => {
    const milestones = twoMilestones()
    render(<DeadlineTimeline milestones={milestones} onChange={() => {}} idPrefix="oc" />)
    const dot = screen.getByRole('slider', { name: 'Open for acceptance until' })
    expect(dot).toHaveAttribute('aria-valuemin', String(milestones[0].min))
    expect(dot).toHaveAttribute('aria-valuemax', String(milestones[0].max))
    expect(dot).toHaveAttribute('aria-valuenow', String(milestones[0].value))
  })

  it('drags a dot to a new time by pointer position along the track', () => {
    const onChange = vi.fn()
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={onChange} idPrefix="oc" />)
    const dot = screen.getByRole('slider', { name: 'Open for acceptance until' })
    fireEvent.pointerDown(dot, { pointerId: 1, clientX: 100 })
    expect(onChange).toHaveBeenCalled()
    const [key, ms] = onChange.mock.calls[0]
    expect(key).toBe('accept')
    // 100/200 = 50% across the track's dynamic domain — roughly the midpoint
    // between the track's start and the resolve milestone's current value.
    expect(ms).toBeGreaterThan(twoMilestones()[0].min)
    expect(ms).toBeLessThan(twoMilestones()[1].value)
  })

  it('clamps a drag to the milestone\'s own min/max, not just the track domain', () => {
    const onChange = vi.fn()
    // A tight max on the first milestone, well inside the track's full domain
    // (which runs out to the second milestone's current value) — dragging to
    // the far right of the track must still respect the tight max.
    const milestones = [
      { ...twoMilestones()[0], max: NOW + 2.5 * DAY_MS },
      twoMilestones()[1],
    ]
    render(<DeadlineTimeline milestones={milestones} onChange={onChange} idPrefix="oc" />)
    const dot = screen.getByRole('slider', { name: 'Open for acceptance until' })
    fireEvent.pointerDown(dot, { pointerId: 1, clientX: 10000 })
    const [, ms] = onChange.mock.calls[0]
    expect(ms).toBeLessThanOrEqual(milestones[0].max)
  })

  it('dragging the first of two editable milestones drags the second by the same delta (legacy gap behavior)', () => {
    const onChange = vi.fn()
    const milestones = twoMilestones()
    render(<DeadlineTimeline milestones={milestones} onChange={onChange} idPrefix="oc" />)
    const dot = screen.getByRole('slider', { name: 'Open for acceptance until' })
    fireEvent.pointerDown(dot, { pointerId: 1, clientX: 150 })
    const calls = Object.fromEntries(onChange.mock.calls)
    expect(calls).toHaveProperty('accept')
    expect(calls).toHaveProperty('resolve')
    const originalGap = milestones[1].value - milestones[0].value
    expect(calls.resolve - calls.accept).toBe(originalGap)
  })

  it('steps an editable dot by 15 minutes on ArrowRight and 1 hour with Shift', () => {
    const onChange = vi.fn()
    const milestones = twoMilestones()
    render(<DeadlineTimeline milestones={milestones} onChange={onChange} idPrefix="oc" />)
    const dot = screen.getByRole('slider', { name: 'Open for acceptance until' })

    fireEvent.keyDown(dot, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('accept', milestones[0].value + 15 * 60000)

    onChange.mockClear()
    fireEvent.keyDown(dot, { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenCalledWith('accept', milestones[0].value - HOUR_MS)
  })

  it('disabled: dots are not focusable and clicking a tile does not open the modal', () => {
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={() => {}} disabled idPrefix="oc" />)
    const dot = document.getElementById('oc-accept-slider')
    expect(dot).not.toHaveAttribute('tabindex')
    fireEvent.click(screen.getByRole('button', { name: /open until:/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tapping an editable tile opens the SetTimeModal for that milestone', () => {
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={() => {}} idPrefix="oc" />)
    fireEvent.click(screen.getByRole('button', { name: /resolve by:/i }))
    const dialog = screen.getByRole('dialog', { name: /set date and time/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Must be resolved by')).toBeInTheDocument()
  })

  it('confirming the modal commits the value through onChange and closes it', () => {
    const onChange = vi.fn()
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={onChange} idPrefix="oc" />)
    fireEvent.click(screen.getByRole('button', { name: /open until:/i }))
    const dialog = screen.getByRole('dialog', { name: /set date and time/i })
    const input = within(dialog).getByLabelText(/open for acceptance until/i)
    fireEvent.change(input, { target: { value: '2026-06-10T12:00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set' }))
    expect(onChange).toHaveBeenCalledWith('accept', expect.any(Number))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('DeadlineTimeline milestone hints behind info icons (spec 039 US1)', () => {
  it('does not render milestone hint text inline', () => {
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={() => {}} idPrefix="oc" />)
    expect(screen.queryByText('accept hint')).not.toBeInTheDocument()
    expect(screen.queryByText('resolve hint')).not.toBeInTheDocument()
    expect(document.querySelector('.dt-hint')).toBeNull()
  })

  it('reveals each hint from its tile info icon, one bubble at a time', () => {
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={() => {}} idPrefix="oc" />)
    fireEvent.click(screen.getByRole('button', { name: 'About: Open until' }))
    expect(screen.getByRole('note')).toHaveTextContent('accept hint')

    fireEvent.click(screen.getByRole('button', { name: 'About: Resolve by' }))
    const notes = screen.getAllByRole('note')
    expect(notes).toHaveLength(1)
    expect(notes[0]).toHaveTextContent('resolve hint')
  })

  it('opening a hint does not open the set-time modal', () => {
    render(<DeadlineTimeline milestones={twoMilestones()} onChange={() => {}} idPrefix="oc" />)
    fireEvent.click(screen.getByRole('button', { name: 'About: Open until' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the computed summary line inline and renders no icon for hintless milestones', () => {
    render(
      <DeadlineTimeline
        milestones={threeMilestones()}
        onChange={() => {}}
        idPrefix="fm"
        summary="Open 2 days for a taker"
      />
    )
    expect(screen.getByText('Open 2 days for a taker')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^About:/ })).not.toBeInTheDocument()
  })
})
