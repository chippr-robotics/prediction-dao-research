import { describe, it, expect, beforeEach } from 'vitest'
import { list, add, remove } from '../../data/reports/reportHistoryStore'

const ACC = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const CHAIN = 137

const sample = (label = 'Last month (May 2026)') => ({
  periodKind: 'last_month',
  from: '2026-05-01T00:00:00.000Z',
  to: '2026-05-31T23:59:59.999Z',
  label,
})

beforeEach(() => {
  localStorage.clear()
})

describe('reportHistoryStore (FR-010/FR-011/FR-012/FR-014)', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(list(ACC, CHAIN)).toEqual([])
  })

  it('adds entries newest-first and assigns id + createdAt', () => {
    const a = add(ACC, CHAIN, sample('first'))
    add(ACC, CHAIN, sample('second'))
    expect(a.id).toBeTypeOf('string')
    expect(a.createdAt).toBeTypeOf('string')
    const items = list(ACC, CHAIN)
    expect(items.map((e) => e.label)).toEqual(['second', 'first'])
  })

  it('removes a single entry by id without touching others', () => {
    const a = add(ACC, CHAIN, sample('keep'))
    const b = add(ACC, CHAIN, sample('drop'))
    remove(ACC, CHAIN, b.id)
    const items = list(ACC, CHAIN)
    expect(items.map((e) => e.id)).toEqual([a.id])
  })

  it('scopes strictly by account', () => {
    add(ACC, CHAIN, sample('mine'))
    expect(list(OTHER, CHAIN)).toEqual([])
  })

  it('scopes strictly by chainId (FR-014)', () => {
    add(ACC, 137, sample('polygon'))
    expect(list(ACC, 80002)).toEqual([])
  })

  it('treats a corrupt store as empty (defensive)', () => {
    localStorage.setItem(`fw_user_${ACC.toLowerCase()}_tax_report_history_v1_137`, '{not json')
    expect(list(ACC, CHAIN)).toEqual([])
  })

  it('no-ops for a disconnected wallet', () => {
    expect(add(null, CHAIN, sample())).toBeNull()
    expect(list(null, CHAIN)).toEqual([])
  })
})
