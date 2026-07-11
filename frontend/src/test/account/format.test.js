/**
 * Spec 051 T034 — formatRelativeTime null-guard (US4, FR-006): a missing,
 * zero, or invalid timestamp must never render as time-since-epoch
 * ("20645d ago"); callers show an explicit "date unavailable" state on null.
 */
import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '../../lib/account/format'

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
