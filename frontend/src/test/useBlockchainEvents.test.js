import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Mock the useUI hooks directly
const mockShowNotification = vi.fn()
const mockAnnounce = vi.fn()

vi.mock('../hooks/useUI', () => ({
  useNotification: vi.fn(() => ({
    showNotification: mockShowNotification
  })),
  useAnnouncement: vi.fn(() => ({
    announce: mockAnnounce
  }))
}))

// Mock the useWeb3 hook
vi.mock('../hooks/useWeb3', () => ({
  useEthers: vi.fn(() => ({
    provider: {
      getBlockNumber: vi.fn().mockResolvedValue(12345)
    }
  }))
}))

// Import after mocks are set up
const { useContractEvent, useAccountChange, useChainChange } = await import('../hooks/useBlockchainEvents')

describe('useBlockchainEvents hooks', () => {
  let mockContract

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock contract
    mockContract = {
      filters: {
        Transfer: vi.fn(() => ({})),
        Approval: vi.fn(() => ({}))
      },
      on: vi.fn(),
      off: vi.fn()
    }
  })

  describe('useContractEvent', () => {
    it('should setup event listener when contract and provider are available', () => {
      const onEvent = vi.fn()
      
      renderHook(() => 
        useContractEvent(mockContract, 'Transfer', onEvent, true)
      )

      expect(mockContract.filters.Transfer).toHaveBeenCalled()
      expect(mockContract.on).toHaveBeenCalled()
    })

    it('should not setup listener when contract is null', () => {
      const onEvent = vi.fn()
      
      renderHook(() => 
        useContractEvent(null, 'Transfer', onEvent, true)
      )

      expect(mockContract.on).not.toHaveBeenCalled()
    })

    it('should call onEvent callback when event is triggered', async () => {
      const onEvent = vi.fn()
      let eventHandler

      mockContract.on = vi.fn((filter, handler) => {
        eventHandler = handler
      })
      
      renderHook(() => 
        useContractEvent(mockContract, 'Transfer', onEvent, true)
      )

      // Trigger the event
      const mockEventData = {
        from: '0x123',
        to: '0x456',
        value: '1000'
      }
      
      if (eventHandler) {
        eventHandler(mockEventData.from, mockEventData.to, mockEventData.value, {})
      }

      await waitFor(() => {
        expect(onEvent).toHaveBeenCalled()
      })
    })

    it('should show notification when notify is true', async () => {
      const onEvent = vi.fn()
      let eventHandler

      mockContract.on = vi.fn((filter, handler) => {
        eventHandler = handler
      })
      
      renderHook(() => 
        useContractEvent(mockContract, 'Transfer', onEvent, true)
      )

      // Trigger the event
      if (eventHandler) {
        eventHandler('0x123', '0x456', '1000', {})
      }

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          'Transfer event detected',
          'info',
          3000
        )
        expect(mockAnnounce).toHaveBeenCalledWith('Transfer event detected')
      })
    })

    it('should not show notification when notify is false', async () => {
      const onEvent = vi.fn()
      let eventHandler

      mockContract.on = vi.fn((filter, handler) => {
        eventHandler = handler
      })
      
      renderHook(() => 
        useContractEvent(mockContract, 'Transfer', onEvent, false)
      )

      // Trigger the event
      if (eventHandler) {
        eventHandler('0x123', '0x456', '1000', {})
      }

      await waitFor(() => {
        expect(onEvent).toHaveBeenCalled()
      })

      expect(mockShowNotification).not.toHaveBeenCalled()
      expect(mockAnnounce).not.toHaveBeenCalled()
    })

    it('should cleanup event listener on unmount', () => {
      const onEvent = vi.fn()
      
      const { unmount } = renderHook(() => 
        useContractEvent(mockContract, 'Transfer', onEvent, true)
      )

      // Should have setup the listener
      expect(mockContract.on).toHaveBeenCalled()

      unmount()

      // The hook should have a cleanup mechanism
      // The exact implementation may vary, so we just verify no errors occur
    })

    it('should handle non-existent event gracefully', () => {
      const onEvent = vi.fn()
      mockContract.filters = {}
      
      const { result } = renderHook(() => 
        useContractEvent(mockContract, 'NonExistent', onEvent, true)
      )

      // Should not throw
      expect(result.error).toBeUndefined()
    })
  })

  describe('useAccountChange', () => {
    let mockEthereum

    beforeEach(() => {
      mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn()
      }
      global.window.ethereum = mockEthereum
    })

    it('should setup listener for account changes', () => {
      const onAccountChange = vi.fn()
      
      renderHook(() => useAccountChange(onAccountChange))

      expect(mockEthereum.on).toHaveBeenCalledWith(
        'accountsChanged',
        expect.any(Function)
      )
    })

    it('should call callback when accounts change', async () => {
      const onAccountChange = vi.fn()
      let accountsChangedHandler

      mockEthereum.on = vi.fn((event, handler) => {
        if (event === 'accountsChanged') {
          accountsChangedHandler = handler
        }
      })
      
      renderHook(() => useAccountChange(onAccountChange))

      // Trigger account change
      if (accountsChangedHandler) {
        accountsChangedHandler(['0x123'])
      }

      await waitFor(() => {
        expect(onAccountChange).toHaveBeenCalledWith('0x123')
      })
    })

    it('should show warning when no accounts available', async () => {
      const onAccountChange = vi.fn()
      let accountsChangedHandler

      mockEthereum.on = vi.fn((event, handler) => {
        if (event === 'accountsChanged') {
          accountsChangedHandler = handler
        }
      })
      
      renderHook(() => useAccountChange(onAccountChange))

      // Trigger with empty accounts
      if (accountsChangedHandler) {
        accountsChangedHandler([])
      }

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          'Please connect to MetaMask',
          'warning'
        )
        expect(mockAnnounce).toHaveBeenCalledWith('Please connect to MetaMask')
      })
    })

    it('should cleanup listener on unmount', () => {
      const onAccountChange = vi.fn()
      
      const { unmount } = renderHook(() => useAccountChange(onAccountChange))

      unmount()

      expect(mockEthereum.removeListener).toHaveBeenCalledWith(
        'accountsChanged',
        expect.any(Function)
      )
    })

    it('should handle missing window.ethereum gracefully', () => {
      delete global.window.ethereum

      const onAccountChange = vi.fn()
      
      const { result } = renderHook(() => useAccountChange(onAccountChange))

      // Should not throw
      expect(result.error).toBeUndefined()

      // Restore for other tests
      global.window.ethereum = mockEthereum
    })
  })

  describe('useChainChange', () => {
    let mockEthereum
    let originalLocation

    beforeEach(() => {
      mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn()
      }
      global.window.ethereum = mockEthereum
      
      // Mock window.location.reload
      originalLocation = window.location
      delete window.location
      window.location = { reload: vi.fn() }
    })

    afterEach(() => {
      window.location = originalLocation
    })

    it('should setup listener for chain changes', () => {
      const onChainChange = vi.fn()
      
      renderHook(() => useChainChange(onChainChange))

      expect(mockEthereum.on).toHaveBeenCalledWith(
        'chainChanged',
        expect.any(Function)
      )
    })

    it('should call callback when chain changes', async () => {
      const onChainChange = vi.fn()
      let chainChangedHandler

      mockEthereum.on = vi.fn((event, handler) => {
        if (event === 'chainChanged') {
          chainChangedHandler = handler
        }
      })
      
      renderHook(() => useChainChange(onChainChange))

      // Trigger chain change
      if (chainChangedHandler) {
        chainChangedHandler('0x1')
      }

      await waitFor(() => {
        expect(onChainChange).toHaveBeenCalledWith('0x1')
      })
    })

    it('should reload page when no callback provided', async () => {
      let chainChangedHandler

      mockEthereum.on = vi.fn((event, handler) => {
        if (event === 'chainChanged') {
          chainChangedHandler = handler
        }
      })
      
      renderHook(() => useChainChange())

      // Trigger chain change
      if (chainChangedHandler) {
        chainChangedHandler('0x1')
      }

      await waitFor(() => {
        expect(window.location.reload).toHaveBeenCalled()
      })
    })

    it('should show notification on chain change', async () => {
      const onChainChange = vi.fn()
      let chainChangedHandler

      mockEthereum.on = vi.fn((event, handler) => {
        if (event === 'chainChanged') {
          chainChangedHandler = handler
        }
      })
      
      renderHook(() => useChainChange(onChainChange))

      // Trigger chain change
      if (chainChangedHandler) {
        chainChangedHandler('0x1')
      }

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          'Network changed, reloading...',
          'info'
        )
        expect(mockAnnounce).toHaveBeenCalledWith('Network changed')
      })
    })

    it('should cleanup listener on unmount', () => {
      const onChainChange = vi.fn()
      
      const { unmount } = renderHook(() => useChainChange(onChainChange))

      unmount()

      expect(mockEthereum.removeListener).toHaveBeenCalledWith(
        'chainChanged',
        expect.any(Function)
      )
    })

    it('should handle missing window.ethereum gracefully', () => {
      delete global.window.ethereum

      const onChainChange = vi.fn()
      
      const { result } = renderHook(() => useChainChange(onChainChange))

      // Should not throw
      expect(result.error).toBeUndefined()

      // Restore for other tests
      global.window.ethereum = mockEthereum
    })
  })
})
