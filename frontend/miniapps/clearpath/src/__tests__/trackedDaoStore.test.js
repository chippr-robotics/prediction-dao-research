import { describe, it, expect, beforeEach } from 'vitest'
import * as store from '../trackedDaoStore'

// Spec 042 — device-local tracked-DAO store. jsdom provides localStorage.

const A = '0xAAAA000000000000000000000000000000000001'
const B = '0xBBBB000000000000000000000000000000000002'
const acct = '0xMember0000000000000000000000000000000009'

describe('trackedDaoStore (spec 042)', () => {
  beforeEach(() => window.localStorage.clear())

  it('adds and lists a tracked DAO, newest first', () => {
    store.add(1, acct, { address: A, framework: 0, label: 'ENS' })
    store.add(1, acct, { address: B, framework: 1, label: 'Uniswap' })
    const list = store.list(1, acct)
    expect(list).toHaveLength(2)
    expect(list[0].address).toBe(B) // newest first
    expect(list.map((e) => e.label)).toContain('ENS')
  })

  it('rejects a duplicate (case-insensitive) with reason "exists" — no phantom row', () => {
    store.add(1, acct, { address: A, framework: 0, label: 'ENS' })
    const res = store.add(1, acct, { address: A.toLowerCase(), framework: 0, label: 'dup' })
    expect(res.added).toBe(false)
    expect(res.reason).toBe('exists')
    expect(store.list(1, acct)).toHaveLength(1)
  })

  it('has() is case-insensitive', () => {
    store.add(1, acct, { address: A, framework: 0 })
    expect(store.has(1, acct, A.toLowerCase())).toBe(true)
    expect(store.has(1, acct, B)).toBe(false)
  })

  it('removes a tracked DAO', () => {
    store.add(1, acct, { address: A })
    expect(store.remove(1, acct, A).removed).toBe(true)
    expect(store.list(1, acct)).toHaveLength(0)
  })

  it('is strictly scoped per network AND per account (no leakage)', () => {
    store.add(1, acct, { address: A, label: 'mainnet' })
    expect(store.list(137, acct)).toHaveLength(0) // different network
    expect(store.list(1, '0xother')).toHaveLength(0) // different account
    expect(store.list(1, acct)).toHaveLength(1)
  })
})
