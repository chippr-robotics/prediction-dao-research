import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsExtraSmall,
  useOrientation,
  useDeviceInfo
} from '../hooks/useMediaQuery'

describe('useMediaQuery hooks', () => {
  beforeEach(() => {
    // The matchMedia mock should already be set up in setup.js
    // But we can make our tests more specific here
  })

  describe('useMediaQuery', () => {
    it('should return false when query does not match', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
      expect(result.current).toBe(false)
    })

    it('should return true when query matches', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
      expect(result.current).toBe(true)
    })

    it('should update when media query changes', () => {
      let mediaQueryHandler = null
      
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn((event, handler) => {
            if (event === 'change') {
              mediaQueryHandler = handler
            }
          }),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
      expect(result.current).toBe(false)

      // Simulate media query change
      act(() => {
        if (mediaQueryHandler) {
          mediaQueryHandler({ matches: true })
        }
      })

      expect(result.current).toBe(true)
    })

    it('should cleanup event listener on unmount', () => {
      const removeEventListener = vi.fn()
      
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener,
        }))
      })

      const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))
      unmount()

      expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })
  })

  describe('useIsMobile', () => {
    it('should return true for mobile viewport', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(max-width: 768px)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useIsMobile())
      expect(result.current).toBe(true)
    })

    it('should return false for desktop viewport', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useIsMobile())
      expect(result.current).toBe(false)
    })
  })

  describe('useIsTablet', () => {
    it('should return true for tablet viewport', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(min-width: 768px) and (max-width: 1024px)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useIsTablet())
      expect(result.current).toBe(true)
    })

    it('should return false for non-tablet viewport', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useIsTablet())
      expect(result.current).toBe(false)
    })
  })

  describe('useIsExtraSmall', () => {
    it('should return true for extra-small viewport (<= 480px)', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(max-width: 480px)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useIsExtraSmall())
      expect(result.current).toBe(true)
    })

    it('should return false for larger viewport', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useIsExtraSmall())
      expect(result.current).toBe(false)
    })
  })

  describe('useOrientation', () => {
    it('should return portrait for portrait orientation', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(orientation: portrait)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useOrientation())
      expect(result.current).toBe('portrait')
    })

    it('should return landscape for landscape orientation', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useOrientation())
      expect(result.current).toBe('landscape')
    })
  })

  describe('useDeviceInfo', () => {
    it('should return device info for mobile portrait', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => {
          if (query === '(max-width: 768px)') return {
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }
          if (query === '(orientation: portrait)') return {
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }
          return {
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }
        })
      })

      const { result } = renderHook(() => useDeviceInfo())
      expect(result.current).toEqual({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
        orientation: 'portrait',
        isPortrait: true,
        isLandscape: false
      })
    })

    it('should return device info for desktop landscape', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      })

      const { result } = renderHook(() => useDeviceInfo())
      expect(result.current).toEqual({
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        orientation: 'landscape',
        isPortrait: false,
        isLandscape: true
      })
    })

    it('should return device info for tablet', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => {
          if (query === '(min-width: 768px) and (max-width: 1024px)') return {
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }
          return {
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }
        })
      })

      const { result } = renderHook(() => useDeviceInfo())
      expect(result.current.isTablet).toBe(true)
      expect(result.current.isMobile).toBe(false)
      expect(result.current.isDesktop).toBe(false)
    })
  })
})
