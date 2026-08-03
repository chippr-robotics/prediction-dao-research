/**
 * Spec 051 T034 — formatRelativeTime null-guard (US4, FR-006): a missing,
 * zero, or invalid timestamp must never render as time-since-epoch
 * ("20645d ago"); callers show an explicit "date unavailable" state on null.
 */
import { describe, it, expect } from 'vitest'
import { formatRelativeTime, dayGroupLabel, weekGroupLabel } from '../../lib/account/format'

const NOW = Date.UTC(2026, 6, 11)

describe('formatRelativeTime (FR-006)', () => {
  it('returns null for zero / negative / null / undefined / NaN input', () => {
    for (const bad of [0, -1, null, undefined, NaN, '0', 'not-a-time']) {
      expect(formatRelativeTime(bad, NOW)).toBe(null)
    }
  })

  it('never emits an epoch-era relative time (the "20645d ago" defect class)', () => {
    expect(String(formatRelativeTime(0, NOW) ?? '')).not.toMatch(/\d{4,}d ago/)
  })

  it('formats real timestamps across all units', () => {
    expect(formatRelativeTime(NOW - 5_000, NOW)).toBe('5s ago')
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(formatRelativeTime(NOW - 5 * 3_600_000, NOW)).toBe('5h ago')
    expect(formatRelativeTime(NOW - 5 * 86_400_000, NOW)).toBe('5d ago')
  })

  it('clamps future timestamps to "0s ago" rather than negative time', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('0s ago')
  })
})

/**
 * Spec 074 follow-up — the activity feed's Group control (default "By day").
 * Uses local-time constructors (not Date.UTC) to match dayGroupLabel/
 * weekGroupLabel's local calendar-day math, and noon anchors to stay clear
 * of day/week boundary edge cases regardless of the test runner's timezone.
 */
const NOW_LOCAL = new Date(2026, 6, 11, 12, 0, 0).getTime() // Saturday, Jul 11 2026

describe('dayGroupLabel (spec 074 follow-up)', () => {
  it('labels missing/invalid timestamps as "Undated" without fabricating a date', () => {
    for (const bad of [0, -1, null, undefined, NaN]) {
      expect(dayGroupLabel(bad, NOW_LOCAL)).toBe('Undated')
    }
  })

  it('labels the current calendar day "Today" and the prior day "Yesterday"', () => {
    expect(dayGroupLabel(NOW_LOCAL, NOW_LOCAL)).toBe('Today')
    expect(dayGroupLabel(NOW_LOCAL - 24 * 60 * 60 * 1000, NOW_LOCAL)).toBe('Yesterday')
  })

  it('formats older same-year dates without a year, and cross-year dates with one', () => {
    const sameYear = new Date(2026, 0, 2, 12).getTime()
    expect(dayGroupLabel(sameYear, NOW_LOCAL)).not.toMatch(/2026/)
    const lastYear = new Date(2025, 5, 2, 12).getTime()
    expect(dayGroupLabel(lastYear, NOW_LOCAL)).toMatch(/2025/)
  })
})

describe('weekGroupLabel (spec 074 follow-up)', () => {
  it('labels missing/invalid timestamps as "Undated"', () => {
    for (const bad of [0, -1, null, undefined, NaN]) {
      expect(weekGroupLabel(bad, NOW_LOCAL)).toBe('Undated')
    }
  })

  it('labels the current calendar week "This week" and the prior week "Last week"', () => {
    expect(weekGroupLabel(NOW_LOCAL, NOW_LOCAL)).toBe('This week')
    expect(weekGroupLabel(NOW_LOCAL - 7 * 24 * 60 * 60 * 1000, NOW_LOCAL)).toBe('Last week')
  })

  it('formats older weeks as "Week of <date>"', () => {
    const older = new Date(2026, 0, 5, 12).getTime()
    expect(weekGroupLabel(older, NOW_LOCAL)).toMatch(/^Week of /)
  })
})
