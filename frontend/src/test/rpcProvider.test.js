/**
 * makeReadProvider — disables ethers JSON-RPC request batching on chains whose
 * public RPCs mishandle batch responses (Ethereum Classic mainnet 61 + Mordor
 * 63). Batching is what made every Mordor read (My Wagers, membership banner)
 * silently fail, since ethers batches concurrent eth_calls by default.
 */
import { describe, it, expect } from 'vitest'
import { makeReadProvider, chainNeedsUnbatchedRpc } from '../utils/rpcProvider'

describe('chainNeedsUnbatchedRpc', () => {
  it('flags Ethereum Classic chains (61, 63)', () => {
    expect(chainNeedsUnbatchedRpc(61)).toBe(true)
    expect(chainNeedsUnbatchedRpc(63)).toBe(true)
    expect(chainNeedsUnbatchedRpc('63')).toBe(true)
  })

  it('leaves batching enabled for Polygon / Amoy / unknown', () => {
    expect(chainNeedsUnbatchedRpc(137)).toBe(false)
    expect(chainNeedsUnbatchedRpc(80002)).toBe(false)
    expect(chainNeedsUnbatchedRpc(null)).toBe(false)
    expect(chainNeedsUnbatchedRpc(undefined)).toBe(false)
  })
})

describe('makeReadProvider', () => {
  it('disables batching (batchMaxCount=1) for Mordor', () => {
    const p = makeReadProvider('https://rpc.mordor.etccooperative.org', 63)
    // ethers v6 exposes the configured batch cap on the provider options.
    expect(p._getOption('batchMaxCount')).toBe(1)
  })

  it('keeps default batching for Polygon', () => {
    const p = makeReadProvider('https://polygon-bor-rpc.publicnode.com', 137)
    expect(p._getOption('batchMaxCount')).toBeGreaterThan(1)
  })
})
