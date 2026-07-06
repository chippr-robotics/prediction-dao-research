import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  recordTransfer,
  updateTransfer,
  listTransfers,
  subscribeTransfers,
  __clearTransfers,
  TRANSFER_STATUS,
} from '../lib/transfer/transferStore'

const A = '0xAaAa000000000000000000000000000000000001'
const B = '0xBbBb000000000000000000000000000000000002'

describe('Pay & Transfer — local activity store', () => {
  beforeEach(() => __clearTransfers())

  it('records a transfer with defaults and lists it newest-first, scoped by address', () => {
    const r1 = recordTransfer(A, { chainId: 137, kind: 'stable', symbol: 'USDC', amount: '10', from: A, to: B })
    const r2 = recordTransfer(A, { chainId: 137, kind: 'native', symbol: 'MATIC', amount: '1', from: A, to: B })
    expect(r1.status).toBe(TRANSFER_STATUS.IN_PROCESS)
    expect(r1.id).toBeTruthy()

    const forA = listTransfers(A)
    expect(forA.map((r) => r.id)).toEqual([r2.id, r1.id]) // newest first
    expect(listTransfers(B)).toEqual([]) // scoped by sender
  })

  it('filters by chainId', () => {
    recordTransfer(A, { chainId: 137, kind: 'stable', symbol: 'USDC', amount: '10', from: A, to: B })
    recordTransfer(A, { chainId: 80002, kind: 'stable', symbol: 'USDC', amount: '5', from: A, to: B })
    expect(listTransfers(A, 137)).toHaveLength(1)
    expect(listTransfers(A, 80002)).toHaveLength(1)
    expect(listTransfers(A)).toHaveLength(2)
  })

  it('updates status + txHash and notifies subscribers', () => {
    const listener = vi.fn()
    const unsub = subscribeTransfers(listener)
    const rec = recordTransfer(A, { chainId: 137, kind: 'stable', symbol: 'USDC', amount: '10', from: A, to: B })
    updateTransfer(A, rec.id, { status: TRANSFER_STATUS.COMPLETE, txHash: '0xdead' })

    const [row] = listTransfers(A)
    expect(row.status).toBe(TRANSFER_STATUS.COMPLETE)
    expect(row.txHash).toBe('0xdead')
    expect(listener).toHaveBeenCalled() // record + update both fire
    unsub()
  })

  it('is case-insensitive on the sender address', () => {
    recordTransfer(A.toUpperCase(), { chainId: 137, kind: 'native', symbol: 'MATIC', amount: '1', from: A, to: B })
    expect(listTransfers(A.toLowerCase())).toHaveLength(1)
  })
})
