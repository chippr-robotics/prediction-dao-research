import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useOracleConditions } from '../hooks/useOracleConditions'

// Stable mocks — vi.hoisted so they survive the vi.mock factory hoisting.
const { stableWeb3, stub, fakeIface } = vi.hoisted(() => {
  const stub = {
    filters: { ConditionRegistered: () => ({ topics: [] }) },
    queryFilter: () => Promise.resolve([]),
    on: () => {},
    off: () => {},
    isConditionResolved: () => Promise.resolve(false),
    getConditionMetadata: () => Promise.resolve({ description: '', expectedResolutionTime: 0n }),
    conditions: () => Promise.resolve({
      feed: '0x0000000000000000000000000000000000000000',
      threshold: 0n,
      op: 0,
      deadline: 0n,
      registered: false,
    }),
  }
  // Each log carries a `__parsed` field that our fake Interface.parseLog
  // returns verbatim. Sidesteps real ABI encoding for the test.
  const fakeIface = {
    parseLog: (log) => log.__parsed,
  }
  return {
    stableWeb3: { provider: { isFakeProvider: true } },
    stub,
    fakeIface,
  }
})

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: () => stableWeb3,
}))

vi.mock('ethers', async () => {
  const real = await vi.importActual('ethers')
  function FakeContract() { return stub }
  function FakeInterface() { return fakeIface }
  return {
    ...real,
    ethers: {
      ...real.ethers,
      Contract: FakeContract,
      Interface: FakeInterface,
      isAddress: (s) => /^0x[a-fA-F0-9]{40}$/.test(String(s || '').trim()),
      formatUnits: real.ethers.formatUnits,
    },
  }
})

const ADAPTER = '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23'

function logFor(conditionId, { description = '', expected = 0n } = {}) {
  // Test-only log shape: real ethers Log fields are irrelevant because our
  // fake Interface.parseLog just returns `__parsed`.
  return {
    topics: [],
    data: '0x',
    __parsed: { args: { conditionId, description, expectedResolutionTime: expected } },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset stub methods to defaults — they're regular fns above, but tests
  // overwrite them with vi.fn so we need to restore identity each time.
  stub.queryFilter = vi.fn(() => Promise.resolve([]))
  stub.on = vi.fn()
  stub.off = vi.fn()
  stub.isConditionResolved = vi.fn(() => Promise.resolve(false))
  stub.getConditionMetadata = vi.fn(() => Promise.resolve({ description: '', expectedResolutionTime: 0n }))
  stub.conditions = vi.fn(() => Promise.resolve({
    feed: '0x0000000000000000000000000000000000000000',
    threshold: 0n,
    op: 0,
    deadline: 0n,
    registered: false,
  }))
})

describe('useOracleConditions', () => {
  it('returns empty + idle when no adapter address is supplied', async () => {
    const { result } = renderHook(() => useOracleConditions('', 'datafeed'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conditions).toEqual([])
    expect(stub.queryFilter).not.toHaveBeenCalled()
  })

  it('returns empty for an invalid adapter address', async () => {
    const { result } = renderHook(() => useOracleConditions('0xnotreallyhex', 'datafeed'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conditions).toEqual([])
    expect(stub.queryFilter).not.toHaveBeenCalled()
  })

  it('DataFeed: returns one condition row, enriched with feed/threshold/op/deadline', async () => {
    stub.queryFilter = vi.fn(() => Promise.resolve([
      logFor('0x' + 'aa'.repeat(32), { expected: 1700000000n }),
    ]))
    stub.isConditionResolved = vi.fn(() => Promise.resolve(false))
    stub.conditions = vi.fn(() => Promise.resolve({
      feed: '0xF0d50568e3A7e8259E16663972b11910F89BD8e7',
      threshold: 300000000000n,
      op: 0,  // GT
      deadline: 1700000000n,
      registered: true,
    }))
    stub.getConditionMetadata = vi.fn(() => Promise.resolve({
      description: '',
      expectedResolutionTime: 1700000000n,
    }))

    const { result } = renderHook(() => useOracleConditions(ADAPTER, 'datafeed'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conditions).toHaveLength(1)
    const row = result.current.conditions[0]
    expect(row.conditionId).toBe('0x' + 'aa'.repeat(32))
    expect(row.isResolved).toBe(false)
    expect(row.feed).toBe('0xF0d50568e3A7e8259E16663972b11910F89BD8e7')
    expect(row.threshold).toBe(300000000000n)
    expect(row.opLabel).toBe('>')
    expect(row.deadline).toBe(1700000000)
    expect(row.expectedResolutionTime).toBe(1700000000)
  })

  it('UMA: surfaces claim text in description via getConditionMetadata', async () => {
    stub.queryFilter = vi.fn(() => Promise.resolve([
      logFor('0x' + 'cc'.repeat(32)),
    ]))
    stub.getConditionMetadata = vi.fn(() => Promise.resolve({
      description: 'ETH closes above 3000 on 2026-12-31',
      expectedResolutionTime: 7200n,
    }))

    const { result } = renderHook(() => useOracleConditions(ADAPTER, 'uma'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conditions).toHaveLength(1)
    expect(result.current.conditions[0].description).toBe('ETH closes above 3000 on 2026-12-31')
    expect(result.current.conditions[0].expectedResolutionTime).toBe(7200)
  })

  it('sorts unresolved conditions before resolved ones', async () => {
    stub.queryFilter = vi.fn(() => Promise.resolve([
      logFor('0x' + '11'.repeat(32), { expected: 100n }),
      logFor('0x' + '22'.repeat(32), { expected: 200n }),
    ]))
    // First conditionId (11..) is RESOLVED, second (22..) is NOT.
    let call = 0
    stub.isConditionResolved = vi.fn(() => Promise.resolve(++call === 1))

    const { result } = renderHook(() => useOracleConditions(ADAPTER, 'functions'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conditions).toHaveLength(2)
    expect(result.current.conditions[0].isResolved).toBe(false)
    expect(result.current.conditions[0].conditionId).toBe('0x' + '22'.repeat(32))
    expect(result.current.conditions[1].isResolved).toBe(true)
    expect(result.current.conditions[1].conditionId).toBe('0x' + '11'.repeat(32))
  })

  it('exposes the queryFilter error via `error` and clears the list', async () => {
    stub.queryFilter = vi.fn(() => Promise.reject(new Error('RPC down')))
    const { result } = renderHook(() => useOracleConditions(ADAPTER, 'datafeed'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/rpc down/i)
    expect(result.current.conditions).toEqual([])
  })

  it('subscribes to and tears down ConditionRegistered listener', async () => {
    const { result, unmount } = renderHook(() => useOracleConditions(ADAPTER, 'functions'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(stub.on).toHaveBeenCalledWith('ConditionRegistered', expect.any(Function))
    unmount()
    expect(stub.off).toHaveBeenCalledWith('ConditionRegistered', expect.any(Function))
  })

  it('dedupes when the same conditionId is registered twice', async () => {
    stub.queryFilter = vi.fn(() => Promise.resolve([
      logFor('0x' + 'ab'.repeat(32)),
      logFor('0x' + 'ab'.repeat(32)),  // duplicate — should be deduped
    ]))
    const { result } = renderHook(() => useOracleConditions(ADAPTER, 'functions'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conditions).toHaveLength(1)
  })
})
