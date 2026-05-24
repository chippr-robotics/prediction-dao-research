import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChainId, useSwitchChain } from 'wagmi'
import { useNetworkMode } from '../hooks/useNetworkMode'

// The wagmi hooks are already mocked globally in setup.js.
// We override them per-test to control behavior.

describe('useNetworkMode hook', () => {
  let mockSwitchChain

  beforeEach(() => {
    mockSwitchChain = vi.fn()
    vi.mocked(useSwitchChain).mockReturnValue({
      switchChain: mockSwitchChain,
      isPending: false,
      error: null,
    })
  })

  describe('mode detection', () => {
    it('should return testnet mode for Polygon Amoy (80002)', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())

      expect(result.current.mode).toBe('testnet')
      expect(result.current.isTestnet).toBe(true)
      expect(result.current.isMainnet).toBe(false)
      expect(result.current.isOtherChain).toBe(false)
    })

    it('should return mainnet mode for Polygon Mainnet (137)', () => {
      vi.mocked(useChainId).mockReturnValue(137)
      const { result } = renderHook(() => useNetworkMode())

      expect(result.current.mode).toBe('mainnet')
      expect(result.current.isMainnet).toBe(true)
      expect(result.current.isTestnet).toBe(false)
      expect(result.current.isOtherChain).toBe(false)
    })

    it('should return other mode for unsupported chains', () => {
      vi.mocked(useChainId).mockReturnValue(1) // Ethereum Mainnet
      const { result } = renderHook(() => useNetworkMode())

      expect(result.current.mode).toBe('other')
      expect(result.current.isOtherChain).toBe(true)
      expect(result.current.isMainnet).toBe(false)
      expect(result.current.isTestnet).toBe(false)
    })

    it('should return other mode for Hardhat (1337)', () => {
      vi.mocked(useChainId).mockReturnValue(1337)
      const { result } = renderHook(() => useNetworkMode())

      expect(result.current.mode).toBe('other')
      expect(result.current.isOtherChain).toBe(true)
    })
  })

  describe('chainId', () => {
    it('should expose the current chainId', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.chainId).toBe(80002)
    })

    it('should expose chainId from wagmi', () => {
      vi.mocked(useChainId).mockReturnValue(137)
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.chainId).toBe(137)
    })
  })

  describe('network config', () => {
    it('should return network config for current chain', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.network).toBeDefined()
      expect(result.current.network.chainId).toBe(80002)
    })
  })

  describe('switchMode', () => {
    it('should switch from testnet to mainnet', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())

      act(() => {
        result.current.switchMode('mainnet')
      })

      expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: 137 })
    })

    it('should switch from mainnet to testnet', () => {
      vi.mocked(useChainId).mockReturnValue(137)
      const { result } = renderHook(() => useNetworkMode())

      act(() => {
        result.current.switchMode('testnet')
      })

      expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: 80002 })
    })

    it('should toggle from testnet to mainnet', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())

      act(() => {
        result.current.switchMode('toggle')
      })

      expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: 137 })
    })

    it('should toggle from mainnet to testnet', () => {
      vi.mocked(useChainId).mockReturnValue(137)
      const { result } = renderHook(() => useNetworkMode())

      act(() => {
        result.current.switchMode('toggle')
      })

      expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: 80002 })
    })

    it('should not call switchChain when already on target chain', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())

      act(() => {
        result.current.switchMode('testnet')
      })

      expect(mockSwitchChain).not.toHaveBeenCalled()
    })

    it('should not call switchChain when mainnet already on mainnet', () => {
      vi.mocked(useChainId).mockReturnValue(137)
      const { result } = renderHook(() => useNetworkMode())

      act(() => {
        result.current.switchMode('mainnet')
      })

      expect(mockSwitchChain).not.toHaveBeenCalled()
    })
  })

  describe('switching state', () => {
    it('should expose isSwitching as false by default', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.isSwitching).toBe(false)
    })

    it('should expose isSwitching when pending', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      vi.mocked(useSwitchChain).mockReturnValue({
        switchChain: mockSwitchChain,
        isPending: true,
        error: null,
      })
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.isSwitching).toBe(true)
    })

    it('should expose error from useSwitchChain', () => {
      const switchError = new Error('User rejected')
      vi.mocked(useChainId).mockReturnValue(80002)
      vi.mocked(useSwitchChain).mockReturnValue({
        switchChain: mockSwitchChain,
        isPending: false,
        error: switchError,
      })
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.error).toBe(switchError)
    })

    it('should have null error by default', () => {
      vi.mocked(useChainId).mockReturnValue(80002)
      const { result } = renderHook(() => useNetworkMode())
      expect(result.current.error).toBeNull()
    })
  })
})
