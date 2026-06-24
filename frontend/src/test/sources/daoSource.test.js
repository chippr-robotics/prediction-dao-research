/**
 * daoSource tests (spec 031, FR-027) — OZ state→event mapping, snapshot-diff (first-sight baseline),
 * honest action-needed (vote/queue/execute with degrade), and ok:false on a registry read failure.
 * On-chain reads are mocked: a Proxy ethers.Contract dispatches by method name to a per-test fixture map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ fns: {}, proposals: { ok: true, partial: false, proposals: [] } }))

vi.mock('../../utils/blockchainService', () => ({ getProvider: () => ({}) }))
vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: () => '0x000000000000000000000000000000000000d0a0',
  getDeploymentBlockForChain: () => 0,
}))
vi.mock('../../components/clearpath/governorConnector', () => ({
  fetchGovernorProposals: (...a) => (m.fns.fetchGovernorProposals ? m.fns.fetchGovernorProposals(...a) : m.proposals),
}))
vi.mock('ethers', async (orig) => {
  const actual = await orig()
  function FakeContract() {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return undefined
        return (...args) => {
          const fn = m.fns[prop]
          if (!fn) throw new Error('unmocked contract method: ' + String(prop))
          return fn(...args)
        }
      },
    })
  }
  return { ...actual, ethers: { ...actual.ethers, Contract: vi.fn(FakeContract) } }
})

import { daoSource } from '../../data/notifications/sources/daoSource'

const DAO = '0x00000000000000000000000000000000000000da'
const ACCT = '0x00000000000000000000000000000000000000ac'
const refId = `${DAO}#5`
const NOW = 1_000_000

beforeEach(() => {
  m.fns = {
    externalCount: () => 1n,
    getExternalDAO: () => [DAO, 0n, 'Olympia', ACCT, 0n],
    hasVoted: () => false,
    proposalSnapshot: () => 100n,
    getVotes: () => 10n,
    proposalEta: () => 0n,
  }
  m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund dev', state: 1 }] }
})

const detect = (prior = { snapshots: {}, aux: {} }) =>
  daoSource.detect({ account: ACCT, chainId: 63, nowMs: NOW, prior })

describe('daoSource (spec 031)', () => {
  it('first sight records a baseline snapshot and emits no entries', async () => {
    const res = await detect()
    expect(res.ok).toBe(true)
    expect(res.entries).toEqual([])
    expect(Object.keys(res.nextSnapshots)).toEqual([refId])
    expect(res.nextSnapshots[refId].state).toBe(1)
  })

  it('flags an active proposal the user can still vote on as action-needed: vote', async () => {
    const res = await detect()
    expect(res.actionNeededById[refId]).toBe('vote')
  })

  it('honestly degrades vote eligibility (no badge) when the user already voted', async () => {
    m.fns.hasVoted = () => true
    const res = await detect()
    expect(res.actionNeededById[refId]).toBeNull()
  })

  it('honestly degrades when the Governor omits eligibility views', async () => {
    m.fns.hasVoted = () => { throw new Error('no method') }
    const res = await detect()
    expect(res.actionNeededById[refId]).toBeNull()
  })

  it('emits a ready-to-queue entry + action on Active→Succeeded', async () => {
    m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund dev', state: 4 }] }
    const res = await detect({ snapshots: { [refId]: { state: 1, snappedAt: 0 } }, aux: {} })
    expect(res.entries.map((e) => e.type)).toEqual(['ready-to-queue'])
    expect(res.entries[0]).toMatchObject({ domain: 'dao', refId, actionable: true })
    expect(res.actionNeededById[refId]).toBe('queue')
  })

  it('emits a "queued" entry (action execute only when ETA elapsed) and Executed→finalized (no action)', async () => {
    m.fns.proposalEta = () => 500n // elapsed: 500*1000 = 500_000 <= NOW (1_000_000)
    m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund', state: 5 }] }
    let res = await detect({ snapshots: { [refId]: { state: 4 } }, aux: {} })
    expect(res.entries.map((e) => e.type)).toEqual(['queued']) // honest: not "ready to execute"
    expect(res.actionNeededById[refId]).toBe('execute')

    m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund', state: 7 }] }
    res = await detect({ snapshots: { [refId]: { state: 5 } }, aux: {} })
    expect(res.entries.map((e) => e.type)).toEqual(['finalized'])
    expect(res.actionNeededById[refId]).toBeNull()
  })

  it('honestly degrades execute when proposalEta is unreadable (no faked executability)', async () => {
    m.fns.proposalEta = () => { throw new Error('no eta') }
    m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund', state: 5 }] }
    const res = await detect({ snapshots: { [refId]: { state: 5 } }, aux: {} })
    expect(res.actionNeededById[refId]).toBeNull()
  })

  it('skips a proposal whose state() reverted (null) — no spurious entry, carries prior, marks partial', async () => {
    m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund', state: null }] }
    const res = await detect({ snapshots: { [refId]: { state: 1 } }, aux: {} })
    expect(res.entries).toEqual([]) // null state NOT coerced to Pending → no fabricated transition
    expect(res.partial).toBe(true)
    expect(res.nextSnapshots[refId]).toEqual({ state: 1 }) // prior carried, not overwritten
  })

  it('does not flag execute until the timelock ETA has elapsed', async () => {
    m.proposals = { ok: true, partial: false, proposals: [{ id: '5', description: '# Fund', state: 5 }] }
    m.fns.proposalEta = () => BigInt(Math.floor(NOW / 1000) + 3600) // 1h in the future
    const res = await detect({ snapshots: { [refId]: { state: 5 } }, aux: {} })
    expect(res.actionNeededById[refId]).toBeNull()
  })

  it('returns ok:false when the registry read fails', async () => {
    m.fns.externalCount = () => { throw new Error('rpc down') }
    const res = await detect()
    expect(res.ok).toBe(false)
  })

  it('marks partial when a DAO proposal scan degrades', async () => {
    m.proposals = { ok: true, partial: true, proposals: [] }
    const res = await detect()
    expect(res.partial).toBe(true)
  })
})
