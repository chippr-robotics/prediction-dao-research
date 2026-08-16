/**
 * Burn rate and runway (spec 089, FR-015; research R6).
 *
 * The behaviours tested here are the ones that decide whether a runway alert is trustworthy. Two of
 * them are counterintuitive and both have a failure mode that looks like good news:
 *
 *   - a top-up must not produce NEGATIVE burn (which would be infinite runway);
 *   - an unknown burn rate must produce NO runway, never `Infinity`.
 */
import { describe, it, expect } from 'vitest'
import { createBurnTracker } from '../src/burnRate.js'

const SEC = 1000

describe('burn rate', () => {
  it('is null until there are enough samples — two points seconds apart are noise', () => {
    const b = createBurnTracker({ now: () => 0 })
    b.observe('p', 100, 0)
    b.observe('p', 90, 10 * SEC)
    expect(b.burnRatePerSec('p')).toBeNull()
  })

  it('computes spend per second over the window', () => {
    const b = createBurnTracker()
    b.observe('p', 100, 0)
    b.observe('p', 90, 100 * SEC)
    b.observe('p', 80, 200 * SEC)
    // 20 spent over 200s.
    expect(b.burnRatePerSec('p')).toBeCloseTo(0.1, 6)
  })

  it('counts only DECREASES, so a top-up cannot produce negative burn', () => {
    // The trap: (first - last) / elapsed over a window containing a refill is negative, and a
    // negative burn rate divides into "infinite runway" — the healthiest possible reading for a
    // pool that is actually draining.
    const b = createBurnTracker()
    b.observe('p', 100, 0)
    b.observe('p', 80, 100 * SEC) // spent 20
    b.observe('p', 500, 150 * SEC) // topped up
    b.observe('p', 480, 200 * SEC) // spent 20
    expect(b.burnRatePerSec('p')).toBeGreaterThan(0)
    expect(b.burnRatePerSec('p')).toBeCloseTo(40 / 200, 6)
  })

  it('reports zero burn when the balance never moves', () => {
    const b = createBurnTracker()
    for (let i = 0; i <= 3; i++) b.observe('p', 100, i * 100 * SEC)
    expect(b.burnRatePerSec('p')).toBe(0)
  })
})

describe('runway — the Infinity trap', () => {
  it('is null when burn rate is unknown', () => {
    const b = createBurnTracker()
    b.observe('p', 100, 0)
    expect(b.runwaySeconds('p', 100)).toBeNull()
  })

  it('is null — NOT Infinity — when burn rate is zero', () => {
    // An alert rule reading `+Inf` concludes the pool is in perfect health. It is the single most
    // dangerous number this module could emit, which is why the type is null.
    const b = createBurnTracker()
    for (let i = 0; i <= 3; i++) b.observe('p', 100, i * 100 * SEC)
    expect(b.burnRatePerSec('p')).toBe(0)
    expect(b.runwaySeconds('p', 100)).toBeNull()
  })

  it('is null when the balance itself was not read', () => {
    const b = createBurnTracker()
    b.observe('p', 100, 0)
    b.observe('p', 90, 100 * SEC)
    b.observe('p', 80, 200 * SEC)
    expect(b.runwaySeconds('p', null)).toBeNull()
    expect(b.runwaySeconds('p', undefined)).toBeNull()
  })

  it('halves when the burn rate doubles, with no threshold edit (User Story 2)', () => {
    const slow = createBurnTracker()
    slow.observe('s', 1000, 0)
    slow.observe('s', 900, 100 * SEC)
    slow.observe('s', 800, 200 * SEC) // 1/sec

    const fast = createBurnTracker()
    fast.observe('f', 1000, 0)
    fast.observe('f', 800, 100 * SEC)
    fast.observe('f', 600, 200 * SEC) // 2/sec

    const slowRunway = slow.runwaySeconds('s', 800)
    const fastRunway = fast.runwaySeconds('f', 800)
    expect(fastRunway).toBeCloseTo(slowRunway / 2, 6)
  })
})

describe('window trimming', () => {
  it('drops samples older than the window, keeping exactly one baseline before the cutoff', () => {
    // The retained baseline is deliberate: without a sample from before the cutoff, a window that
    // has only just filled has no earlier point to measure a decrease against, and burn rate would
    // read as 0 — which is the "infinite runway" failure wearing yet another hat.
    const b = createBurnTracker({ windowSec: 100 })
    for (let i = 0; i <= 5; i++) b.observe('p', 100 - i * 5, i * 50 * SEC) // 0,50,100,150,200,250s

    const kept = b._history.get('p')
    const cutoff = 250 * SEC - 100 * SEC // 150s

    // Everything strictly older than the baseline is gone.
    expect(kept[0].at).toBe(100 * SEC)
    // Exactly one sample sits before the cutoff; the rest are in-window.
    expect(kept.filter((s) => s.at < cutoff)).toHaveLength(1)
    expect(kept.map((s) => s.at)).toEqual([100 * SEC, 150 * SEC, 200 * SEC, 250 * SEC])
  })

  it('keeps the history bounded as samples accumulate', () => {
    const b = createBurnTracker({ windowSec: 600 })
    for (let i = 0; i < 500; i++) b.observe('p', 1000 - i, i * 60 * SEC)
    // 600s window at one sample per 60s -> ~10 in-window plus the baseline, not 500.
    expect(b._history.get('p').length).toBeLessThanOrEqual(12)
  })
})
