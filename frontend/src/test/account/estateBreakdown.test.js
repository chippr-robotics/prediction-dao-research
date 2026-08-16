import { describe, it, expect } from 'vitest'
import { estateByNetwork, estateByCategory } from '../../lib/account/estateBreakdown'

describe('estateByNetwork', () => {
  it('groups priced holdings by network, largest first', () => {
    const { rows, unpricedCount } = estateByNetwork([
      { network: 'Polygon', balance: 100, usd: 100 },
      { network: 'Ethereum Classic', balance: 2, usd: 40 },
      { network: 'Polygon', balance: 5, usd: 5 },
    ])
    expect(rows).toEqual([
      { network: 'Polygon', usd: 105 },
      { network: 'Ethereum Classic', usd: 40 },
    ])
    expect(unpricedCount).toBe(0)
  })

  it('excludes unpriced holdings from subtotals and counts them for disclosure', () => {
    const { rows, unpricedCount } = estateByNetwork([
      { network: 'Mordor', balance: 3, usd: null },
      { network: 'Mordor', balance: 1, usd: 10 },
    ])
    expect(rows).toEqual([{ network: 'Mordor', usd: 10 }])
    expect(unpricedCount).toBe(1)
  })

  it('skips zero balances — they add nothing to an estate view', () => {
    const { rows } = estateByNetwork([{ network: 'Base', balance: 0, usd: 0 }])
    expect(rows).toEqual([])
  })
})

describe('estateByCategory', () => {
  it('keeps taxonomy order and drops categories with nothing held', () => {
    const rows = estateByCategory([
      { category: { id: 'network-assets', label: 'Network Assets' }, aggregates: [{ balance: 2 }], subtotalUsd: 50 },
      { category: { id: 'payment-stablecoins', label: 'Payment Stablecoins' }, aggregates: [], subtotalUsd: 0 },
      { category: { id: 'collectibles', label: 'Collectibles' }, aggregates: [{ balance: 0 }], subtotalUsd: 0 },
      { category: { id: 'unclassified', label: 'Unclassified' }, aggregates: [{ balance: 1 }], subtotalUsd: 7 },
    ])
    expect(rows).toEqual([
      { id: 'network-assets', label: 'Network Assets', usd: 50 },
      { id: 'unclassified', label: 'Unclassified', usd: 7 },
    ])
  })
})
