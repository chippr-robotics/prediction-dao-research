import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  saveUserPreference,
  getUserPreference,
  removeUserPreference,
  clearUserPreferences,
  saveGlobalPreference,
  getGlobalPreference,
  getGlobalPreferences,
} from '../utils/userStorage'

const TEST_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
const NORMALIZED_ADDRESS = TEST_ADDRESS.toLowerCase()
const PREFIX = 'fw_user_'
const GLOBAL_KEY = 'fw_global_prefs'

describe('userStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  describe('saveUserPreference', () => {
    it('should save to sessionStorage by default', () => {
      saveUserPreference(TEST_ADDRESS, 'theme', 'dark')
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_theme`
      expect(sessionStorage.getItem(key)).toBe(JSON.stringify('dark'))
      expect(localStorage.getItem(key)).toBeNull()
    })

    it('should save to localStorage when useLocalStorage is true', () => {
      saveUserPreference(TEST_ADDRESS, 'theme', 'dark', true)
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_theme`
      expect(localStorage.getItem(key)).toBe(JSON.stringify('dark'))
      expect(sessionStorage.getItem(key)).toBeNull()
    })

    it('should normalize wallet address to lowercase', () => {
      saveUserPreference(TEST_ADDRESS.toUpperCase(), 'lang', 'en')
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_lang`
      expect(sessionStorage.getItem(key)).toBe(JSON.stringify('en'))
    })

    it('should save objects as JSON', () => {
      const value = { color: 'blue', size: 12 }
      saveUserPreference(TEST_ADDRESS, 'settings', value)
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_settings`
      expect(JSON.parse(sessionStorage.getItem(key))).toEqual(value)
    })

    it('should save arrays as JSON', () => {
      const value = [1, 2, 3]
      saveUserPreference(TEST_ADDRESS, 'favorites', value)
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_favorites`
      expect(JSON.parse(sessionStorage.getItem(key))).toEqual(value)
    })

    it('should save boolean values', () => {
      saveUserPreference(TEST_ADDRESS, 'darkMode', true)
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_darkMode`
      expect(JSON.parse(sessionStorage.getItem(key))).toBe(true)
    })

    it('should save numeric values', () => {
      saveUserPreference(TEST_ADDRESS, 'pageSize', 50)
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_pageSize`
      expect(JSON.parse(sessionStorage.getItem(key))).toBe(50)
    })

    it('should handle storage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })
      expect(() => saveUserPreference(TEST_ADDRESS, 'key', 'val')).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should not throw when wallet address is missing (error is caught)', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => saveUserPreference(null, 'key', 'val')).not.toThrow()
      expect(() => saveUserPreference('', 'key', 'val')).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  describe('getUserPreference', () => {
    it('should return stored value from sessionStorage', () => {
      saveUserPreference(TEST_ADDRESS, 'theme', 'dark')
      expect(getUserPreference(TEST_ADDRESS, 'theme')).toBe('dark')
    })

    it('should return stored value from localStorage', () => {
      saveUserPreference(TEST_ADDRESS, 'theme', 'light', true)
      expect(getUserPreference(TEST_ADDRESS, 'theme', null, true)).toBe('light')
    })

    it('should return defaultValue when no data stored', () => {
      expect(getUserPreference(TEST_ADDRESS, 'missing', 'fallback')).toBe('fallback')
    })

    it('should return null as default when no defaultValue specified', () => {
      expect(getUserPreference(TEST_ADDRESS, 'missing')).toBeNull()
    })

    it('should return complex objects', () => {
      const value = { nested: { deep: true }, arr: [1, 2] }
      saveUserPreference(TEST_ADDRESS, 'complex', value)
      expect(getUserPreference(TEST_ADDRESS, 'complex')).toEqual(value)
    })

    it('should handle parse errors by returning defaultValue', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const key = `${PREFIX}${NORMALIZED_ADDRESS}_broken`
      sessionStorage.setItem(key, 'not-json')
      expect(getUserPreference(TEST_ADDRESS, 'broken', 'fallback')).toBe('fallback')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should return defaultValue when wallet address is missing', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(getUserPreference(null, 'key', 'fallback')).toBe('fallback')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should normalize address case for retrieval', () => {
      saveUserPreference(TEST_ADDRESS, 'val', 42)
      expect(getUserPreference(TEST_ADDRESS.toUpperCase(), 'val')).toBe(42)
    })
  })

  describe('removeUserPreference', () => {
    it('should remove from sessionStorage by default', () => {
      saveUserPreference(TEST_ADDRESS, 'theme', 'dark')
      removeUserPreference(TEST_ADDRESS, 'theme')
      expect(getUserPreference(TEST_ADDRESS, 'theme')).toBeNull()
    })

    it('should remove from localStorage when useLocalStorage is true', () => {
      saveUserPreference(TEST_ADDRESS, 'theme', 'dark', true)
      removeUserPreference(TEST_ADDRESS, 'theme', true)
      expect(getUserPreference(TEST_ADDRESS, 'theme', null, true)).toBeNull()
    })

    it('should not throw when removing non-existent key', () => {
      expect(() => removeUserPreference(TEST_ADDRESS, 'nonexistent')).not.toThrow()
    })

    it('should handle storage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error')
      })
      expect(() => removeUserPreference(TEST_ADDRESS, 'key')).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  describe('clearUserPreferences', () => {
    it('should clear all preferences for a user from both storages', () => {
      saveUserPreference(TEST_ADDRESS, 'a', 1)
      saveUserPreference(TEST_ADDRESS, 'b', 2)
      saveUserPreference(TEST_ADDRESS, 'c', 3, true)

      clearUserPreferences(TEST_ADDRESS)

      expect(getUserPreference(TEST_ADDRESS, 'a')).toBeNull()
      expect(getUserPreference(TEST_ADDRESS, 'b')).toBeNull()
      expect(getUserPreference(TEST_ADDRESS, 'c', null, true)).toBeNull()
    })

    it('should not affect other users preferences', () => {
      const otherAddress = '0x9999999999999999999999999999999999999999'
      saveUserPreference(TEST_ADDRESS, 'key', 'val1')
      saveUserPreference(otherAddress, 'key', 'val2')

      clearUserPreferences(TEST_ADDRESS)

      expect(getUserPreference(TEST_ADDRESS, 'key')).toBeNull()
      expect(getUserPreference(otherAddress, 'key')).toBe('val2')
    })

    it('should not throw when user has no preferences', () => {
      expect(() => clearUserPreferences(TEST_ADDRESS)).not.toThrow()
    })

    it('should handle storage errors gracefully', () => {
      // Add an item so the loop runs and hits the mocked key()
      saveUserPreference(TEST_ADDRESS, 'x', 'y')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new Error('Storage error')
      })
      expect(() => clearUserPreferences(TEST_ADDRESS)).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  describe('saveGlobalPreference', () => {
    it('should save a global preference', () => {
      saveGlobalPreference('language', 'en')
      expect(getGlobalPreference('language')).toBe('en')
    })

    it('should update existing global preference', () => {
      saveGlobalPreference('language', 'en')
      saveGlobalPreference('language', 'fr')
      expect(getGlobalPreference('language')).toBe('fr')
    })

    it('should preserve other global preferences when adding new one', () => {
      saveGlobalPreference('lang', 'en')
      saveGlobalPreference('theme', 'dark')
      expect(getGlobalPreference('lang')).toBe('en')
      expect(getGlobalPreference('theme')).toBe('dark')
    })

    it('should handle storage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage error')
      })
      expect(() => saveGlobalPreference('key', 'val')).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should save complex values', () => {
      saveGlobalPreference('config', { a: 1, b: [2, 3] })
      expect(getGlobalPreference('config')).toEqual({ a: 1, b: [2, 3] })
    })
  })

  describe('getGlobalPreference', () => {
    it('should return defaultValue when preference does not exist', () => {
      expect(getGlobalPreference('missing', 'default')).toBe('default')
    })

    it('should return null as default when no defaultValue specified', () => {
      expect(getGlobalPreference('missing')).toBeNull()
    })

    it('should return stored value', () => {
      saveGlobalPreference('key', 'value')
      expect(getGlobalPreference('key')).toBe('value')
    })

    it('should handle parse errors by returning defaultValue', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem(GLOBAL_KEY, 'not-json')
      expect(getGlobalPreference('key', 'fallback')).toBe('fallback')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should distinguish between undefined and null stored values', () => {
      saveGlobalPreference('nullVal', null)
      // null is stored, so it should return null (not the default)
      expect(getGlobalPreference('nullVal', 'default')).toBeNull()
    })
  })

  describe('getGlobalPreferences', () => {
    it('should return empty object when no preferences stored', () => {
      expect(getGlobalPreferences()).toEqual({})
    })

    it('should return all global preferences', () => {
      saveGlobalPreference('a', 1)
      saveGlobalPreference('b', 'two')
      const prefs = getGlobalPreferences()
      expect(prefs).toEqual({ a: 1, b: 'two' })
    })

    it('should handle parse errors by returning empty object', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem(GLOBAL_KEY, 'bad-json')
      expect(getGlobalPreferences()).toEqual({})
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })
})
