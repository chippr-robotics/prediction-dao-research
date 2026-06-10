/**
 * Tests for data/notifications/drawProposalScan.js (spec 012, T020).
 *
 * Best-effort DrawProposed/DrawRevoked event scan per
 * specs/012-wager-notifications/contracts/watcher-api.md:
 *   - drawScanBlock = 0 means "start from the current tip" (no backfill)
 *   - chunked queryFilter (<= 9500 blocks/chunk, <= 10 chunks/call) with an
 *     incrementally advancing watermark
 *   - results filtered to the caller's wagerIds and ordered chronologically
 *   - ANY failure resolves { proposals: [], toBlock: fromBlock } — never throws
 *
 * The global setup.js ethers mock has no queryFilter, so ethers is re-mocked
 * locally with a controllable Contract (state shared via vi.hoisted — mock
 * factories cannot close over file-scope variables).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    registryAddress: '0x00000000000000000000000000000000000000c4',
    blockNumber: 1_000_000,
    blockNumberError: null,
    queryError: null,
    proposedEvents: [],
    revokedEvents: [],
    queryCalls: [],
  }
  const provider = {
    getBlockNumber: async () => {
      if (state.blockNumberError) throw state.blockNumberError
      return state.blockNumber
    },
  }
  return { state, provider }
})

vi.mock('ethers', () => {
  class MockContract {
    constructor(address, abi, provider) {
      this.address = address
      this.abi = abi
      this.provider = provider
      this.filters = {
        DrawProposed: (...args) => ({ event: 'DrawProposed', topics: args }),
        DrawRevoked: (...args) => ({ event: 'DrawRevoked', topics: args }),
      }
    }

    async queryFilter(filter, fromBlock, toBlock) {
      h.state.queryCalls.push({
        event: filter.event,
        fromBlock,
        toBlock,
        topics: filter.topics,
      })
      if (h.state.queryError) throw h.state.queryError
      const source =
        filter.event === 'DrawProposed' ? h.state.proposedEvents : h.state.revokedEvents
      // Deliberately ignores topic filters: simulates an RPC that returns
      // unfiltered logs so the module's post-filter by wagerId is exercised.
      return source.filter(ev => ev.blockNumber >= fromBlock && ev.blockNumber <= toBlock)
    }
  }
  return { ethers: { Contract: MockContract }, Contract: MockContract }
})

vi.mock('../config/contracts', () => ({
  getContractAddressForChain: vi.fn(() => h.state.registryAddress),
}))

vi.mock('../utils/blockchainService', () => ({
  getProvider: vi.fn(() => h.provider),
}))

import { scanDrawProposals } from '../data/notifications/drawProposalScan'
import { getContractAddressForChain } from '../config/contracts'
import { getProvider } from '../utils/blockchainService'

const PROPOSER = '0x1111111111111111111111111111111111111111'

/** ethers v6 EventLog shape (args.wagerId is a BigInt; `index` = log index). */
function makeEvent(wagerId, blockNumber, { index = 0, proposer = PROPOSER } = {}) {
  return { blockNumber, index, args: { wagerId: BigInt(wagerId), proposer } }
}

function callsFor(eventName) {
  return h.state.queryCalls.filter(c => c.event === eventName)
}

beforeEach(() => {
  localStorage.clear()
  h.state.registryAddress = '0x00000000000000000000000000000000000000c4'
  h.state.blockNumber = 1_000_000
  h.state.blockNumberError = null
  h.state.queryError = null
  h.state.proposedEvents = []
  h.state.revokedEvents = []
  h.state.queryCalls = []
  vi.mocked(getContractAddressForChain).mockClear()
  vi.mocked(getProvider).mockClear()
})

describe('scanDrawProposals — zero watermark (no historical backfill)', () => {
  it('returns no proposals and advances toBlock to the current tip when fromBlock is 0', async () => {
    h.state.blockNumber = 123_456
    h.state.proposedEvents = [makeEvent('1', 100)] // historical event must NOT surface

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1', '2'], fromBlock: 0 })

    expect(result).toEqual({ proposals: [], toBlock: 123_456 })
    expect(h.state.queryCalls).toHaveLength(0)
  })

  it('treats a missing fromBlock as a zero watermark', async () => {
    h.state.blockNumber = 5_000

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1'] })

    expect(result).toEqual({ proposals: [], toBlock: 5_000 })
    expect(h.state.queryCalls).toHaveLength(0)
  })

  it('resolves the registry and provider for the requested chain', async () => {
    await scanDrawProposals({ chainId: 80002, wagerIds: ['1'], fromBlock: 0 })

    expect(getContractAddressForChain).toHaveBeenCalledWith('wagerRegistry', 80002)
    expect(getProvider).toHaveBeenCalledWith(80002)
  })
})

describe('scanDrawProposals — empty wagerIds', () => {
  it('skips querying but still advances toBlock to the tip', async () => {
    h.state.blockNumber = 5_000

    const result = await scanDrawProposals({ chainId: 137, wagerIds: [], fromBlock: 1_000 })

    expect(result).toEqual({ proposals: [], toBlock: 5_000 })
    expect(h.state.queryCalls).toHaveLength(0)
  })
})

describe('scanDrawProposals — chunking and watermark', () => {
  it('scans fromBlock+1 to tip in <= 9500-block chunks (25000-block span => 3 chunks)', async () => {
    h.state.blockNumber = 26_000

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['7'], fromBlock: 1_000 })

    const expectedRanges = [
      [1_001, 10_500],
      [10_501, 20_000],
      [20_001, 26_000],
    ]
    expect(callsFor('DrawProposed').map(c => [c.fromBlock, c.toBlock])).toEqual(expectedRanges)
    expect(callsFor('DrawRevoked').map(c => [c.fromBlock, c.toBlock])).toEqual(expectedRanges)
    expect(result.toBlock).toBe(26_000)
    expect(result.proposals).toEqual([])
  })

  it('caps a call at 10 chunks and advances the watermark only over scanned blocks', async () => {
    h.state.blockNumber = 115_000 // 114000-block span => 12 chunks remain
    h.state.proposedEvents = [
      makeEvent('7', 50_000), // inside the scanned window
      makeEvent('7', 100_000), // beyond chunk 10 — picked up by a later call
    ]

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['7'], fromBlock: 1_000 })

    expect(callsFor('DrawProposed')).toHaveLength(10)
    expect(callsFor('DrawRevoked')).toHaveLength(10)
    expect(callsFor('DrawProposed')[9].toBlock).toBe(96_000) // 1000 + 10 * 9500
    expect(result.toBlock).toBe(96_000)
    expect(result.proposals).toEqual([
      { wagerId: '7', proposer: PROPOSER, revoked: false },
    ])
  })

  it('keeps the watermark when there are no new blocks', async () => {
    h.state.blockNumber = 5_000

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1'], fromBlock: 5_000 })

    expect(result).toEqual({ proposals: [], toBlock: 5_000 })
    expect(h.state.queryCalls).toHaveLength(0)
  })
})

describe('scanDrawProposals — wagerId filtering', () => {
  it('passes the wagerIds as a BigInt array-topic filter', async () => {
    h.state.blockNumber = 2_000

    await scanDrawProposals({ chainId: 137, wagerIds: ['1', '2'], fromBlock: 1_000 })

    expect(callsFor('DrawProposed')[0].topics[0]).toEqual([1n, 2n])
    expect(callsFor('DrawRevoked')[0].topics[0]).toEqual([1n, 2n])
  })

  it('post-filters results to the requested wagerIds even when the RPC ignores topics', async () => {
    h.state.blockNumber = 2_000
    h.state.proposedEvents = [
      makeEvent('1', 1_500),
      makeEvent('99', 1_600), // not ours — must be dropped
    ]

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1', '2'], fromBlock: 1_000 })

    expect(result.proposals).toEqual([{ wagerId: '1', proposer: PROPOSER, revoked: false }])
    expect(result.toBlock).toBe(2_000)
  })

  it('lowercases the proposer address', async () => {
    h.state.blockNumber = 2_000
    h.state.proposedEvents = [
      makeEvent('1', 1_500, { proposer: '0xAbCdEF1111111111111111111111111111111111' }),
    ]

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1'], fromBlock: 1_000 })

    expect(result.proposals).toEqual([
      { wagerId: '1', proposer: '0xabcdef1111111111111111111111111111111111', revoked: false },
    ])
  })
})

describe('scanDrawProposals — chronological ordering', () => {
  it('orders events by (block, logIndex) so a later DrawRevoked supersedes the proposal', async () => {
    h.state.blockNumber = 2_000
    h.state.proposedEvents = [
      makeEvent('5', 1_200, { index: 3 }),
      makeEvent('5', 1_800, { index: 0 }),
    ]
    h.state.revokedEvents = [
      makeEvent('5', 1_200, { index: 7 }), // same block as first proposal, later log
    ]

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['5'], fromBlock: 1_000 })

    expect(result.proposals).toEqual([
      { wagerId: '5', proposer: PROPOSER, revoked: false }, // block 1200, log 3
      { wagerId: '5', proposer: PROPOSER, revoked: true }, // block 1200, log 7
      { wagerId: '5', proposer: PROPOSER, revoked: false }, // block 1800, log 0
    ])
  })
})

describe('scanDrawProposals — failure modes (never throws)', () => {
  it('resolves { proposals: [], toBlock: fromBlock } when queryFilter fails', async () => {
    h.state.blockNumber = 26_000
    h.state.queryError = new Error('block range limit exceeded')

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1'], fromBlock: 1_000 })

    expect(result).toEqual({ proposals: [], toBlock: 1_000 })
  })

  it('resolves { proposals: [], toBlock: fromBlock } when the provider cannot fetch the tip', async () => {
    h.state.blockNumberError = new Error('network down')

    const result = await scanDrawProposals({ chainId: 137, wagerIds: ['1'], fromBlock: 1_000 })

    expect(result).toEqual({ proposals: [], toBlock: 1_000 })
  })

  it('resolves { proposals: [], toBlock: fromBlock } when the chain has no registry deployment', async () => {
    h.state.registryAddress = undefined

    const result = await scanDrawProposals({ chainId: 63, wagerIds: ['1'], fromBlock: 1_000 })

    expect(result).toEqual({ proposals: [], toBlock: 1_000 })
    expect(h.state.queryCalls).toHaveLength(0)
  })

  it('falls back to a 0 watermark on failure when fromBlock is missing', async () => {
    h.state.registryAddress = undefined

    const result = await scanDrawProposals({ chainId: 63, wagerIds: ['1'] })

    expect(result).toEqual({ proposals: [], toBlock: 0 })
  })
})
