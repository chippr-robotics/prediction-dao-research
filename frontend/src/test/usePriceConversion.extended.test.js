/**
 * Extended tests for usePriceConversion — targeting 85% coverage.
 * Covers formatPrice showBoth mode, compact formatting, native-mode display,
 * and lastUpdate / refreshPrice.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import usePriceConversion from '../hooks/usePriceConversion'

describe('usePriceConversion: extended coverage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('sets lastUpdate after fetching', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.lastUpdate).not.toBeNull()
    expect(result.current.lastUpdate).toBeInstanceOf(Date)
  })

  it('exposes nativeUsdRate as alias of etcUsdRate', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.nativeUsdRate).toBe(result.current.etcUsdRate)
  })

  it('formatPrice: native mode (showUsd=false)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    // Toggle to native display
    act(() => {
      result.current.toggleCurrency()
    })
    expect(result.current.showUsd).toBe(false)

    // Should show MATIC amount
    const formatted = result.current.formatPrice(10)
    expect(formatted).toContain('MATIC')
    expect(formatted).toContain('10.00')
  })

  it('formatPrice: showBoth=true with showUsd=true', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    const formatted = result.current.formatPrice(10, { showBoth: true })
    // Should show USD primary with native in parens
    expect(formatted).toContain('$')
    expect(formatted).toContain('MATIC')
    expect(formatted).toContain('(')
  })

  it('formatPrice: showBoth=true with showUsd=false', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    act(() => {
      result.current.toggleCurrency()
    })

    const formatted = result.current.formatPrice(10, { showBoth: true })
    // Should show native primary with USD in parens
    expect(formatted).toMatch(/MATIC.*\(/)
    expect(formatted).toContain('$')
  })

  it('formatPrice: compact with large USD value (>= $1M)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    // 2M MATIC * 0.5 = $1M
    const formatted = result.current.formatPrice(2000000, { compact: true })
    expect(formatted).toContain('M')
  })

  it('formatPrice: compact with mid USD value (>= $1K)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    // 4000 MATIC * 0.5 = $2000
    const formatted = result.current.formatPrice(4000, { compact: true })
    expect(formatted).toContain('K')
  })

  it('formatPrice: compact with large native value (>=1000 MATIC)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    act(() => {
      result.current.toggleCurrency()
    })

    // 5000 MATIC in native mode, compact
    const formatted = result.current.formatPrice(5000, { compact: true })
    expect(formatted).toContain('K')
    expect(formatted).toContain('MATIC')
  })

  it('formatPrice: custom symbol', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    act(() => {
      result.current.toggleCurrency()
    })

    const formatted = result.current.formatPrice(10, { symbol: 'POL' })
    expect(formatted).toContain('POL')
  })

  it('formatPrice: custom decimals', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    const formatted = result.current.formatPrice(1, { decimals: 4 })
    expect(formatted).toBe('$0.5000')
  })

  it('formatPrice: handles zero / NaN amount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.formatPrice(0)).toBe('$0.00')
    expect(result.current.formatPrice(null)).toBe('$0.00')
    expect(result.current.formatPrice('not-a-number')).toBe('$0.00')
  })

  it('refreshPrice can be called manually', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'matic-network': { usd: 0.5 } }),
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    await act(async () => {
      await result.current.refreshPrice()
    })

    expect(result.current.etcUsdRate).toBe(0.5)
  })
})
