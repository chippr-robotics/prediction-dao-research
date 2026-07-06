/**
 * Unit tests for the notification delivery preference model.
 * Device-scoped localStorage, three delivery modes, master push gating.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  NOTIFICATION_CATEGORIES,
  DELIVERY_MODES,
  DEFAULT_MODE,
  getNotificationPrefs,
  getDeliveryMode,
  setDeliveryMode,
  isPushEnabled,
  setPushEnabled,
  resolveDelivery,
  subscribe,
} from '../lib/notifications/deliveryPreferences'

beforeEach(() => {
  localStorage.clear()
})

describe('deliveryPreferences model', () => {
  it('defaults every known category to in-app, push off', () => {
    const prefs = getNotificationPrefs()
    expect(prefs.pushEnabled).toBe(false)
    for (const { domain } of NOTIFICATION_CATEGORIES) {
      expect(prefs.modes[domain]).toBe(DEFAULT_MODE)
      expect(DEFAULT_MODE).toBe('app')
    }
  })

  it('persists and reads back a per-domain mode', () => {
    setDeliveryMode('wagers', 'silent')
    expect(getDeliveryMode('wagers')).toBe('silent')
    // Survives a fresh read from storage.
    expect(getNotificationPrefs().modes.wagers).toBe('silent')
  })

  it('ignores an invalid mode', () => {
    setDeliveryMode('wagers', 'bogus')
    expect(getDeliveryMode('wagers')).toBe(DEFAULT_MODE)
  })

  it('falls back to the default for an unknown domain (never silences a new domain)', () => {
    expect(getDeliveryMode('brand-new-domain')).toBe(DEFAULT_MODE)
  })

  it('toggles the master push flag', () => {
    expect(isPushEnabled()).toBe(false)
    setPushEnabled(true)
    expect(isPushEnabled()).toBe(true)
    setPushEnabled(false)
    expect(isPushEnabled()).toBe(false)
  })

  it('resolveDelivery collapses push→app when master push is off (never dropped)', () => {
    setDeliveryMode('wagers', 'push')
    expect(resolveDelivery('wagers')).toBe('app') // push off → degrades to app
    setPushEnabled(true)
    expect(resolveDelivery('wagers')).toBe('push') // push on → honored
  })

  it('resolveDelivery keeps silent regardless of the master flag', () => {
    setDeliveryMode('dao', 'silent')
    setPushEnabled(true)
    expect(resolveDelivery('dao')).toBe('silent')
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    setDeliveryMode('pools', 'push')
    expect(listener).toHaveBeenCalledTimes(1)
    setPushEnabled(true)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setDeliveryMode('pools', 'app')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('exposes exactly the three delivery modes', () => {
    expect(DELIVERY_MODES).toEqual(['push', 'app', 'silent'])
  })
})
