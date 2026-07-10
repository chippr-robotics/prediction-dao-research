/**
 * Spec 045 T017 — first-time explainer marker (US4/FR-010): shown-once
 * semantics, browser-scoped, storage failures never block connecting.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { hasSeenExplainer, markExplainerSeen } from '../explainer'

describe('passkey explainer marker', () => {
  beforeEach(() => localStorage.clear())

  it('is unseen on a fresh browser and seen after marking', () => {
    expect(hasSeenExplainer()).toBe(false)
    markExplainerSeen()
    expect(hasSeenExplainer()).toBe(true)
  })

  it('treats corrupted storage as unseen (re-showing is the safe failure)', () => {
    localStorage.setItem('fairwins.passkey.explainer.v1', '{not json')
    expect(hasSeenExplainer()).toBe(false)
  })

  it('swallows storage write failures (never blocks the connect flow)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => markExplainerSeen(throwing)).not.toThrow()
    expect(hasSeenExplainer(throwing)).toBe(false)
  })
})
