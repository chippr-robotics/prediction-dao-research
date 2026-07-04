import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import DeadlineTimeline from '../components/fairwins/DeadlineTimeline'

const NOW = Date.UTC(2026, 5, 1, 0, 0)
const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS

function milestones() {
  return [
    {
      key: 'accept', label: 'Open for acceptance until', tileHead: 'Open until',
      value: NOW + 2 * DAY_MS, min: NOW + HOUR_MS, max: NOW + 30 * DAY_MS,
      editable: true, hint: 'After this, the challenge can no longer be taken.',
      segmentColor: 'var(--timeline-accept)', dotClass: 'is-accept', tileClass: 'is-accept',
    },
    {
      key: 'resolve', label: 'Must be resolved by', tileHead: 'Resolve by',
      value: NOW + 9 * DAY_MS, min: NOW + 2 * DAY_MS + HOUR_MS, max: NOW + 92 * DAY_MS,
      editable: true, hint: 'The outcome must be submitted before this time.',
      segmentColor: 'var(--timeline-active)', dotClass: 'is-resolve', tileClass: 'is-resolve',
    },
  ]
}

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, y: 0, left: 0, right: 200, top: 0, bottom: 10, width: 200, height: 10, toJSON() {},
  }))
})

describe('DeadlineTimeline + SetTimeModal accessibility (spec 038 US1, FR-016)', () => {
  it('the closed timeline has no accessibility violations', async () => {
    const { container } = render(
      <DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" summary="Open 2 days" />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('the timeline with the set-time modal open has no accessibility violations', async () => {
    const { container } = render(
      <DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" summary="Open 2 days" />
    )
    fireEvent.click(screen.getByRole('button', { name: /resolve by:/i }))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('the timeline with a milestone hint bubble open has no accessibility violations (spec 039)', async () => {
    const { container } = render(
      <DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" summary="Open 2 days" />
    )
    fireEvent.click(screen.getByRole('button', { name: 'About: Open until' }))
    expect(screen.getByRole('note')).toHaveTextContent(/no longer be taken/i)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('every editable milestone dot is reachable and operable by keyboard alone', () => {
    render(<DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" />)
    const dots = screen.getAllByRole('slider')
    dots.forEach((dot) => {
      expect(dot).toHaveAttribute('tabindex', '0')
      dot.focus()
      expect(dot).toHaveFocus()
    })
  })
})
