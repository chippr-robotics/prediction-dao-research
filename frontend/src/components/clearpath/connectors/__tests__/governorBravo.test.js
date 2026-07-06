import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 042 — GovernorBravo connector. We stub ethers.Contract so the connector's framework-specific behavior
// (proposals() tallies, getReceipt voter state, id-based queue/execute, propose with `signatures`) is asserted
// without a live chain. The `ProposalCreated` log parsing is shared with the OZ connector (same event).

const calls = vi.hoisted(() => ({ last: null }))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  function FakeContract(address, _abi, _runner) {
    return {
      // reads
      proposalCount: async () => 5n,
      quorumVotes: async () => 40000000000000000000000n,
      name: async () => 'Uniswap Governor Bravo',
      proposals: async (id) => ({
        id,
        proposer: '0xproposer',
        eta: 0n,
        startBlock: 100n,
        endBlock: 200n,
        forVotes: 10n,
        againstVotes: 3n,
        abstainVotes: 1n,
        canceled: false,
        executed: false,
      }),
      getReceipt: async (_id, _voter) => ({ hasVoted: true, support: 1, votes: 123n }),
      // writes — record the call shape
      castVote: (...a) => { calls.last = ['castVote', ...a]; return { hash: '0x1' } },
      queue: (...a) => { calls.last = ['queue', ...a]; return { hash: '0x2' } },
      execute: (...a) => { calls.last = ['execute', ...a]; return { hash: '0x3' } },
      propose: (...a) => { calls.last = ['propose', ...a]; return { hash: '0x4' } },
    }
  }
  return { ...actual, ethers: { ...actual.ethers, Contract: vi.fn(FakeContract) } }
})

import { governorBravoConnector as bravo } from '../governorBravo'

describe('GovernorBravo connector (spec 042)', () => {
  beforeEach(() => { calls.last = null })

  it('reads voter state from getReceipt (hasVoted/support/weight)', async () => {
    const vs = await bravo.readVoterState({}, '0xgov', { id: '1', voteStart: '100' }, '0xacct')
    expect(vs.hasVoted).toBe(true)
    expect(vs.support).toBe(1)
    expect(vs.votingPower).toBe('123')
  })

  it('castVote passes (proposalId, support)', () => {
    bravo.castVote({}, '0xgov', '7', 1)
    expect(calls.last).toEqual(['castVote', '7', 1])
  })

  it('queue and execute take ONLY the proposal id (Bravo semantics, not OZ arrays)', () => {
    bravo.queue({}, '0xgov', { id: '7', targets: ['0xa'], values: ['0'], calldatas: ['0x'] })
    expect(calls.last).toEqual(['queue', '7'])
    bravo.execute({}, '0xgov', { id: '7', targets: ['0xa'], values: ['0'], calldatas: ['0x'] })
    expect(calls.last).toEqual(['execute', '7'])
  })

  it('propose carries the extra `signatures` array (defaulted to empty strings)', () => {
    bravo.propose({}, '0xgov', { targets: ['0xa', '0xb'], values: ['0', '0'], calldatas: ['0x', '0x'], description: 'd' })
    const [fn, targets, values, sigs, calldatas, description] = calls.last
    expect(fn).toBe('propose')
    expect(targets).toHaveLength(2)
    expect(sigs).toEqual(['', '']) // one empty signature per action
    expect(calldatas).toHaveLength(2)
    expect(values).toHaveLength(2)
    expect(description).toBe('d')
  })

  it('is registered as framework 1', () => {
    expect(bravo.framework).toBe(1)
  })
})
