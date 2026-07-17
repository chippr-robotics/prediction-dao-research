import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  HOME_MODES,
  CURRENCY_KINDS,
  getDefaultHomeMode,
  setDefaultHomeMode,
  getDefaultCurrencyKind,
  setDefaultCurrencyKind,
  subscribe,
} from '../homePreference'

const KEY = 'fairwins_home_v1'

describe('homePreference (spec 058 US4 — fairwins_home_v1)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('exposes the canonical mode and currency-kind orders', () => {
    expect(HOME_MODES).toEqual(['pay', 'request', 'wager'])
    expect(CURRENCY_KINDS).toEqual(['stable', 'native'])
  })

  it('defaults to pay / stable when nothing is saved', () => {
    expect(getDefaultHomeMode()).toBe('pay')
    expect(getDefaultCurrencyKind()).toBe('stable')
  })

  it('persists and reads back valid values', () => {
    setDefaultHomeMode('wager')
    setDefaultCurrencyKind('native')
    expect(getDefaultHomeMode()).toBe('wager')
    expect(getDefaultCurrencyKind()).toBe('native')
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({
      defaultMode: 'wager',
      defaultCurrencyKind: 'native',
    })
  })

  it('ignores invalid values in the setters', () => {
    setDefaultHomeMode('lottery')
    setDefaultCurrencyKind('doge')
    expect(getDefaultHomeMode()).toBe('pay')
    expect(getDefaultCurrencyKind()).toBe('stable')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('falls back to defaults on invalid stored values', () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultMode: 'nope', defaultCurrencyKind: 42 }))
    expect(getDefaultHomeMode()).toBe('pay')
    expect(getDefaultCurrencyKind()).toBe('stable')
  })

  it('falls back to defaults on corrupt JSON without throwing', () => {
    localStorage.setItem(KEY, '{not json')
    expect(getDefaultHomeMode()).toBe('pay')
    expect(getDefaultCurrencyKind()).toBe('stable')
  })

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(getDefaultHomeMode()).toBe('pay')
    expect(getDefaultCurrencyKind()).toBe('stable')
    expect(() => setDefaultHomeMode('wager')).not.toThrow()
  })

  it('preserves unknown stored fields when writing (forward compat)', () => {
    localStorage.setItem(KEY, JSON.stringify({ futureField: 'keep-me', defaultMode: 'request' }))
    setDefaultCurrencyKind('native')
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({
      futureField: 'keep-me',
      defaultMode: 'request',
      defaultCurrencyKind: 'native',
    })
  })

  it('notifies subscribers on every setter call and supports unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    setDefaultHomeMode('request')
    expect(listener).toHaveBeenCalledTimes(1)
    setDefaultCurrencyKind('native')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setDefaultHomeMode('pay')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('still notifies subscribers when persistence fails (session-only consistency)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    setDefaultHomeMode('wager')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
