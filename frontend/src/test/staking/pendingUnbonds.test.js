/**
 * pendingUnbonds tests (spec 065, T016) — add/list/prune with idempotency,
 * scoped per account+chain.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addPendingUnbond,
  listPendingUnbonds,
  prunePendingUnbond,
  unbondKey,
} from '../../lib/staking/pendingUnbonds'

const ACCOUNT = '0x1111111111111111111111111111111111111111'
const CHAIN = 1

beforeEach(() => {
  localStorage.clear()
})

describe('pendingUnbonds', () => {
  it('adds and lists a request', () => {
    const req = { optionId: 'liquid:lido', model: 'liquid', handle: { requestId: '42' }, amountRaw: '1000', initiatedAt: 1 }
    addPendingUnbond(ACCOUNT, CHAIN, req)
    const list = listPendingUnbonds(ACCOUNT, CHAIN)
    expect(list).toHaveLength(1)
    expect(list[0].handle.requestId).toBe('42')
  })

  it('is idempotent by unbondKey (no duplicates)', () => {
    const req = { optionId: 'delegated:47', model: 'delegated', handle: { unbondNonce: '7' }, amountRaw: '5', initiatedAt: 1 }
    addPendingUnbond(ACCOUNT, CHAIN, req)
    addPendingUnbond(ACCOUNT, CHAIN, { ...req })
    expect(listPendingUnbonds(ACCOUNT, CHAIN)).toHaveLength(1)
  })

  it('prunes a claimed request', () => {
    const req = { optionId: 'liquid:spol', model: 'liquid', handle: { unbondNonce: '3' }, amountRaw: '9', initiatedAt: 1 }
    addPendingUnbond(ACCOUNT, CHAIN, req)
    prunePendingUnbond(ACCOUNT, CHAIN, req)
    expect(listPendingUnbonds(ACCOUNT, CHAIN)).toHaveLength(0)
  })

  it('scopes by chain', () => {
    addPendingUnbond(ACCOUNT, 1, { optionId: 'liquid:lido', handle: { requestId: '1' } })
    expect(listPendingUnbonds(ACCOUNT, 137)).toHaveLength(0)
    expect(listPendingUnbonds(ACCOUNT, 1)).toHaveLength(1)
  })

  it('unbondKey distinguishes request ids from nonces', () => {
    expect(unbondKey({ optionId: 'a', handle: { requestId: '5' } })).toBe('a:req:5')
    expect(unbondKey({ optionId: 'a', handle: { unbondNonce: '5' } })).toBe('a:nonce:5')
  })
})
