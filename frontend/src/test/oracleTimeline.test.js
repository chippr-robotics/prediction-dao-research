import { describe, it, expect } from 'vitest'
import {
  deriveOracleChallengeTimeline,
  MIN_LEAD_MS,
  ACCEPT_CAP_MS,
  SETTLE_BUFFER_MS,
  RESOLVE_CAP_MS,
} from '../lib/openChallenge/oracleTimeline'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-07-05T12:00:00Z')

const iso = (ms) => new Date(ms).toISOString()

describe('deriveOracleChallengeTimeline (spec 041, FR-007/FR-003, SC-003)', () => {
  it('is ineligible without an end date', () => {
    for (const bad of [null, undefined, '']) {
      const r = deriveOracleChallengeTimeline(bad, NOW)
      expect(r.eligible).toBe(false)
      expect(r.reason).toMatch(/end date/i)
      expect(r.acceptDeadlineMs).toBeNull()
      expect(r.resolveDeadlineMs).toBeNull()
    }
  })

  it('is ineligible with a garbage end date', () => {
    const r = deriveOracleChallengeTimeline('not-a-date', NOW)
    expect(r.eligible).toBe(false)
    expect(r.reason).toMatch(/end date/i)
  })

  it('is ineligible when the market ends inside the minimum lead time', () => {
    const past = deriveOracleChallengeTimeline(iso(NOW - DAY), NOW)
    expect(past.eligible).toBe(false)

    const tooSoon = deriveOracleChallengeTimeline(iso(NOW + MIN_LEAD_MS - 1), NOW)
    expect(tooSoon.eligible).toBe(false)
    expect(tooSoon.reason).toMatch(/too soon/i)

    const justEnough = deriveOracleChallengeTimeline(iso(NOW + MIN_LEAD_MS + 1000), NOW)
    expect(justEnough.eligible).toBe(true)
  })

  it('uses the market end as the accept deadline when inside the 30-day cap', () => {
    const end = NOW + 5 * DAY
    const r = deriveOracleChallengeTimeline(iso(end), NOW)
    expect(r.eligible).toBe(true)
    expect(r.acceptCapped).toBe(false)
    expect(r.acceptDeadlineMs).toBe(end)
    expect(r.resolveDeadlineMs).toBe(end + SETTLE_BUFFER_MS)
  })

  it('caps the accept deadline at 30 days minus margin for far-future events, and discloses it', () => {
    const end = NOW + 90 * DAY
    const r = deriveOracleChallengeTimeline(iso(end), NOW)
    expect(r.eligible).toBe(true)
    expect(r.acceptCapped).toBe(true)
    expect(r.acceptDeadlineMs).toBe(NOW + ACCEPT_CAP_MS)
    // Settlement still tracks the event (end + buffer), within the resolve cap.
    expect(r.resolveDeadlineMs).toBe(end + SETTLE_BUFFER_MS)
  })

  it('caps the resolve deadline at 180 days minus margin for very far events', () => {
    const end = NOW + 179 * DAY
    const r = deriveOracleChallengeTimeline(iso(end), NOW)
    expect(r.eligible).toBe(true)
    expect(r.resolveDeadlineMs).toBe(NOW + RESOLVE_CAP_MS)
  })

  it('holds the contract-safety invariants for every eligible output', () => {
    // Sweep a wide range of end dates: from just past the lead floor to past both caps.
    const ends = [
      NOW + MIN_LEAD_MS + 1000,
      NOW + 6 * HOUR,
      NOW + 2 * DAY,
      NOW + 29 * DAY,
      NOW + 30 * DAY,
      NOW + 31 * DAY,
      NOW + 100 * DAY,
      NOW + 179 * DAY,
      NOW + 400 * DAY,
    ]
    for (const end of ends) {
      const r = deriveOracleChallengeTimeline(iso(end), NOW)
      expect(r.eligible).toBe(true)
      expect(r.acceptDeadlineMs).toBeGreaterThan(NOW)
      expect(r.resolveDeadlineMs).toBeGreaterThan(r.acceptDeadlineMs)
      expect(r.acceptDeadlineMs).toBeLessThanOrEqual(NOW + 30 * DAY)
      expect(r.resolveDeadlineMs).toBeLessThanOrEqual(NOW + 180 * DAY)
      // The challenge is never takeable after the event closes (SC-003).
      expect(r.acceptDeadlineMs).toBeLessThanOrEqual(end)
    }
  })

  it('is deterministic for an injected clock (no internal Date.now reads)', () => {
    const end = iso(NOW + 10 * DAY)
    const a = deriveOracleChallengeTimeline(end, NOW)
    const b = deriveOracleChallengeTimeline(end, NOW)
    expect(a).toEqual(b)
  })
})
