import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React, { useContext } from 'react'

// Mock wagmi
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({
    address: null,
    isConnected: false,
  })),
  useConnect: vi.fn(() => ({ connect: vi.fn(), connectors: [] })),
  useDisconnect: vi.fn(() => ({ disconnect: vi.fn() })),
  useChainId: vi.fn(() => 61),
  useSwitchChain: vi.fn(() => ({ switchChain: vi.fn() })),
  useWalletClient: vi.fn(() => ({ data: null })),
  WagmiProvider: ({ children }) => children,
  createConfig: vi.fn(() => ({})),
  http: vi.fn(() => ({})),
}))

// Mock the blockchain service
const mockFetchFriendMarketsForUser = vi.fn()
vi.mock('../utils/blockchainService', () => ({
  fetchFriendMarketsForUser: (...args) => mockFetchFriendMarketsForUser(...args),
}))

// We also need to mock the FriendMarketsContext import used by the provider itself
// The provider file imports from './FriendMarketsContext' for the context object
vi.mock('../contexts/FriendMarketsContext', async (importOriginal) => {
  const actual = await importOriginal()
  return actual
})

import { FriendMarketsContext } from '../contexts/FriendMarketsContext'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

// Test consumer component
function TestConsumer() {
  const ctx = useContext(FriendMarketsContext)
  if (!ctx) return <p>No context</p>
  return (
    <div>
      <p>Markets: {ctx.friendMarkets.length}</p>
      <p>Loading: {String(ctx.loading)}</p>
      <button onClick={ctx.refresh}>Refresh</button>
      <button onClick={() => ctx.addMarket({ id: 'new', contractAddress: 'addr' })}>
        Add
      </button>
    </div>
  )
}

describe('FriendMarketsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockFetchFriendMarketsForUser.mockResolvedValue([])
  })

  describe('loadFromStorage / saveToStorage', () => {
    it('should load from localStorage on init', async () => {
      const stored = [{ id: '1', contractAddress: 'addr', uniqueId: 'addr-1' }]
      localStorageMock.getItem.mockReturnValue(JSON.stringify(stored))

      // Import the provider fresh
      const { FriendMarketsProvider } = await import('../contexts/FriendMarketsContext.jsx')

      render(
        <FriendMarketsProvider>
          <TestConsumer />
        </FriendMarketsProvider>
      )

      expect(screen.getByText('Markets: 1')).toBeInTheDocument()
    })

    it('should handle corrupted localStorage data', async () => {
      localStorageMock.getItem.mockReturnValue('not valid json')

      const { FriendMarketsProvider } = await import('../contexts/FriendMarketsContext.jsx')

      render(
        <FriendMarketsProvider>
          <TestConsumer />
        </FriendMarketsProvider>
      )

      // Should default to empty array
      expect(screen.getByText('Markets: 0')).toBeInTheDocument()
    })

    it('should handle null localStorage', async () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { FriendMarketsProvider } = await import('../contexts/FriendMarketsContext.jsx')

      render(
        <FriendMarketsProvider>
          <TestConsumer />
        </FriendMarketsProvider>
      )

      expect(screen.getByText('Markets: 0')).toBeInTheDocument()
    })
  })

  describe('addMarket', () => {
    it('should optimistically add a market to state', async () => {
      localStorageMock.getItem.mockReturnValue(null)

      const { FriendMarketsProvider } = await import('../contexts/FriendMarketsContext.jsx')

      render(
        <FriendMarketsProvider>
          <TestConsumer />
        </FriendMarketsProvider>
      )

      expect(screen.getByText('Markets: 0')).toBeInTheDocument()

      await act(async () => {
        screen.getByText('Add').click()
      })

      expect(screen.getByText('Markets: 1')).toBeInTheDocument()
    })
  })
})
