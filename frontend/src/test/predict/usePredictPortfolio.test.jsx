/**
 * usePredictPositions / usePredictOpenOrders (spec 057 US2/US3) — per-address reads: soft-fail off
 * Polygon (no fetch), load on connect, degrade on error.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useChainId } from 'wagmi'
import { WalletContext } from '../../contexts/WalletContext.js'
import { usePredictPositions, usePredictOpenOrders } from '../../hooks/usePredictPortfolio'
import * as client from '../../lib/predict/predictClient'

vi.mock('../../lib/predict/predictClient', () => ({
  predictAvailable: vi.fn(() => true),
  fetchPositions: vi.fn(),
  fetchOpenOrders: vi.fn(),
}))

const TRADER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const wrapperFor = (wallet) => ({ children }) => <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>

beforeEach(() => {
  vi.clearAllMocks()
  useChainId.mockReturnValue(137)
  client.predictAvailable.mockReturnValue(true)
})

describe('usePredictPositions', () => {
  it('loads positions for a connected wallet', async () => {
    client.fetchPositions.mockResolvedValue({ positions: [{ tokenId: '1', outcome: 'Yes', size: '10' }] })
    const { result } = renderHook(() => usePredictPositions(), { wrapper: wrapperFor({ address: TRADER, isConnected: true }) })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions).toHaveLength(1)
  })

  it('does NOT fetch when unsupported (off Polygon)', async () => {
    client.predictAvailable.mockReturnValue(false)
    const { result } = renderHook(() => usePredictPositions(), { wrapper: wrapperFor({ address: TRADER, isConnected: true }) })
    expect(result.current.status).toBe('unsupported')
    expect(client.fetchPositions).not.toHaveBeenCalled()
  })

  it('degrades on error', async () => {
    client.fetchPositions.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => usePredictPositions(), { wrapper: wrapperFor({ address: TRADER, isConnected: true }) })
    await waitFor(() => expect(result.current.status).toBe('degraded'))
  })
})

describe('usePredictOpenOrders', () => {
  it('loads open orders for a connected wallet', async () => {
    client.fetchOpenOrders.mockResolvedValue({ orders: [{ orderId: '0xo1', side: 'BUY' }] })
    const { result } = renderHook(() => usePredictOpenOrders(), { wrapper: wrapperFor({ address: TRADER, isConnected: true }) })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.orders).toHaveLength(1)
  })

  it('is disconnected without a wallet', () => {
    const { result } = renderHook(() => usePredictOpenOrders(), { wrapper: wrapperFor({}) })
    expect(result.current.status).toBe('disconnected')
  })
})
