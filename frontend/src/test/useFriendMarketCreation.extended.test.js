import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the pure-logic functions from useFriendMarketCreation.js
// The translateRevert tests already exist; this covers localStorage helpers and
// additional translateRevert edge cases.

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      ZeroAddress: actual.ethers.ZeroAddress,
      ZeroHash: actual.ethers.ZeroHash,
      isAddress: actual.ethers.isAddress,
      keccak256: actual.ethers.keccak256,
      toUtf8Bytes: actual.ethers.toUtf8Bytes,
      parseUnits: actual.ethers.parseUnits,
      formatUnits: actual.ethers.formatUnits,
      Contract: vi.fn(),
    },
  }
})

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: vi.fn(() => ({ signer: null })),
}))

vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => '0x1111111111111111111111111111111111111111'),
}))

vi.mock('../abis/WagerRegistry', () => ({
  WAGER_REGISTRY_ABI: [],
}))

vi.mock('../constants/wagerDefaults', () => ({
  ResolutionType: {
    Either: 0,
    Creator: 1,
    Opponent: 2,
    ThirdParty: 3,
    Polymarket: 4,
    ChainlinkDataFeed: 5,
    ChainlinkFunctions: 6,
    UMA: 7,
  },
  ORACLE_RESOLUTION_TYPES: new Set([4, 5, 6, 7]),
}))

vi.mock('../utils/ipfsService', () => ({
  uploadEncryptedEnvelope: vi.fn(),
  buildEncryptedIpfsReference: vi.fn(),
}))

import {
  loadPendingTransaction,
  clearPendingTransaction,
  translateRevert,
} from '../hooks/useFriendMarketCreation'

describe('useFriendMarketCreation: localStorage helpers', () => {
  const PENDING_TX_KEY = 'pendingFriendMarketTx'

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('loadPendingTransaction', () => {
    it('returns null when no pending transaction exists', () => {
      expect(loadPendingTransaction()).toBeNull()
    })

    it('returns stored transaction data', () => {
      const txData = {
        step: 'create',
        txHash: '0xabc',
        timestamp: Date.now(),
      }
      localStorage.setItem(PENDING_TX_KEY, JSON.stringify(txData))
      const result = loadPendingTransaction()
      expect(result).toBeTruthy()
      expect(result.step).toBe('create')
      expect(result.txHash).toBe('0xabc')
    })

    it('returns null for expired transaction (over 1 hour)', () => {
      const txData = {
        step: 'create',
        txHash: '0xabc',
        timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      }
      localStorage.setItem(PENDING_TX_KEY, JSON.stringify(txData))
      const result = loadPendingTransaction()
      expect(result).toBeNull()
    })

    it('returns transaction within the 1-hour window', () => {
      const txData = {
        step: 'create',
        txHash: '0xabc',
        timestamp: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      }
      localStorage.setItem(PENDING_TX_KEY, JSON.stringify(txData))
      const result = loadPendingTransaction()
      expect(result).toBeTruthy()
      expect(result.step).toBe('create')
    })

    it('handles corrupt JSON gracefully', () => {
      localStorage.setItem(PENDING_TX_KEY, 'not-json')
      expect(loadPendingTransaction()).toBeNull()
    })
  })

  describe('clearPendingTransaction', () => {
    it('removes pending transaction from localStorage', () => {
      localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ step: 'create', timestamp: Date.now() }))
      expect(localStorage.getItem(PENDING_TX_KEY)).not.toBeNull()

      clearPendingTransaction()
      expect(localStorage.getItem(PENDING_TX_KEY)).toBeNull()
    })

    it('does not throw when nothing to clear', () => {
      expect(() => clearPendingTransaction()).not.toThrow()
    })
  })
})

describe('useFriendMarketCreation: loadPendingTransaction round-trip', () => {
  it('correctly handles the 1-hour expiry window boundary', () => {
    const PENDING_TX_KEY = 'pendingFriendMarketTx'
    // Exactly at boundary (59 minutes 59 seconds)
    const txData = {
      step: 'create',
      txHash: '0xboundary',
      timestamp: Date.now() - (59 * 60 * 1000 + 59 * 1000),
    }
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify(txData))
    const result = loadPendingTransaction()
    expect(result).toBeTruthy()
    expect(result.txHash).toBe('0xboundary')
  })

  it('does not crash when localStorage throws', () => {
    // clearPendingTransaction is resilient
    const originalRemoveItem = localStorage.removeItem
    localStorage.removeItem = () => { throw new Error('QuotaExceeded') }
    expect(() => clearPendingTransaction()).not.toThrow()
    localStorage.removeItem = originalRemoveItem
  })
})

describe('useFriendMarketCreation: translateRevert extended', () => {
  it('maps ZeroStake', () => {
    expect(translateRevert('execution reverted: ZeroStake')).toMatch(/greater than zero/i)
  })

  it('maps ArbitratorRequired', () => {
    expect(translateRevert('execution reverted: ArbitratorRequired')).toMatch(/requires an arbitrator/i)
  })

  it('maps ArbitratorDisallowed', () => {
    expect(translateRevert('execution reverted: ArbitratorDisallowed')).toMatch(/only thirdparty/i)
  })

  it('maps ZeroAddress', () => {
    expect(translateRevert('execution reverted: ZeroAddress')).toMatch(/zero address/i)
  })

  it('maps EnforcedPause', () => {
    expect(translateRevert('execution reverted: EnforcedPause')).toMatch(/paused/i)
  })

  it('order matters: OracleAdapterNotSet before AdapterNotSet', () => {
    // If reason contains OracleAdapterNotSet, should match the oracle version
    const result = translateRevert('OracleAdapterNotSet')
    expect(result).toMatch(/no oracle adapter/i)
    expect(result).not.toMatch(/polymarket adapter/i)
  })

  it('AdapterNotSet (without Oracle prefix) maps to Polymarket', () => {
    // Only triggers when "OracleAdapterNotSet" is NOT present
    // Construct a string that has AdapterNotSet but not OracleAdapterNotSet
    const result = translateRevert('AdapterNotSet')
    // This will match 'OracleAdapterNotSet' first because it contains 'AdapterNotSet'
    // Actually no - the code checks OracleAdapterNotSet first,
    // and "AdapterNotSet" does NOT include "OracleAdapterNotSet"
    // so it should fall through to the legacy "AdapterNotSet" check
    // Wait -- "AdapterNotSet".includes("OracleAdapterNotSet") is false
    // but "AdapterNotSet".includes("AdapterNotSet") is true
    // And OracleAdapterNotSet check happens first, so "AdapterNotSet" will NOT match it
    // because reason.includes('OracleAdapterNotSet') would be false for 'AdapterNotSet'
    // So it should match AdapterNotSet => Polymarket adapter
    expect(result).toMatch(/polymarket adapter/i)
  })
})
