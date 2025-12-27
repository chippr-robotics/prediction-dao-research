import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateTheme } from '../utils/validateTheme'

describe('validateTheme', () => {
  let consoleWarnSpy
  let mockGetComputedStyle

  beforeEach(() => {
    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore console.warn
    consoleWarnSpy.mockRestore()
    
    // Restore getComputedStyle if it was mocked
    if (mockGetComputedStyle) {
      mockGetComputedStyle.mockRestore()
      mockGetComputedStyle = null
    }
    
    // Restore environment variables
    vi.unstubAllEnvs()
  })

  describe('development mode', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'development')
    })

    it('should not warn when all required CSS variables are defined', () => {
      // Mock getComputedStyle to return all required variables
      mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: vi.fn((varName) => {
          const values = {
            '--brand-primary': '#36B37E',
            '--brand-secondary': '#4C9AFF',
            '--bg-primary': '#F7F9FA',
            '--bg-secondary': '#FFFFFF',
            '--text-primary': '#1F2933',
            '--text-secondary': '#5A6772',
            '--primary-button': '#36B37E',
            '--primary-button-hover': '#2F9E6E',
          }
          return values[varName] || ''
        })
      })

      validateTheme()

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should warn when CSS variables are missing', () => {
      // Mock getComputedStyle to return empty values
      mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: vi.fn(() => '')
      })

      validateTheme()

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Missing CSS variables:')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--brand-primary')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('platform-clearpath or platform-fairwins')
      )
    })

    it('should warn when some CSS variables are missing', () => {
      // Mock getComputedStyle to return some values but not all
      mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: vi.fn((varName) => {
          const values = {
            '--brand-primary': '#36B37E',
            '--brand-secondary': '#4C9AFF',
            '--bg-primary': '#F7F9FA',
            '--bg-secondary': '#FFFFFF',
            // Missing: text-primary, text-secondary, primary-button, primary-button-hover
          }
          return values[varName] || ''
        })
      })

      validateTheme()

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--text-primary')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--text-secondary')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--primary-button')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--primary-button-hover')
      )
    })

    it('should handle whitespace-only values as missing', () => {
      // Mock getComputedStyle to return whitespace values
      mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: vi.fn(() => '  ')
      })

      validateTheme()

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Missing CSS variables:')
      )
    })
  })

  describe('production mode', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'production')
    })

    it('should not check or warn in production mode', () => {
      // Mock getComputedStyle to return empty values (which would trigger warnings in dev)
      mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: vi.fn(() => '')
      })

      validateTheme()

      expect(consoleWarnSpy).not.toHaveBeenCalled()
      // Verify getComputedStyle was not called at all in production
      expect(mockGetComputedStyle).not.toHaveBeenCalled()
    })
  })

  describe('test mode', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'test')
    })

    it('should not check or warn in test mode', () => {
      mockGetComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: vi.fn(() => '')
      })

      validateTheme()

      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(mockGetComputedStyle).not.toHaveBeenCalled()
    })
  })
})
