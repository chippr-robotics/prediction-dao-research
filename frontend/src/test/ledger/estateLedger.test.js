/**
 * Contract tests for the estate activity merge seam (spec 092,
 * contracts/estate-activity.md). One case per guarantee G1–G7. Everything is
 * injected — no network, no default repository.
 */
import { describe, it, expect, vi } from 'vitest'
import { createEstateLedger } from '../../data/ledger/estateLedger'

const ACCOUNT = '0xabc0000000000000000000000000000000000001'

const entry = (chainId, id, timestamp) => ({
  entryId: `oc:${chainId}:${id}`,
  chainId,
  class: 'wager',
  kind: 'deposit',
  timestamp: timestamp ?? null,
  recordedAt: 0,
})

/** A listEntries stub keyed by chainId → result | Error. */
const listEntriesBy = (byChain) =>
  vi.fn(async ({ chainId }) => {
    const res = byChain[chainId]
    if (res instanceof Error) throw res
    return { entries: [], staleClasses: [], prunedBefore: null, ...res }
  })

const makeSeam = (byChain, over = {}) =>
  createEstateLedger({
    listEntries: listEntriesBy(byChain),
    readProviderFor: () => ({ mock: true }),
    isInCohort: () => true,
    ...over,
  })

describe('listEntriesAcrossEstate — contract guarantees', () => {
  it('G1: never rejects — a throwing chain becomes an unreachable state while siblings resolve', async () => {
    const seam = makeSeam({
      1: { entries: [entry(1, 'a', 100)] },
      137: new Error('rpc dead'),
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    expect(res.entries).toHaveLength(1)
    const s137 = res.chainStates.find((s) => s.chainId === 137)
    expect(s137.state).toBe('unreachable')
    expect(s137.reason).toMatch(/rpc dead/)
    expect(res.chainStates.find((s) => s.chainId === 1).state).toBe('read')
    expect(res.partialChains).toEqual([137])
  })

  it('G2: cohort bounding — a cross-cohort id is silently dropped, not an error', async () => {
    const listEntries = listEntriesBy({ 1: { entries: [] } })
    const seam = createEstateLedger({
      listEntries,
      readProviderFor: () => ({}),
      isInCohort: (id) => id === 1,
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 999] })
    expect(listEntries).toHaveBeenCalledTimes(1)
    expect(res.chainStates.map((s) => s.chainId)).toEqual([1])
  })

  it('G3: a missing provider is unreachable with a reason, never a throw', async () => {
    const seam = makeSeam(
      { 1: { entries: [entry(1, 'a', 5)] } },
      { readProviderFor: (chainId) => (chainId === 1 ? {} : null) },
    )
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 61] })
    expect(res.chainStates.find((s) => s.chainId === 61)).toMatchObject({
      state: 'unreachable',
      reason: expect.stringMatching(/no read connection/i),
    })
    expect(res.entries).toHaveLength(1)
  })

  it('G4: scope preservation — each listEntries call gets exactly one chainId and its own provider', async () => {
    const providers = { 1: { id: 'p1' }, 137: { id: 'p137' } }
    const listEntries = listEntriesBy({ 1: {}, 137: {} })
    const seam = createEstateLedger({
      listEntries,
      readProviderFor: (chainId) => providers[chainId],
      isInCohort: () => true,
    })
    await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    const calls = listEntries.mock.calls.map(([q]) => q)
    expect(calls.map((q) => q.chainId).sort()).toEqual([1, 137])
    for (const q of calls) {
      expect(q.provider).toBe(providers[q.chainId])
      expect(q.account).toBe(ACCOUNT)
    }
  })

  it('G5: dedup by entryId across chains — reference-chain duplicates collapse to one', async () => {
    const dup = entry(137, 'membership-x', 50)
    const seam = makeSeam({
      1: { entries: [dup] }, // membership source answers with its reference-chain row
      137: { entries: [{ ...dup }] },
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    expect(res.entries.filter((e) => e.entryId === dup.entryId)).toHaveLength(1)
  })

  it('G6: merged ordering — newest first, undated rows after all dated rows', async () => {
    const seam = makeSeam({
      1: { entries: [entry(1, 'old', 10), entry(1, 'undated', null)] },
      137: { entries: [entry(137, 'new', 999)] },
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    expect(res.entries.map((e) => e.entryId)).toEqual(['oc:137:new', 'oc:1:old', 'oc:1:undated'])
  })

  it('G7: empty-but-read is read with entryCount 0 — never unreachable, never a warning', async () => {
    const seam = makeSeam({ 63: { entries: [] } })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [63] })
    expect(res.chainStates[0]).toMatchObject({ chainId: 63, state: 'read', entryCount: 0 })
    expect(res.partialChains).toEqual([])
  })

  it('carries per-chain staleness and pruning through without collapsing them into chain state', async () => {
    const seam = makeSeam({
      1: { entries: [], staleClasses: ['earn'], prunedBefore: 1700000000000 },
      137: { entries: [] },
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    expect(res.staleByChain.get(1)).toEqual(['earn'])
    expect(res.staleByChain.has(137)).toBe(false)
    expect(res.prunedByChain.get(1)).toBe(1700000000000)
    expect(res.chainStates.every((s) => s.state === 'read')).toBe(true)
  })
})

/*
 * #1280 — the disclosure that could not fire.
 *
 * `useAccountStats` has an `allUnreachable` branch that keeps last-known values, marks everything
 * stale and says "None of your networks could be read right now". It was correct and it was dead:
 * `listEntries` never throws when its sources fail, so a chain with nothing readable arrived as a
 * successful empty read, `every(state === 'unreachable')` was never true, and the panel rendered
 * "No activity yet" about networks it had never managed to read.
 */
describe('listEntriesAcrossEstate — a chain whose sources all failed is unreachable, not empty', () => {
  it('readState "unreadable" becomes an unreachable chain state and a partial chain', async () => {
    const seam = makeSeam({
      1: { entries: [entry(1, 'a', 100)] },
      137: { entries: [], staleClasses: ['wager', 'pool'], readState: 'unreadable' },
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    const s137 = res.chainStates.find((s) => s.chainId === 137)
    expect(s137.state).toBe('unreachable')
    expect(s137.entryCount).toBe(0)
    expect(res.partialChains).toContain(137)
    // The readable sibling is untouched — the classification is per chain.
    expect(res.entries).toHaveLength(1)
  })

  it('readState "read" with no entries stays a genuine, reportable absence', async () => {
    const seam = makeSeam({ 137: { entries: [], readState: 'read' } })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [137] })
    expect(res.chainStates[0].state).toBe('read')
    expect(res.partialChains).toHaveLength(0)
  })

  it('EVERY chain unreadable leaves nothing classified as read — what the disclosure branch tests', async () => {
    const seam = makeSeam({
      1: { entries: [], staleClasses: ['wager'], readState: 'unreadable' },
      137: { entries: [], staleClasses: ['wager'], readState: 'unreadable' },
    })
    const res = await seam.listEntriesAcrossEstate({ account: ACCOUNT, chainIds: [1, 137] })
    expect(res.chainStates.every((s) => s.state === 'unreachable')).toBe(true)
  })
})
