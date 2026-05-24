import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { DexContext } from '../contexts/DexContext'
import { useDex } from '../hooks/useDex'

describe('useDex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw error when used outside DexProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useDex())
    }).toThrow('useDex must be used within a DexProvider')
    consoleError.mockRestore()
  })

  it('should return context value when inside DexProvider', () => {
    const mockDexValue = {
      tokens: [],
      swapExactInput: vi.fn(),
      isLoading: false,
      error: null,
    }
    const wrapper = ({ children }) => (
      <DexContext.Provider value={mockDexValue}>{children}</DexContext.Provider>
    )
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current).toBe(mockDexValue)
  })

  it('should return updated context value', () => {
    const mockDexValue = {
      tokens: [{ symbol: 'WMATIC', address: '0x123' }],
      swapExactInput: vi.fn(),
      isLoading: true,
      error: 'Network error',
      balance: '100.0',
    }
    const wrapper = ({ children }) => (
      <DexContext.Provider value={mockDexValue}>{children}</DexContext.Provider>
    )
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.tokens).toHaveLength(1)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBe('Network error')
    expect(result.current.balance).toBe('100.0')
  })
})
