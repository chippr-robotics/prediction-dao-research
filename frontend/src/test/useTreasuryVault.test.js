import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock config
vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => null), // Treasury not deployed
  DEPLOYED_CONTRACTS: { fairWinsToken: null },
  NETWORK_CONFIG: { rpcUrl: 'http://localhost:8545' },
}))

import { useTreasuryVault } from '../hooks/useTreasuryVault'

describe('useTreasuryVault', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state when treasury not deployed', () => {
    const { result } = renderHook(() => useTreasuryVault())

    expect(result.current.isTreasuryAvailable).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.treasuryState.ethBalance).toBe('0')
    expect(result.current.treasuryState.fairWinsBalance).toBe('0')
    expect(result.current.treasuryState.isPaused).toBe(false)
  })

  it('should expose all expected write functions', () => {
    const { result } = renderHook(() => useTreasuryVault())

    expect(typeof result.current.withdrawETH).toBe('function')
    expect(typeof result.current.withdrawERC20).toBe('function')
    expect(typeof result.current.authorizeSpender).toBe('function')
    expect(typeof result.current.revokeSpender).toBe('function')
    expect(typeof result.current.setTransactionLimit).toBe('function')
    expect(typeof result.current.setRateLimit).toBe('function')
    expect(typeof result.current.pauseVault).toBe('function')
    expect(typeof result.current.unpauseVault).toBe('function')
  })

  it('should expose fetch functions', () => {
    const { result } = renderHook(() => useTreasuryVault())

    expect(typeof result.current.fetchTreasuryState).toBe('function')
    expect(typeof result.current.checkSpenderAuthorization).toBe('function')
  })

  it('should have correct computed properties when no account', () => {
    const { result } = renderHook(() => useTreasuryVault())

    expect(result.current.canWithdraw).toBe(false)
    expect(result.current.isOwner).toBeFalsy()
    expect(result.current.isGuardian).toBeFalsy()
  })

  it('should throw on withdrawETH when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())

    await expect(
      result.current.withdrawETH('0x1234567890123456789012345678901234567890', '1.0')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on withdrawERC20 when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())

    await expect(
      result.current.withdrawERC20(
        '0xtoken',
        '0x1234567890123456789012345678901234567890',
        '100'
      )
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on authorizeSpender when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())

    await expect(
      result.current.authorizeSpender('0x1234567890123456789012345678901234567890')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on revokeSpender when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())

    await expect(
      result.current.revokeSpender('0x1234567890123456789012345678901234567890')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on setTransactionLimit when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())

    await expect(
      result.current.setTransactionLimit('0x0000000000000000000000000000000000000000', '10')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on setRateLimit when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())

    await expect(
      result.current.setRateLimit('0x0000000000000000000000000000000000000000', 3600, '100')
    ).rejects.toThrow('Wallet not connected')
  })

  it('should throw on pauseVault when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())
    await expect(result.current.pauseVault()).rejects.toThrow('Wallet not connected')
  })

  it('should throw on unpauseVault when no write contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())
    await expect(result.current.unpauseVault()).rejects.toThrow('Wallet not connected')
  })

  it('should return false from checkSpenderAuthorization when no contract', async () => {
    const { result } = renderHook(() => useTreasuryVault())
    const isAuthorized = await result.current.checkSpenderAuthorization(
      '0x1234567890123456789012345678901234567890'
    )
    expect(isAuthorized).toBe(false)
  })

  it('should expose contract address and token address', () => {
    const { result } = renderHook(() => useTreasuryVault())
    expect(result.current.contractAddress).toBeNull()
    expect(result.current.fairWinsTokenAddress).toBeNull()
    expect(result.current.ETH_ADDRESS).toBe('0x0000000000000000000000000000000000000000')
  })
})
