import { describe, it, expect } from 'vitest'
import {
  formatTileClock, formatTileDay, formatTimelineSpan,
  toDatetimeLocal, fromDatetimeLocal,
  clampToRange, stepByMinutes, enforceMinGap,
  HOUR_MS, DAY_MS,
} from '../components/fairwins/wagerTimeline'

describe('wagerTimeline helpers (spec 038)', () => {
  describe('clampToRange', () => {
    it('leaves in-range values untouched', () => {
      expect(clampToRange(50, 0, 100)).toBe(50)
    })
    it('clamps below the minimum', () => {
      expect(clampToRange(-10, 0, 100)).toBe(0)
    })
    it('clamps above the maximum', () => {
      expect(clampToRange(200, 0, 100)).toBe(100)
    })
  })

  describe('stepByMinutes', () => {
    it('steps forward by the given number of minutes', () => {
      expect(stepByMinutes(0, 15)).toBe(15 * 60000)
    })
    it('steps backward with a negative value', () => {
      expect(stepByMinutes(60 * 60000, -15)).toBe(45 * 60000)
    })
  })

  describe('enforceMinGap', () => {
    it('leaves laterMs alone when the gap is already sufficient', () => {
      const earlier = 0
      const later = 2 * HOUR_MS
      expect(enforceMinGap(earlier, later, HOUR_MS)).toBe(later)
    })
    it('pushes laterMs forward when the gap is too small', () => {
      const earlier = 0
      const later = 30 * 60000 // 30 minutes — less than the 1h min gap
      expect(enforceMinGap(earlier, later, HOUR_MS)).toBe(earlier + HOUR_MS)
    })
  })

  describe('toDatetimeLocal / fromDatetimeLocal round-trip', () => {
    it('round-trips a unix-ms instant through the datetime-local format at minute precision', () => {
      const ms = Date.UTC(2026, 5, 17, 14, 5, 0, 0) // arbitrary fixed instant
      const str = toDatetimeLocal(ms)
      expect(fromDatetimeLocal(str)).toBe(ms)
    })
    it('returns NaN for an empty string', () => {
      expect(Number.isNaN(fromDatetimeLocal(''))).toBe(true)
    })
  })

  describe('formatTileClock / formatTileDay / formatTimelineSpan', () => {
    it('formats a short clock and day', () => {
      const d = new Date(2026, 5, 17, 14, 5)
      expect(formatTileClock(d)).toMatch(/2:05\s*PM/)
      expect(formatTileDay(d)).toMatch(/Jun\s*17/)
    })
    it('formats a span under a day in hours', () => {
      const from = new Date(2026, 0, 1, 0, 0)
      const to = new Date(2026, 0, 1, 3, 0)
      expect(formatTimelineSpan(from, to)).toBe('3h')
    })
    it('formats a multi-day span with hours', () => {
      const from = new Date(2026, 0, 1, 0, 0)
      const to = new Date(2026, 0, 3, 6, 0)
      expect(formatTimelineSpan(from, to)).toBe('2 days 6h')
    })
  })

  describe('HOUR_MS / DAY_MS', () => {
    it('are consistent unit constants', () => {
      expect(HOUR_MS).toBe(3600 * 1000)
      expect(DAY_MS).toBe(24 * HOUR_MS)
    })
  })
})
