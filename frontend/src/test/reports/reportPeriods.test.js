import { describe, it, expect } from 'vitest'
import {
  PERIOD_KINDS,
  PERIOD_PRESETS,
  resolvePreset,
  resolveCustomPeriod,
  resolvePeriod,
  validateRange,
} from '../../utils/reportPeriods'

// Fixed "now": 2026-06-17T12:30:00.000Z (a Wednesday in Q2 2026).
const NOW = Date.UTC(2026, 5, 17, 12, 30, 0, 0)

describe('reportPeriods presets (UTC boundaries)', () => {
  it('exposes the four named presets in order', () => {
    expect(PERIOD_PRESETS.map((p) => p.kind)).toEqual([
      PERIOD_KINDS.LAST_MONTH,
      PERIOD_KINDS.LAST_QUARTER,
      PERIOD_KINDS.LAST_YEAR,
      PERIOD_KINDS.LAST_CALENDAR_YEAR,
    ])
  })

  it('current_month resolves to the 1st of the current UTC month through now', () => {
    const r = resolvePreset(PERIOD_KINDS.CURRENT_MONTH, NOW)
    expect(new Date(r.from).toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(r.to).toBe(NOW)
    expect(r.label).toBe('Current month (Jun 2026)')
  })

  it('last_month resolves to the previous calendar month in UTC', () => {
    const r = resolvePreset(PERIOD_KINDS.LAST_MONTH, NOW)
    expect(new Date(r.from).toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(new Date(r.to).toISOString()).toBe('2026-05-31T23:59:59.999Z')
    expect(r.label).toBe('Last month (May 2026)')
  })

  it('last_quarter resolves to the previous completed calendar quarter', () => {
    // now is in Q2 (Apr-Jun) → previous quarter is Q1 (Jan-Mar) 2026.
    const r = resolvePreset(PERIOD_KINDS.LAST_QUARTER, NOW)
    expect(new Date(r.from).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(new Date(r.to).toISOString()).toBe('2026-03-31T23:59:59.999Z')
    expect(r.label).toBe('Last quarter (Q1 2026)')
  })

  it('last_quarter rolls into the prior year when now is in Q1', () => {
    const q1Now = Date.UTC(2026, 1, 10) // Feb 2026 → previous quarter Q4 2025
    const r = resolvePreset(PERIOD_KINDS.LAST_QUARTER, q1Now)
    expect(new Date(r.from).toISOString()).toBe('2025-10-01T00:00:00.000Z')
    expect(new Date(r.to).toISOString()).toBe('2025-12-31T23:59:59.999Z')
    expect(r.label).toBe('Last quarter (Q4 2025)')
  })

  it('last_year is the trailing 12 months ending now', () => {
    const r = resolvePreset(PERIOD_KINDS.LAST_YEAR, NOW)
    expect(new Date(r.from).toISOString()).toBe('2025-06-17T12:30:00.000Z')
    expect(r.to).toBe(NOW)
  })

  it('last_calendar_year is Jan 1 – Dec 31 of the previous year', () => {
    const r = resolvePreset(PERIOD_KINDS.LAST_CALENDAR_YEAR, NOW)
    expect(new Date(r.from).toISOString()).toBe('2025-01-01T00:00:00.000Z')
    expect(new Date(r.to).toISOString()).toBe('2025-12-31T23:59:59.999Z')
    expect(r.label).toBe('Last calendar year (2025)')
  })

  it('throws on an unknown preset', () => {
    expect(() => resolvePreset('not_a_preset', NOW)).toThrow(/Unknown period preset/)
  })
})

describe('reportPeriods custom + resolvePeriod', () => {
  it('builds a custom inclusive range with an ISO label', () => {
    const from = Date.UTC(2026, 0, 1)
    const to = Date.UTC(2026, 2, 31, 23, 59, 59, 999)
    const r = resolveCustomPeriod(from, to)
    expect(r.kind).toBe(PERIOD_KINDS.CUSTOM)
    expect(r.from).toBe(from)
    expect(r.to).toBe(to)
    expect(r.label).toBe('Custom (2026-01-01 – 2026-03-31)')
  })

  it('resolvePeriod dispatches preset vs custom', () => {
    const preset = resolvePeriod({ kind: PERIOD_KINDS.LAST_MONTH, nowMs: NOW })
    expect(preset.label).toBe('Last month (May 2026)')
    const custom = resolvePeriod({ kind: PERIOD_KINDS.CUSTOM, from: 10, to: 20, nowMs: NOW })
    expect(custom).toMatchObject({ kind: 'custom', from: 10, to: 20 })
  })
})

describe('reportPeriods validateRange (FR-013)', () => {
  it('accepts a valid past range', () => {
    expect(validateRange({ from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 2, 1) }, NOW))
      .toEqual({ valid: true, error: null })
  })

  it('rejects an inverted range', () => {
    const res = validateRange({ from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 0, 1) }, NOW)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/on or after the start date/)
  })

  it('rejects a future end date', () => {
    const res = validateRange({ from: NOW - 1000, to: NOW + 60_000 }, NOW)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/cannot be in the future/)
  })

  it('rejects non-finite bounds', () => {
    expect(validateRange({ from: NaN, to: NOW }, NOW).valid).toBe(false)
    expect(validateRange({}, NOW).valid).toBe(false)
  })

  it('treats equal bounds as valid', () => {
    expect(validateRange({ from: NOW, to: NOW }, NOW).valid).toBe(true)
  })
})
