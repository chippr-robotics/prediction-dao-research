import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { WalletContext } from '../contexts/WalletContext'
import { useWeb3, useAccount, useNetwork, useEthers, useWalletLegacy } from '../hooks/useWeb3'

const mockWalletValue = {
  address: '0x1234567890123456789012345678901234567890',
  account: '0x1234567890123456789012345678901234567890',
  isConnected: true,
  chainId: 80002,
  networkError: null,
  isCorrectNetwork: true,
  switchNetwork: vi.fn(),
  provider: { getBalance: vi.fn() },
  signer: { signMessage: vi.fn() },
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
}

function createWrapper(value = mockWalletValue) {
  return function Wrapper({ children }) {
    return (
      <WalletContext.Provider value={value}>
        {children}
      </WalletContext.Provider>
    )
  }
}

describe('useWeb3 hook', () => {
  it('should return wallet context when used within WalletProvider', () => {
    const { result } = renderHook(() => useWeb3(), {
      wrapper: createWrapper(),
    })
    expect(result.current).toEqual(mockWalletValue)
  })

  it('should throw error when used outside WalletProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useWeb3())
    }).toThrow('useWeb3 must be used within a WalletProvider')
    consoleError.mockRestore()
  })

  it('should reflect connected state', () => {
    const { result } = renderHook(() => useWeb3(), {
      wrapper: createWrapper(),
    })
    expect(result.current.isConnected).toBe(true)
    expect(result.current.address).toBe('0x1234567890123456789012345678901234567890')
  })

  it('should reflect disconnected state', () => {
    const disconnectedValue = {
      ...mockWalletValue,
      isConnected: false,
      address: null,
      account: null,
    }
    const { result } = renderHook(() => useWeb3(), {
      wrapper: createWrapper(disconnectedValue),
    })
    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBeNull()
  })
})

describe('useAccount hook', () => {
  it('should return account and isConnected', () => {
    const { result } = renderHook(() => useAccount(), {
      wrapper: createWrapper(),
    })
    expect(result.current.account).toBe('0x1234567890123456789012345678901234567890')
    expect(result.current.isConnected).toBe(true)
  })

  it('should reflect disconnected state', () => {
    const disconnectedValue = {
      ...mockWalletValue,
      isConnected: false,
      account: null,
    }
    const { result } = renderHook(() => useAccount(), {
      wrapper: createWrapper(disconnectedValue),
    })
    expect(result.current.isConnected).toBe(false)
    expect(result.current.account).toBeNull()
  })

  it('should throw when used outside WalletProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useAccount())
    }).toThrow('useWeb3 must be used within a WalletProvider')
    consoleError.mockRestore()
  })
})

describe('useNetwork hook', () => {
  it('should return network state', () => {
    const { result } = renderHook(() => useNetwork(), {
      wrapper: createWrapper(),
    })
    expect(result.current.chainId).toBe(80002)
    expect(result.current.isCorrectNetwork).toBe(true)
    expect(result.current.networkError).toBeNull()
    expect(typeof result.current.switchNetwork).toBe('function')
  })

  it('should reflect network error', () => {
    const errorValue = {
      ...mockWalletValue,
      networkError: 'Wrong network',
      isCorrectNetwork: false,
    }
    const { result } = renderHook(() => useNetwork(), {
      wrapper: createWrapper(errorValue),
    })
    expect(result.current.networkError).toBe('Wrong network')
    expect(result.current.isCorrectNetwork).toBe(false)
  })

  it('should expose switchNetwork function', () => {
    const { result } = renderHook(() => useNetwork(), {
      wrapper: createWrapper(),
    })
    result.current.switchNetwork()
    expect(mockWalletValue.switchNetwork).toHaveBeenCalled()
  })
})

describe('useEthers hook', () => {
  it('should return provider and signer', () => {
    const { result } = renderHook(() => useEthers(), {
      wrapper: createWrapper(),
    })
    expect(result.current.provider).toBeDefined()
    expect(result.current.signer).toBeDefined()
  })

  it('should return null provider/signer when disconnected', () => {
    const disconnectedValue = {
      ...mockWalletValue,
      provider: null,
      signer: null,
    }
    const { result } = renderHook(() => useEthers(), {
      wrapper: createWrapper(disconnectedValue),
    })
    expect(result.current.provider).toBeNull()
    expect(result.current.signer).toBeNull()
  })
})

describe('useWalletLegacy hook', () => {
  it('should return connect/disconnect functions and state', () => {
    const { result } = renderHook(() => useWalletLegacy(), {
      wrapper: createWrapper(),
    })
    expect(result.current.isConnected).toBe(true)
    expect(typeof result.current.connectWallet).toBe('function')
    expect(typeof result.current.disconnectWallet).toBe('function')
  })

  it('should expose connectWallet function', () => {
    const { result } = renderHook(() => useWalletLegacy(), {
      wrapper: createWrapper(),
    })
    result.current.connectWallet()
    expect(mockWalletValue.connectWallet).toHaveBeenCalled()
  })

  it('should expose disconnectWallet function', () => {
    const { result } = renderHook(() => useWalletLegacy(), {
      wrapper: createWrapper(),
    })
    result.current.disconnectWallet()
    expect(mockWalletValue.disconnectWallet).toHaveBeenCalled()
  })
})
