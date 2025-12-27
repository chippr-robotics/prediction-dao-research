import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import usePriceConversion from '../hooks/usePriceConversion'

describe('usePriceConversion hook', () => {
  let fetchMock

  beforeEach(() => {
    // Mock global fetch
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should initialize with loading state', () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.50 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    expect(result.current.loading).toBe(true)
    expect(result.current.etcUsdRate).toBeNull()
    expect(result.current.showUsd).toBe(true)
  })

  it('should fetch ETC price successfully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.50 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.etcUsdRate).toBe(25.50)
    expect(result.current.error).toBeNull()
  })

  it('should handle fetch errors gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.error).toBe('Network error')
    expect(result.current.etcUsdRate).toBe(20) // fallback value
  })

  it('should toggle currency display', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.50 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.showUsd).toBe(true)

    act(() => {
      result.current.toggleCurrency()
    })

    expect(result.current.showUsd).toBe(false)
  })

  it('should convert ETC to USD correctly', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.00 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.convertToUsd(1)).toBe(25.00)
    expect(result.current.convertToUsd(2)).toBe(50.00)
  })

  it('should handle null values in convertToUsd', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.00 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.convertToUsd(null)).toBe(0)
    expect(result.current.convertToUsd(undefined)).toBe(0)
  })

  it('should format price in USD by default', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.00 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.formatPrice(1)).toBe('$25.00')
  })

  it('should format price with compact notation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ 'ethereum-classic': { usd: 25.00 } })
    })

    const { result } = renderHook(() => usePriceConversion())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.formatPrice(1000, { compact: true })).toBe('$25.0K')
  })
})
