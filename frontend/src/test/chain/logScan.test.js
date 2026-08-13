/**
 * lib/chain/logScan — bounded, resumable event-history scanning.
 *
 * These pin the four properties the callers depend on, each of which was a live bug before this
 * module existed:
 *   1. no single request exceeds the RPC's block cap (the whole reason Protect and vouchers were
 *      dead on Polygon: one `queryFilter` from a deploy block ~2M blocks back);
 *   2. chunking does not become a request storm — a completed scan is cached, so the next poll
 *      reads only new blocks;
 *   3. a budget stops a backfill early and it RESUMES, reporting `complete: false` meanwhile;
 *   4. a range that cannot be read throws rather than being skipped, because a silently skipped
 *      range is indistinguishable from "nothing happened there".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { scanLogs, clearLogScanCache, LOG_SCAN_CHUNK } from '../../lib/chain/logScan'

const ADDR = '0x1111111111111111111111111111111111111111'
const T0_A = '0x' + 'aa'.repeat(32)
const T0_B = '0x' + 'bb'.repeat(32)
const SAFE_TOPIC = '0x' + '00'.repeat(12) + '22'.repeat(20)

/** A minimal ethers-Contract stand-in: address, provider, decoder, and DeferredTopicFilter-alikes. */
function makeContract({ getLogs, getBlockNumber, parse }) {
  return {
    target: ADDR,
    runner: { provider: { getLogs, getBlockNumber } },
    interface: {
      parseLog: parse ?? (({ topics }) => ({ name: topics[0] === T0_A ? 'A' : 'B', args: { topic0: topics[0] } })),
    },
    filters: {
      A: (extra) => ({ getTopicFilter: async () => (extra ? [T0_A, extra] : [T0_A]) }),
      B: (extra) => ({ getTopicFilter: async () => (extra ? [T0_B, extra] : [T0_B]) }),
    },
  }
}

const log = (topic0, blockNumber) => ({
  address: ADDR,
  topics: [topic0],
  data: '0x',
  blockNumber,
  blockHash: '0x',
  transactionHash: '0x',
  transactionIndex: 0,
  index: 0,
})

beforeEach(() => clearLogScanCache())

describe('scanLogs', () => {
  it('never asks for more than one chunk of blocks at a time', async () => {
    const getLogs = vi.fn(async () => [])
    const c = makeContract({ getLogs, getBlockNumber: async () => 100_000 })
    await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 })
    expect(getLogs).toHaveBeenCalled()
    for (const [req] of getLogs.mock.calls) {
      expect(req.toBlock - req.fromBlock + 1).toBeLessThanOrEqual(LOG_SCAN_CHUNK)
    }
    // Contiguous and complete: every block from 1 to the head is covered exactly once.
    const ranges = getLogs.mock.calls.map(([r]) => [r.fromBlock, r.toBlock]).sort((a, b) => a[0] - b[0])
    expect(ranges[0][0]).toBe(1)
    expect(ranges[ranges.length - 1][1]).toBe(100_000)
    for (let i = 1; i < ranges.length; i += 1) expect(ranges[i][0]).toBe(ranges[i - 1][1] + 1)
  })

  it('merges sibling events into ONE request per chunk and tells them apart by name', async () => {
    const getLogs = vi.fn(async ({ fromBlock }) => (fromBlock === 1 ? [log(T0_A, 5), log(T0_B, 6)] : []))
    const c = makeContract({ getLogs, getBlockNumber: async () => 5_000 })
    const { logs } = await scanLogs({
      contract: c,
      filters: [c.filters.A(SAFE_TOPIC), c.filters.B(SAFE_TOPIC)],
      fromBlock: 1,
      chainId: 137,
    })
    expect(getLogs).toHaveBeenCalledTimes(1) // two events, one request — not one scan each
    expect(getLogs.mock.calls[0][0].topics).toEqual([[T0_A, T0_B], SAFE_TOPIC])
    expect(logs.map((l) => l.eventName)).toEqual(['A', 'B'])
  })

  it('refuses to merge filters that differ beyond topic0', async () => {
    const c = makeContract({ getLogs: async () => [], getBlockNumber: async () => 10 })
    await expect(
      scanLogs({ contract: c, filters: [c.filters.A(SAFE_TOPIC), c.filters.B()], fromBlock: 1, chainId: 137 }),
    ).rejects.toThrow(/cannot be merged/)
  })

  it('re-reads only the new blocks on a second call (a 30s poll costs one chunk, not a backfill)', async () => {
    let head = 50_000
    const getLogs = vi.fn(async () => [])
    const c = makeContract({ getLogs, getBlockNumber: async () => head })
    await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 })
    const backfill = getLogs.mock.calls.length
    expect(backfill).toBe(5)

    head = 50_015 // ~30s of Polygon blocks later
    getLogs.mockClear()
    const { complete } = await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 })
    expect(getLogs).toHaveBeenCalledTimes(1)
    expect(getLogs.mock.calls[0][0]).toMatchObject({ fromBlock: 50_001, toBlock: 50_015 })
    expect(complete).toBe(true)
  })

  it('stops at the chunk budget, reports incomplete, and resumes where it stopped', async () => {
    const getLogs = vi.fn(async ({ fromBlock }) => [log(T0_A, fromBlock)])
    const c = makeContract({ getLogs, getBlockNumber: async () => 100_000 })
    const opts = { contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137, maxChunks: 4 }

    const first = await scanLogs(opts)
    expect(getLogs).toHaveBeenCalledTimes(4)
    expect(first.complete).toBe(false)
    expect(first.scannedTo).toBe(40_000)
    expect(first.logs).toHaveLength(4)

    const second = await scanLogs(opts)
    expect(second.complete).toBe(false)
    expect(second.scannedTo).toBe(80_000)
    expect(second.logs).toHaveLength(8) // accumulated across calls, not restarted

    const third = await scanLogs(opts)
    expect(third.complete).toBe(true)
    expect(third.scannedTo).toBe(100_000)
  })

  it('retries a rejected chunk in narrower sub-chunks', async () => {
    const getLogs = vi.fn(async ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1 > 1_000) throw new Error('exceed maximum block range: 1000')
      return [log(T0_A, fromBlock)]
    })
    const c = makeContract({ getLogs, getBlockNumber: async () => 10_000 })
    const { logs, complete } = await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 })
    expect(complete).toBe(true)
    expect(logs).toHaveLength(10) // 10k blocks, retried as ten 1k sub-chunks
  })

  it('throws rather than skipping a range it cannot read, and does not advance past it', async () => {
    const getLogs = vi.fn(async () => { throw new Error('endpoint down') })
    const c = makeContract({ getLogs, getBlockNumber: async () => 5_000 })
    const opts = { contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 }
    await expect(scanLogs(opts)).rejects.toThrow(/endpoint down/)

    // The cursor did not move, so a later successful call re-reads the same range — a failed scan
    // leaves a gap in the cache, never a silent hole in history.
    getLogs.mockImplementation(async () => [log(T0_A, 42)])
    const { logs, scannedTo } = await scanLogs(opts)
    expect(logs).toHaveLength(1)
    expect(scannedTo).toBe(5_000)
  })

  // The cache is deliberately keyed WITHOUT toBlock (a moving head would fragment it), so an
  // explicit ceiling has to bind the answer as well as the scan — otherwise a cache filled past it
  // hands back blocks the caller excluded.
  it('honours an explicit toBlock as a ceiling on the answer, not just on the scan', async () => {
    const getLogs = vi.fn(async ({ fromBlock }) => [log(T0_A, fromBlock)])
    const c = makeContract({ getLogs, getBlockNumber: async () => 100_000 })
    const opts = { contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 }

    const full = await scanLogs(opts)
    expect(full.logs.map((l) => l.blockNumber)).toEqual([1, 10_001, 20_001, 30_001, 40_001, 50_001, 60_001, 70_001, 80_001, 90_001])

    getLogs.mockClear()
    const capped = await scanLogs({ ...opts, toBlock: 25_000 })
    expect(getLogs).not.toHaveBeenCalled() // served from cache…
    expect(capped.logs.map((l) => l.blockNumber)).toEqual([1, 10_001, 20_001]) // …but trimmed to the ceiling
    expect(capped.scannedTo).toBe(25_000)
    expect(capped.complete).toBe(true)
  })

  it('never scans past an explicit toBlock', async () => {
    const getLogs = vi.fn(async () => [])
    const c = makeContract({ getLogs, getBlockNumber: async () => 999_999 })
    await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137, toBlock: 15_000 })
    expect(getLogs).toHaveBeenCalledTimes(2)
    expect(getLogs.mock.calls.at(-1)[0].toBlock).toBe(15_000)
  })

  it('keys the cache by chain, so the same address on two chains never shares history', async () => {
    const getLogs = vi.fn(async () => [])
    const c = makeContract({ getLogs, getBlockNumber: async () => 20_000 })
    await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 })
    getLogs.mockClear()
    await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 8453 })
    expect(getLogs).toHaveBeenCalledTimes(2) // scanned again for the other chain, not served from 137's cache
  })

  it('does not rewind when the head moves backwards (reorg / load-balanced endpoint)', async () => {
    let head = 30_000
    const getLogs = vi.fn(async () => [log(T0_A, 1)])
    const c = makeContract({ getLogs, getBlockNumber: async () => head })
    const opts = { contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 }
    const first = await scanLogs(opts)
    expect(first.logs).toHaveLength(3)

    head = 29_000
    getLogs.mockClear()
    const second = await scanLogs(opts)
    expect(getLogs).not.toHaveBeenCalled()
    expect(second.scannedTo).toBe(30_000)
    expect(second.logs).toHaveLength(3) // not re-appended
    expect(second.complete).toBe(true)
  })

  it('drops a log its own interface cannot decode instead of guessing at it', async () => {
    const c = makeContract({
      getLogs: async () => [log(T0_A, 1), log('0xdead', 2)],
      getBlockNumber: async () => 100,
      parse: ({ topics }) => {
        if (topics[0] !== T0_A) throw new Error('no matching event')
        return { name: 'A', args: {} }
      },
    })
    const { logs } = await scanLogs({ contract: c, filters: [c.filters.A()], fromBlock: 1, chainId: 137 })
    expect(logs.map((l) => l.eventName)).toEqual(['A'])
  })
})
