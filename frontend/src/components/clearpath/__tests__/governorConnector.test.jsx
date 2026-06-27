import { describe, it, expect, vi } from 'vitest'
import { getLogsRange } from '../governorConnector'

// Spec 030 (US5) — the subgraph-less proposal indexer must survive RPC block-range caps. ETC/Mordor public
// nodes (and many wallet RPC backends) reject an `eth_getLogs` window wider than a provider-specific limit;
// `getLogsRange` bisects on rejection so a wide chunk degrades to smaller requests instead of losing the scan.

const GOV = '0x00000000000000000000000000000000000000d0'

// A fake reader that mimics an RPC which rejects any getLogs window wider than `cap` blocks, and otherwise
// returns one synthetic log per block whose number is divisible by `every` (so we can assert completeness).
function cappedReader(cap, every = 1000) {
  return {
    getLogs: vi.fn(async ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1 > cap) {
        throw new Error('query returned more than 10000 results / range too wide')
      }
      const logs = []
      for (let b = fromBlock; b <= toBlock; b++) {
        if (b % every === 0) logs.push({ blockNumber: b })
      }
      return logs
    }),
  }
}

describe('getLogsRange (spec 030 — RPC range-cap resilience)', () => {
  it('returns logs directly when the range is within the RPC cap', async () => {
    const reader = cappedReader(50000)
    const logs = await getLogsRange(reader, GOV, 1, 10000)
    expect(reader.getLogs).toHaveBeenCalledTimes(1) // no bisection needed
    expect(logs.map((l) => l.blockNumber)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000])
  })

  it('bisects a too-wide range and still collects every log', async () => {
    const reader = cappedReader(5000) // rejects > 5000-block windows → must split the 50k request
    const logs = await getLogsRange(reader, GOV, 1, 50000)
    // 50 logs (every 1000th block from 1000..50000), gathered across the bisected sub-ranges in order
    expect(logs).toHaveLength(50)
    expect(logs[0].blockNumber).toBe(1000)
    expect(logs[logs.length - 1].blockNumber).toBe(50000)
    // it had to make more than one request to get under the cap
    expect(reader.getLogs.mock.calls.length).toBeGreaterThan(1)
  })

  it('throws if even a minSpan-wide window is rejected (caller decides partial vs fail)', async () => {
    const reader = cappedReader(100) // smaller than the 2000-block minSpan floor → unrecoverable
    await expect(getLogsRange(reader, GOV, 1, 50000, 2000)).rejects.toThrow()
  })
})
