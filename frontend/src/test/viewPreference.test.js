import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getViewPreference,
  setViewPreference,
  VIEW_MODES,
} from '../utils/viewPreference'

const VIEW_PREFERENCE_KEY = 'marketViewPreference'

describe('viewPreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('VIEW_MODES', () => {
    it('should export GRID and COMPACT modes', () => {
      expect(VIEW_MODES.GRID).toBe('grid')
      expect(VIEW_MODES.COMPACT).toBe('compact')
    })
  })

  describe('getViewPreference', () => {
    it('should return grid on desktop when no preference saved', () => {
      // window.innerWidth defaults to something > 768 in jsdom
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
      expect(getViewPreference()).toBe('grid')
    })

    it('should return compact on mobile when no preference saved', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true })
      expect(getViewPreference()).toBe('compact')
    })

    it('should return compact at exactly 768px width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true })
      expect(getViewPreference()).toBe('compact')
    })

    it('should return grid at 769px width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 769, configurable: true })
      expect(getViewPreference()).toBe('grid')
    })

    it('should return saved grid preference', () => {
      localStorage.setItem(VIEW_PREFERENCE_KEY, 'grid')
      expect(getViewPreference()).toBe('grid')
    })

    it('should return saved compact preference', () => {
      localStorage.setItem(VIEW_PREFERENCE_KEY, 'compact')
      expect(getViewPreference()).toBe('compact')
    })

    it('should ignore invalid saved preference and use device default', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
      localStorage.setItem(VIEW_PREFERENCE_KEY, 'invalid-value')
      expect(getViewPreference()).toBe('grid')
    })

    it('should handle localStorage errors gracefully', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error')
      })
      // Should fall back to device default
      expect(getViewPreference()).toBe('grid')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should override mobile default when user has saved grid preference', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true })
      localStorage.setItem(VIEW_PREFERENCE_KEY, 'grid')
      expect(getViewPreference()).toBe('grid')
    })

    it('should override desktop default when user has saved compact preference', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
      localStorage.setItem(VIEW_PREFERENCE_KEY, 'compact')
      expect(getViewPreference()).toBe('compact')
    })
  })

  describe('setViewPreference', () => {
    it('should save grid preference', () => {
      setViewPreference('grid')
      expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('grid')
    })

    it('should save compact preference', () => {
      setViewPreference('compact')
      expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('compact')
    })

    it('should not save invalid view mode', () => {
      setViewPreference('invalid')
      expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBeNull()
    })

    it('should not save null', () => {
      setViewPreference(null)
      expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBeNull()
    })

    it('should not save undefined', () => {
      setViewPreference(undefined)
      expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBeNull()
    })

    it('should overwrite existing preference', () => {
      setViewPreference('grid')
      setViewPreference('compact')
      expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('compact')
    })

    it('should handle localStorage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full')
      })
      expect(() => setViewPreference('grid')).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })
})
