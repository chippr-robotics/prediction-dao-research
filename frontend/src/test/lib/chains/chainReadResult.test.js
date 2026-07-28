/**
 * Spec 071 T008 — the three-state read result and the aggregation rules that keep it honest.
 *
 * The point of these tests is not that the helpers "work": it is that the two dishonesties this
 * feature exists to prevent are structurally impossible.
 *   1. An unreadable chain rendering as a zero, or vanishing from a total without a trace.
 *   2. Balances in different tokens being added into one invented number.
 */
import { describe, it, expect } from 'vitest'
import {
  readOk, notDeployed, unreadable, aggregate, partialLabel,
  isRead, isNotDeployed, isUnreadable, READ, NOT_DEPLOYED, UNREADABLE,
} from '../../../lib/chains/chainReadResult'

const USDC = { symbol: 'USDC', decimals: 6 }
const USC = { symbol: 'USC', decimals: 6 }

describe('chain read result — three distinguishable states (FR-014)', () => {
  it('produces exactly one status per result, and they are distinguishable', () => {
    expect(readOk(137, 5n, USDC).status).toBe(READ)
    expect(notDeployed(61).status).toBe(NOT_DEPLOYED)
    expect(unreadable(1, 'timeout').status).toBe(UNREADABLE)

    expect(isRead(readOk(137, 5n, USDC))).toBe(true)
    expect(isNotDeployed(notDeployed(61))).toBe(true)
    expect(isUnreadable(unreadable(1, 'timeout'))).toBe(true)
  })

  it('carries no value on the two non-answer states, so a default has nowhere to live', () => {
    expect(notDeployed(61).value).toBeUndefined()
    expect(unreadable(1, 'timeout').value).toBeUndefined()
  })

  it('always carries a reason when unreadable, never a silent failure', () => {
    expect(unreadable(1, 'endpoint refused').reason).toBe('endpoint refused')
    expect(unreadable(1).reason).toBeTruthy()
  })

  it('keeps a zero balance distinct from not-deployed and from unreadable', () => {
    const zero = readOk(137, 0n, USDC)
    expect(zero.status).toBe(READ)
    expect(zero.value).toBe(0n)
    // The whole feature turns on these three never collapsing into one another.
    expect(new Set([zero.status, notDeployed(61).status, unreadable(1, 'x').status]).size).toBe(3)
  })
})

describe('aggregate — per-unit subtotals only (FR-022)', () => {
  it('never sums across units: different tokens land in different buckets', () => {
    const agg = aggregate([readOk(137, 100n, USDC), readOk(63, 250n, USC)])
    expect(agg.subtotals).toEqual({ USDC: 100n, USC: 250n })
    // There is no API that returns one figure across units, so no caller can ask for one.
    expect(Object.keys(agg.subtotals)).toHaveLength(2)
  })

  it('sums within a unit', () => {
    const agg = aggregate([readOk(137, 100n, USDC), readOk(1, 50n, USDC)])
    expect(agg.subtotals.USDC).toBe(150n)
  })

  it('refuses to bucket a value with no declared unit rather than guessing one', () => {
    const agg = aggregate([readOk(137, 100n, USDC), readOk(1, 50n, null)])
    expect(agg.subtotals).toEqual({ USDC: 100n })
    expect(agg.partial).toBe(true)
    expect(agg.missing[0]).toMatchObject({ chainId: 1 })
  })
})

describe('aggregate — partial totals name what is missing (FR-023)', () => {
  it('excludes an unreadable chain, flags partial, and names it', () => {
    const agg = aggregate([readOk(137, 100n, USDC), unreadable(1, 'endpoint down')])
    expect(agg.subtotals.USDC).toBe(100n)
    expect(agg.partial).toBe(true)
    expect(agg.missing).toEqual([{ chainId: 1, reason: 'endpoint down' }])
  })

  it('does NOT flag partial for a not-deployed chain — nothing is missing, there is nothing there', () => {
    const agg = aggregate([readOk(137, 100n, USDC), notDeployed(61)])
    expect(agg.subtotals.USDC).toBe(100n)
    expect(agg.partial).toBe(false)
    expect(agg.missing).toEqual([])
  })

  it('is complete when every chain answered', () => {
    const agg = aggregate([readOk(137, 100n, USDC), readOk(1, 1n, USDC)])
    expect(agg.partial).toBe(false)
    expect(partialLabel(agg)).toBeNull()
  })

  it('renders a label that names the excluded chains, so "partial" is never just an unshown flag', () => {
    const agg = aggregate([readOk(137, 100n, USDC), unreadable(1, 'timeout')])
    const label = partialLabel(agg, (id) => (id === 1 ? 'Ethereum' : `chain ${id}`))
    expect(label).toContain('Partial')
    expect(label).toContain('Ethereum')
  })

  it('an unreadable chain never contributes a zero to a subtotal', () => {
    const withFailure = aggregate([readOk(137, 100n, USDC), unreadable(1, 'down')])
    const withoutIt = aggregate([readOk(137, 100n, USDC)])
    // Same number — but only one of them admits it is incomplete.
    expect(withFailure.subtotals.USDC).toBe(withoutIt.subtotals.USDC)
    expect(withFailure.partial).toBe(true)
    expect(withoutIt.partial).toBe(false)
  })

  it('tolerates an empty set and nullish entries', () => {
    expect(aggregate([]).subtotals).toEqual({})
    expect(aggregate([null, undefined]).partial).toBe(false)
  })
})
