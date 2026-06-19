import { describe, it, expect } from 'vitest'
import { computeBreakdowns, oracleLabel } from '../../lib/account/breakdowns'
import { computeSummary } from '../../lib/account/computeSummary'

const ME = '0xMe'

describe('computeBreakdowns (spec 020 — US4, FR-009)', () => {
  const wagers = [
    { id: '1', status: 'resolved', winner: ME, resolutionType: 1 }, // Creator (peer)
    { id: '2', status: 'active', resolutionType: 1 }, // Creator (peer)
    { id: '3', status: 'active', resolutionType: 2 }, // Opponent (peer)
    { id: '4', status: 'refunded', resolutionType: 4 }, // Polymarket (oracle)
  ]
  const transfers = [
    { wagerId: '1', direction: 'deposit', tokenAddress: '0xUSDC', ticker: 'USDC', usdValue: 100 },
    { wagerId: '2', direction: 'deposit', tokenAddress: '0xUSDC', ticker: 'USDC', usdValue: 50 },
    { wagerId: '3', direction: 'deposit', tokenAddress: '0xMATIC', ticker: 'MATIC', usdValue: 25 },
    { wagerId: '4', direction: 'deposit', tokenAddress: '0xUSDC', ticker: 'USDC', usdValue: 10 },
  ]

  it('byStatus counts reconcile to total wagers', () => {
    const { byStatus } = computeBreakdowns({ wagers, transfers })
    const total = byStatus.reduce((a, b) => a + b.count, 0)
    expect(total).toBe(wagers.length)
    const active = byStatus.filter((s) => s.active).reduce((a, b) => a + b.count, 0)
    expect(active).toBe(computeSummary({ wagers, transfers, address: ME }).activeWagers)
  })

  it('byToken ownStakeUsd reconciles to total wagered', () => {
    const { byToken } = computeBreakdowns({ wagers, transfers })
    const sum = byToken.reduce((a, b) => a + b.ownStakeUsd, 0)
    expect(sum).toBe(computeSummary({ wagers, transfers, address: ME }).totalWageredUsd)
    expect(byToken[0].symbol).toBe('USDC') // largest stake first
  })

  it('byOracle labels resolution types from the on-chain enum (peer vs oracle)', () => {
    const { byOracle } = computeBreakdowns({ wagers, transfers })
    const labels = byOracle.map((o) => o.label)
    // Peer/manual resolution must NOT be mislabeled as an oracle.
    expect(labels).toContain('Creator')
    expect(labels).toContain('Opponent')
    // Real oracle types keep their names.
    expect(labels).toContain('Polymarket')
    expect(labels).not.toContain('UMA') // no UMA wager in this fixture
  })

  it('oracleLabel maps the contract enum and falls back for unknown types', () => {
    expect(oracleLabel(0)).toBe('Either')
    expect(oracleLabel(1)).toBe('Creator')
    expect(oracleLabel(3)).toBe('Third Party')
    expect(oracleLabel(4)).toBe('Polymarket')
    expect(oracleLabel(7)).toBe('UMA Optimistic Oracle')
    expect(oracleLabel(99)).toBe('Type 99')
  })
})
