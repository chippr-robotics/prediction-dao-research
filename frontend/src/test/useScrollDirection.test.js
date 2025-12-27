import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollDirection, useScrollPast } from '../hooks/useScrollDirection'

describe('useScrollDirection hooks', () => {
  beforeEach(() => {
    // Mock requestAnimationFrame
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame = vi.fn((callback) => {
        callback()
        return 1
      })
    }
  })

  describe('useScrollDirection', () => {
    it('should initialize with up direction and scrollY 0', () => {
      const { result } = renderHook(() => useScrollDirection())
      
      expect(result.current.scrollDirection).toBe('up')
      expect(result.current.scrollY).toBe(0)
      expect(result.current.isScrollingUp).toBe(true)
      expect(result.current.isScrollingDown).toBe(false)
    })

    it('should add scroll event listener', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      
      renderHook(() => useScrollDirection())
      
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        { passive: true }
      )
      
      addEventListenerSpy.mockRestore()
    })

    it('should cleanup event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      
      const { unmount } = renderHook(() => useScrollDirection())
      
      unmount()
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function)
      )
      
      removeEventListenerSpy.mockRestore()
    })

    it('should respect custom threshold parameter', () => {
      const { result: result10 } = renderHook(() => useScrollDirection(10))
      const { result: result50 } = renderHook(() => useScrollDirection(50))
      
      // Both should initialize with same values regardless of threshold
      expect(result10.current.scrollDirection).toBe('up')
      expect(result50.current.scrollDirection).toBe('up')
    })
  })

  describe('useScrollPast', () => {
    beforeEach(() => {
      // Mock window.scrollY
      Object.defineProperty(window, 'scrollY', {
        writable: true,
        configurable: true,
        value: 0,
      })
    })

    it('should initialize as false when scroll is below offset', () => {
      const { result } = renderHook(() => useScrollPast(100))
      
      expect(result.current).toBe(false)
    })

    it('should add scroll event listener', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      
      renderHook(() => useScrollPast(100))
      
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        { passive: true }
      )
      
      addEventListenerSpy.mockRestore()
    })

    it('should cleanup event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      
      const { unmount } = renderHook(() => useScrollPast(100))
      
      unmount()
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function)
      )
      
      removeEventListenerSpy.mockRestore()
    })

    it('should handle custom offset values', () => {
      const { result: result200 } = renderHook(() => useScrollPast(200))
      const { result: result600 } = renderHook(() => useScrollPast(600))
      
      // Both should initialize as false when scrollY is 0
      expect(result200.current).toBe(false)
      expect(result600.current).toBe(false)
    })
  })
})
