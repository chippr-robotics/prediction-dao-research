import { describe, it, expect } from 'vitest'
import { WAGER_STATUS_NAMES } from '../utils/blockchainService'

/**
 * Regression test for spec 012 (T002): WAGER_STATUS_NAMES must map ALL seven
 * on-chain statuses from IWagerRegistry.sol:
 *
 *   enum Status { None, Open, Active, Resolved, Cancelled, Refunded, Draw }
 *
 * Before this fix the array stopped at index 5 ('refunded'), so an on-chain
 * Draw (6) fell through toWagerShape's `|| 'unknown'` fallback and the UI
 * (and the spec-012 activity diff engine) never saw a 'draw' status.
 */
describe('WAGER_STATUS_NAMES (on-chain Status enum mapping)', () => {
  it('maps all 7 on-chain statuses', () => {
    expect(WAGER_STATUS_NAMES).toEqual([
      'none', // 0 None
      'pending', // 1 Open
      'active', // 2 Active
      'resolved', // 3 Resolved
      'cancelled', // 4 Cancelled
      'refunded', // 5 Refunded
      'draw', // 6 Draw
    ])
  })

  it('maps on-chain Draw (6) to "draw"', () => {
    expect(WAGER_STATUS_NAMES[6]).toBe('draw')
  })

  it('maps on-chain Open (1) to "pending"', () => {
    expect(WAGER_STATUS_NAMES[1]).toBe('pending')
  })

  it('has exactly 7 entries (one per enum value, no fallthrough to "unknown")', () => {
    expect(WAGER_STATUS_NAMES).toHaveLength(7)
  })
})
