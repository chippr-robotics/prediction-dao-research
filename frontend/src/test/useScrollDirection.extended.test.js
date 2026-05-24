/**
 * Extended tests for useScrollDirection — targeting 85% coverage.
 * Covers scroll direction changes via simulated scrollY and the
 * requestAnimationFrame-based throttle logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollDirection, useScrollPast } from '../hooks/useScrollDirection'

describe('useScrollDirection: scroll simulation', () => {
  let scrollListeners

  beforeEach(() => {
    scrollListeners = []

    // Capture scroll listeners registered by the hook
    const originalAddEventListener = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler, opts) => {
      if (event === 'scroll') {
        scrollListeners.push(handler)
      }
      return originalAddEventListener(event, handler, opts)
    })

    // Make requestAnimationFrame run synchronously
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects downward scroll when exceeding threshold', () => {
    const { result } = renderHook(() => useScrollDirection(10))

    // Simulate scrolling down past threshold
    Object.defineProperty(window, 'scrollY', { value: 50, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })

    expect(result.current.scrollDirection).toBe('down')
    expect(result.current.isScrollingDown).toBe(true)
    expect(result.current.isScrollingUp).toBe(false)
    expect(result.current.scrollY).toBe(50)
  })

  it('maintains scroll position on each update', () => {
    const { result } = renderHook(() => useScrollDirection(10))

    // Scroll down
    Object.defineProperty(window, 'scrollY', { value: 200, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })

    expect(result.current.scrollDirection).toBe('down')
    expect(result.current.scrollY).toBe(200)
  })

  it('ignores scroll within threshold', () => {
    const { result } = renderHook(() => useScrollDirection(50))

    // Scroll just 5px - within threshold of 50
    Object.defineProperty(window, 'scrollY', { value: 5, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })

    // Should still be 'up' (initial)
    expect(result.current.scrollDirection).toBe('up')
  })
})

describe('useScrollPast: scroll simulation', () => {
  let scrollListeners

  beforeEach(() => {
    scrollListeners = []

    const originalAddEventListener = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler, opts) => {
      if (event === 'scroll') {
        scrollListeners.push(handler)
      }
      return originalAddEventListener(event, handler, opts)
    })

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when scrolled past offset', () => {
    const { result } = renderHook(() => useScrollPast(50))

    Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })

    expect(result.current).toBe(true)
  })

  it('returns false when scrolled back above offset', () => {
    const { result } = renderHook(() => useScrollPast(50))

    // Scroll past
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })
    expect(result.current).toBe(true)

    // Scroll back
    Object.defineProperty(window, 'scrollY', { value: 10, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })
    expect(result.current).toBe(false)
  })

  it('uses default offset of 100', () => {
    const { result } = renderHook(() => useScrollPast())

    // Scroll just 50 - under default 100
    Object.defineProperty(window, 'scrollY', { value: 50, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })
    expect(result.current).toBe(false)

    // Scroll past 100
    Object.defineProperty(window, 'scrollY', { value: 150, writable: true, configurable: true })
    act(() => {
      scrollListeners.forEach(h => h())
    })
    expect(result.current).toBe(true)
  })
})
