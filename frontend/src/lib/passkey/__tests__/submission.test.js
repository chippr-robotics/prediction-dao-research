/**
 * Spec 041 T021 — submission routing: all four decision-table rows,
 * back-pressure fallback, no-silent-retry, honest lifecycle tracking,
 * pre-flight fee shortfall.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  chooseRoute,
  trackToInclusion,
  assertFeeBalance,
  defaultBundlerProbe,
  SubmissionUnavailable,
  InsufficientFeeBalance,
  LIFECYCLE,
} from '../submission'

const healthy = async () => ({ healthy: true })
const down = async () => ({ healthy: false })

describe('chooseRoute (decision table)', () => {
  it('row 1: intent-capable action + healthy relayer → intent (no user gas)', async () => {
    const route = await chooseRoute({ intentCapable: true, accountNative: false, probeRelayer: healthy, probeBundler: down })
    expect(route).toBe('intent')
  })

  it('row 2: account-native op → userop, relayer never consulted', async () => {
    const probeRelayer = vi.fn()
    const route = await chooseRoute({ intentCapable: true, accountNative: true, probeRelayer, probeBundler: healthy })
    expect(route).toBe('userop')
    expect(probeRelayer).not.toHaveBeenCalled()
  })

  it('row 3: intent-capable but relayer down/back-pressuring → userop fallback', async () => {
    const route = await chooseRoute({ intentCapable: true, accountNative: false, probeRelayer: down, probeBundler: healthy })
    expect(route).toBe('userop')
  })

  it('row 4: both paths down → SubmissionUnavailable with causes + retryAfter (no spin)', async () => {
    const err = await chooseRoute({ intentCapable: true, accountNative: false, probeRelayer: down, probeBundler: down }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(SubmissionUnavailable)
    expect(err.retryAfterSec).toBeGreaterThan(0)
    expect(err.causes.length).toBeGreaterThan(0)
  })

  it('a throwing relayer probe degrades to the bundler leg, not an error', async () => {
    const route = await chooseRoute({
      intentCapable: true,
      accountNative: false,
      probeRelayer: async () => {
        throw new Error('relay gateway 503')
      },
      probeBundler: healthy,
    })
    expect(route).toBe('userop')
  })
})

describe('defaultBundlerProbe (ordered, replaceable endpoints — FR-013)', () => {
  it('falls through failing endpoints to the first healthy one', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: ['0x5FF1'] }) })
    const probe = defaultBundlerProbe(['https://a', 'https://b'], { fetchFn })
    const out = await probe()
    expect(out).toEqual({ healthy: true, url: 'https://b' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('reports unhealthy when every endpoint fails (no throw, no retry loop)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'))
    const probe = defaultBundlerProbe(['https://a'], { fetchFn })
    expect(await probe()).toEqual({ healthy: false })
    expect(fetchFn).toHaveBeenCalledTimes(1) // exactly one attempt per endpoint
  })
})

describe('trackToInclusion (honest lifecycle, FR-017)', () => {
  const instant = () => Promise.resolve()

  it('reports included only when the chain says so', async () => {
    const states = []
    const checkIncluded = vi
      .fn()
      .mockResolvedValueOnce({ state: 'pending' })
      .mockResolvedValueOnce({ state: 'included', txHash: '0xabc' })
    const out = await trackToInclusion({ checkIncluded, onState: (s) => states.push(s.state), sleep: instant })
    expect(out).toEqual({ state: LIFECYCLE.INCLUDED, txHash: '0xabc' })
    expect(states).toContain(LIFECYCLE.SUBMITTED)
    expect(states.at(-1)).toBe(LIFECYCLE.INCLUDED)
  })

  it('surfaces a truthful failure', async () => {
    const out = await trackToInclusion({
      checkIncluded: async () => ({ state: 'failed', reason: 'reverted' }),
      sleep: instant,
    })
    expect(out).toEqual({ state: LIFECYCLE.FAILED, reason: 'reverted' })
  })

  it('goes STALLED (not fake-included, not infinite spin) past the stall window', async () => {
    const out = await trackToInclusion({
      checkIncluded: async () => ({ state: 'pending' }),
      stallAfterMs: 0,
      sleep: instant,
    })
    expect(out.state).toBe(LIFECYCLE.STALLED)
    expect(out.lastKnown).toEqual({ state: 'pending' })
  })
})

describe('assertFeeBalance (pre-flight, FR-014)', () => {
  it('passes when covered', () => {
    expect(() => assertFeeBalance({ balance: 100n, required: 100n, denomination: 'USDC' })).not.toThrow()
  })

  it('throws with the exact shortfall', () => {
    const err = (() => {
      try {
        assertFeeBalance({ balance: 40n, required: 100n, denomination: 'USDC' })
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(InsufficientFeeBalance)
    expect(err.shortfall).toBe('60')
    expect(err.denomination).toBe('USDC')
  })
})
