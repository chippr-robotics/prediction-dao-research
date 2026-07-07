// Spec 043 (US6, FR-027/028) — Custody is a controllable notification category: it appears in the preferences
// list, and setting it to 'silent' suppresses only Custody delivery while other domains keep delivering.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  NOTIFICATION_CATEGORIES,
  getDeliveryMode,
  setDeliveryMode,
  resolveDelivery,
} from '../../lib/notifications/deliveryPreferences'

beforeEach(() => {
  localStorage.clear()
})

describe('Custody notification controls', () => {
  it('is registered as a preference category with a description', () => {
    const custody = NOTIFICATION_CATEGORIES.find((c) => c.domain === 'custody')
    expect(custody).toBeTruthy()
    expect(custody.label).toBe('Custody')
    expect(custody.description).toMatch(/approval|threshold|execut/i)
  })

  it('defaults to app delivery and can be silenced without affecting other domains', () => {
    expect(getDeliveryMode('custody')).toBe('app')
    setDeliveryMode('custody', 'silent')
    expect(resolveDelivery('custody')).toBe('silent')
    // Other sources are unaffected.
    expect(resolveDelivery('wagers')).toBe('app')
    expect(resolveDelivery('membership')).toBe('app')
  })
})
