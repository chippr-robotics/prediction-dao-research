import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import DeadlineTimeline from '../components/fairwins/DeadlineTimeline'

// Timeline colorway (spec 038 US3, FR-007/FR-008): the deadline timeline must
// draw its segments/dots/tiles from the brand-palette --timeline-* tokens
// (theme.css) and never the legacy amber (#E8910C). jsdom cannot compute
// resolved custom-property colors for axe-core's color-contrast rule (a known
// jsdom limitation — see the "Not implemented: window.getComputedStyle"
// warnings other axe tests in this suite already emit), so real pixel
// contrast is out of reach here; that's covered by manual/visual QA per
// quickstart.md. What IS verifiable in jsdom: no amber literal reaches the
// rendered output, the brand tokens are referenced, and axe reports no other
// violations (structure/labelling) in either theme.

const NOW = Date.UTC(2026, 5, 1, 0, 0)
const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS

function milestones() {
  return [
    {
      key: 'accept', label: 'Open for acceptance until', tileHead: 'Open until',
      value: NOW + 2 * DAY_MS, min: NOW + HOUR_MS, max: NOW + 30 * DAY_MS,
      editable: true, segmentColor: 'var(--timeline-accept)', dotClass: 'is-accept', tileClass: 'is-accept',
    },
    {
      key: 'resolve', label: 'Must be resolved by', tileHead: 'Resolve by',
      value: NOW + 9 * DAY_MS, min: NOW + 2 * DAY_MS + HOUR_MS, max: NOW + 92 * DAY_MS,
      editable: true, segmentColor: 'var(--timeline-active)', dotClass: 'is-resolve', tileClass: 'is-resolve',
    },
  ]
}

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, y: 0, left: 0, right: 200, top: 0, bottom: 10, width: 200, height: 10, toJSON() {},
  }))
  document.documentElement.classList.add('platform-fairwins')
})

afterEach(() => {
  document.documentElement.classList.remove('platform-fairwins', 'theme-light', 'theme-dark')
})

describe('Deadline timeline colorway (spec 038 US3)', () => {
  it('never renders the legacy amber literal (#E8910C) in the track gradient', () => {
    const { container } = render(<DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" />)
    const track = container.querySelector('.fm-timeline-track')
    expect(track.getAttribute('style')).not.toMatch(/E8910C/i)
  })

  it('the track gradient references the brand-palette --timeline-* tokens', () => {
    const { container } = render(<DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" />)
    const style = container.querySelector('.fm-timeline-track').getAttribute('style')
    expect(style).toMatch(/var\(--timeline-accept\)/)
    expect(style).toMatch(/var\(--timeline-active\)/)
  })

  it('has no accessibility violations in light theme', async () => {
    document.documentElement.classList.add('theme-light')
    const { container } = render(<DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations in dark theme', async () => {
    document.documentElement.classList.add('theme-dark')
    const { container } = render(<DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('milestones stay distinguishable by non-color cues (label + position), not color alone', () => {
    const { container } = render(<DeadlineTimeline milestones={milestones()} onChange={() => {}} idPrefix="oc" />)
    const tiles = container.querySelectorAll('.fm-stat-tile')
    const headings = Array.from(tiles).map((t) => t.querySelector('.fm-stat-head').textContent)
    expect(new Set(headings).size).toBe(headings.length) // every phase has a distinct text label
  })
})
