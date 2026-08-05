import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LANDING_VIEWS,
  getLandingViewPreference,
  setLandingViewPreference,
  resolveLandingView,
  resolveLandingPath,
} from '../landingViewPreference'
import { HOME_ITEM, PORTFOLIO_PATH } from '../../config/appNav'

const KEY = 'fairwins_landing_view_v1'

describe('landingViewPreference', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('exposes the canonical view order', () => {
    expect(LANDING_VIEWS).toEqual(['auto', 'home', 'portfolio'])
  })

  it('defaults to auto when nothing is saved', () => {
    expect(getLandingViewPreference()).toBe('auto')
  })

  it('persists and reads back a valid value', () => {
    setLandingViewPreference('portfolio')
    expect(getLandingViewPreference()).toBe('portfolio')
    expect(localStorage.getItem(KEY)).toBe('portfolio')
  })

  it('ignores invalid values in the setter', () => {
    setLandingViewPreference('nope')
    expect(getLandingViewPreference()).toBe('auto')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('falls back to auto on a corrupt stored value', () => {
    localStorage.setItem(KEY, 'lottery')
    expect(getLandingViewPreference()).toBe('auto')
  })

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(getLandingViewPreference()).toBe('auto')
    expect(() => setLandingViewPreference('home')).not.toThrow()
  })

  describe('resolveLandingView', () => {
    it('follows the viewport when auto (the default)', () => {
      expect(resolveLandingView(true)).toBe('home')
      expect(resolveLandingView(false)).toBe('portfolio')
    })

    it('honours an explicit pin regardless of viewport', () => {
      setLandingViewPreference('portfolio')
      expect(resolveLandingView(true)).toBe('portfolio')

      setLandingViewPreference('home')
      expect(resolveLandingView(false)).toBe('home')
    })
  })

  describe('resolveLandingPath', () => {
    it('maps the resolved view to its route', () => {
      expect(resolveLandingPath(true)).toBe(HOME_ITEM.to)
      expect(resolveLandingPath(false)).toBe(PORTFOLIO_PATH)
    })

    it('maps an explicit pin to its route regardless of viewport', () => {
      setLandingViewPreference('home')
      expect(resolveLandingPath(false)).toBe(HOME_ITEM.to)

      setLandingViewPreference('portfolio')
      expect(resolveLandingPath(true)).toBe(PORTFOLIO_PATH)
    })
  })
})
