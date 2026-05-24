/**
 * Tests for DexContext / DexProvider — targeting 70% coverage.
 * Mock wagmi + ethers, test DEX state management, tokens, addresses,
 * and balance-related logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React, { useContext } from 'react'
import { DexContext } from '../contexts/DexContext'

// Mock useWallet from useWalletManagement
vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: vi.fn(() => ({
    provider: null,
    signer: null,
    address: '0x1234567890123456789012345678901234567890',
    isConnected: false,
  })),
}))

// Mock dex constants
vi.mock('../constants/dex', () => ({
  FEE_TIERS: { LOW: 500, MEDIUM: 3000, HIGH: 10000 },
  DEFAULT_SLIPPAGE: 50,
}))

// Mock ABIs
vi.mock('../abis/ERC20', () => ({ ERC20_ABI: [] }))
vi.mock('../abis/WNative', () => ({ WNATIVE_ABI: [] }))
vi.mock('../abis/SwapRouter02', () => ({ SWAP_ROUTER_02_ABI: [] }))
vi.mock('../abis/QuoterV2', () => ({ QUOTER_V2_ABI: [] }))

// Import after mocks
import { DexProvider } from '../contexts/DexContext.jsx'

function wrapper({ children }) {
  return <DexProvider>{children}</DexProvider>
}

function useDex() {
  return useContext(DexContext)
}

describe('DexProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides initial balances of zero', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.balances).toEqual({
      native: '0',
      wnative: '0',
      stable: '0',
    })
  })

  it('provides empty balance history', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.balanceHistory).toEqual([])
  })

  it('provides loading=false initially', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.loading).toBe(false)
  })

  it('provides quotingPrice=false initially', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.quotingPrice).toBe(false)
  })

  it('provides default slippage', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.slippage).toBe(50)
  })

  it('provides tokens with NATIVE, WNATIVE, and STABLE', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.tokens.NATIVE).toBeDefined()
    expect(result.current.tokens.WNATIVE).toBeDefined()
    expect(result.current.tokens.STABLE).toBeDefined()
  })

  it('NATIVE token has address "native"', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.tokens.NATIVE.address).toBe('native')
  })

  it('provides addresses object', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.addresses).toBeDefined()
    expect(result.current.addresses.FACTORY).toBeDefined()
    expect(result.current.addresses.SWAP_ROUTER_02).toBeDefined()
    expect(result.current.addresses.QUOTER_V2).toBeDefined()
    expect(result.current.addresses.PERMIT2).toBeDefined()
  })

  it('provides chainId', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(typeof result.current.chainId).toBe('number')
  })

  it('provides network object', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(result.current.network).toBeDefined()
  })

  it('provides function references for swap operations', () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    expect(typeof result.current.fetchBalances).toBe('function')
    expect(typeof result.current.wrapNative).toBe('function')
    expect(typeof result.current.unwrapNative).toBe('function')
    expect(typeof result.current.getQuote).toBe('function')
    expect(typeof result.current.swap).toBe('function')
    expect(typeof result.current.setSlippage).toBe('function')
  })

  it('wrapNative throws when wallet not connected', async () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    await expect(result.current.wrapNative('1.0')).rejects.toThrow('Wallet not connected')
  })

  it('unwrapNative throws when wallet not connected', async () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    await expect(result.current.unwrapNative('1.0')).rejects.toThrow('Wallet not connected')
  })

  it('getQuote throws when DEX not available', async () => {
    const { result } = renderHook(() => useDex(), { wrapper })
    await expect(result.current.getQuote('0x1', '0x2', '1.0')).rejects.toThrow()
  })
})
