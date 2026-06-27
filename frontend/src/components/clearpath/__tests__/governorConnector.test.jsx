import { describe, it, expect, vi } from 'vitest'
import { ethers } from 'ethers'
import { getLogsRange, parseProposalLog, readVoterState, readVoteSupport, explainTxError } from '../governorConnector'

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

describe('parseProposalLog (spec 030 — ProposalCreated decode)', () => {
  const EVENT_ABI = [
    'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
  ]
  const enc = new ethers.Interface(EVENT_ABI)
  const frag = enc.getEvent('ProposalCreated')
  const A1 = '0x0000000000000000000000000000000000000a01'
  const A2 = '0x0000000000000000000000000000000000000a02'
  const PROPOSER = '0x0000000000000000000000000000000000000b01'

  // Regression: the event's 4th arg is named `values`, which on an ethers v6 Result shadows
  // Array.prototype.values — `args.values.map(...)` threw "values.map is not a function", aborting the whole
  // proposal scan (list stuck on "Indexing…", error toast on submit). A multi-action proposal (native ETC +
  // token USDC) exercises that exact path.
  it('decodes a multi-action (native + token) proposal without the values name-collision', () => {
    const targets = [A1, A2]
    const values = [ethers.parseEther('1'), 0n] // ETC action carries native value; the USDC action carries 0
    const signatures = ['', '']
    const calldatas = ['0x', '0xabcdef']
    const { data, topics } = enc.encodeEventLog(frag, [
      123n, PROPOSER, targets, values, signatures, calldatas, 10n, 110n, '# Multi-action',
    ])

    const p = parseProposalLog({ data, topics })

    expect(p.id).toBe('123')
    expect(p.proposer.toLowerCase()).toBe(PROPOSER)
    expect(p.values).toEqual(['1000000000000000000', '0']) // the previously-throwing line
    expect(p.targets.map((t) => t.toLowerCase())).toEqual([A1, A2])
    expect(p.calldatas).toEqual(['0x', '0xabcdef'])
    expect(p.description).toBe('# Multi-action')
    expect(p.descriptionHash).toBe(ethers.id('# Multi-action'))
  })
})

describe('readVoterState / readVoteSupport (spec 030 — per-user voting state)', () => {
  const VOTER = '0x00000000000000000000000000000000000000c3'
  const VOTE_ABI = ['event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)']
  const vc = new ethers.Interface(VOTE_ABI)
  const frag = vc.getEvent('VoteCast')

  it('returns all-null without an account (no fabricated state)', async () => {
    expect(await readVoterState({}, GOV, { id: '42', voteStart: '1', voteEnd: '2' }, null)).toEqual({
      hasVoted: null, votingPower: null, support: null,
    })
  })

  it('recovers HOW a voter voted from their VoteCast receipt', async () => {
    const { data, topics } = vc.encodeEventLog(frag, [VOTER, 42n, 1 /* For */, 100n, ''])
    const reader = { getLogs: vi.fn(async () => [{ data, topics }]) }
    const support = await readVoteSupport(reader, GOV, { id: '42', voteStart: '1', voteEnd: '100' }, VOTER)
    expect(support).toBe(1)
  })

  it('returns null when no VoteCast matches the proposal (honest degradation)', async () => {
    const { data, topics } = vc.encodeEventLog(frag, [VOTER, 99n /* different proposal */, 0, 100n, ''])
    const reader = { getLogs: vi.fn(async () => [{ data, topics }]) }
    const support = await readVoteSupport(reader, GOV, { id: '42', voteStart: '1', voteEnd: '100' }, VOTER)
    expect(support).toBeNull()
  })
})

describe('explainTxError (spec 030 — decode opaque custom-error reverts)', () => {
  it('maps the timelock "not ready" selector to a plain explanation', () => {
    // 0x5ead8eb5 = TimelockUnexpectedOperationState(bytes32,bytes32) — what an early execute reverts with
    const msg = explainTxError({ data: '0x5ead8eb5' + '00'.repeat(64) })
    expect(msg).toMatch(/timelock delay/i)
  })

  it('maps an insufficient-balance selector to a funding explanation', () => {
    const msg = explainTxError({ info: { error: { data: '0xe450d38c00' } } }) // ERC20InsufficientBalance
    expect(msg).toMatch(/enough token balance/i)
  })

  it('falls back to the ethers message for unknown selectors', () => {
    expect(explainTxError({ shortMessage: 'user rejected' })).toBe('user rejected')
    expect(explainTxError({ data: '0xdeadbeef', message: 'boom' })).toBe('boom')
  })
})
