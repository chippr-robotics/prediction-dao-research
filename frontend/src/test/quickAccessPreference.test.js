import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getHiddenCards,
  isCardVisible,
  setCardVisible,
  subscribe,
} from '../utils/quickAccessPreference'

const STORAGE_KEY = 'fairwins_quickaccess_v1'

describe('quickAccessPreference (spec 038 US5)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to all cards visible when nothing is stored', () => {
    expect(getHiddenCards()).toEqual([])
    expect(isCardVisible('my-wagers')).toBe(true)
  })

  it('returns all-visible (and does not throw) when the stored value is corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(() => getHiddenCards()).not.toThrow()
    expect(getHiddenCards()).toEqual([])
  })

  it('returns all-visible when the stored value is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ my: 'object' }))
    expect(getHiddenCards()).toEqual([])
  })

  it('returns the default (and does not throw) when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => getHiddenCards()).not.toThrow()
    expect(getHiddenCards()).toEqual([])
  })

  it('hides a card via setCardVisible(id, false), persisting only its id', () => {
    setCardVisible('my-wagers', false)
    expect(getHiddenCards()).toEqual(['my-wagers'])
    expect(isCardVisible('my-wagers')).toBe(false)
    expect(isCardVisible('scan-qr')).toBe(true) // unaffected
  })

  it('restores a card via setCardVisible(id, true)', () => {
    setCardVisible('my-wagers', false)
    setCardVisible('scan-qr', false)
    setCardVisible('my-wagers', true)
    expect(getHiddenCards()).toEqual(['scan-qr'])
  })

  it('setCardVisible(id, false) is idempotent — no duplicate entries', () => {
    setCardVisible('my-wagers', false)
    setCardVisible('my-wagers', false)
    expect(getHiddenCards()).toEqual(['my-wagers'])
  })

  it('a card id never previously seen defaults to visible (future cards default on)', () => {
    setCardVisible('some-existing-card', false)
    expect(isCardVisible('a-card-added-later')).toBe(true)
  })

  it('persists the full hidden set as a JSON array under fairwins_quickaccess_v1', () => {
    setCardVisible('a', false)
    setCardVisible('b', false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual(['a', 'b'])
  })

  it('never throws when storage writes fail (private browsing / quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => setCardVisible('my-wagers', false)).not.toThrow()
  })

  it('subscribe notifies listeners on every visibility change and unsubscribe stops delivery', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    setCardVisible('my-wagers', false)
    expect(listener).toHaveBeenCalledTimes(1)

    setCardVisible('my-wagers', true)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setCardVisible('scan-qr', false)
    expect(listener).toHaveBeenCalledTimes(2) // no further calls after unsubscribe
  })
})
