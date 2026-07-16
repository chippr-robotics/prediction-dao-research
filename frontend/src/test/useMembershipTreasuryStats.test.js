import { describe, it, expect } from 'vitest'
import { reduceMembershipTreasuryStats } from '../hooks/useMembershipTreasuryStats'

// Role hash is opaque to the reducer — any distinct string keys a (user,role) member.
const ROLE = '0x' + 'w'.charCodeAt(0).toString(16).repeat(64).slice(0, 64)
const A = '0x' + 'a'.repeat(40)
const B = '0x' + 'b'.repeat(40)
const C = '0x' + 'c'.repeat(40)

// USDC (6-decimal) helper.
const usdc = (n) => BigInt(Math.round(n * 1e6))

const NOW = 1_000_000
const FUTURE = NOW + 10_000 // still active
const PAST = NOW - 10_000 // expired

describe('reduceMembershipTreasuryStats (admin overview: membership + treasury)', () => {
  it('tallies lifetime event counts across the membership lifecycle', () => {
    const events = [
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 1, price: usdc(2), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      { name: 'MembershipGranted', args: { user: B, role: ROLE, tier: 3, expiresAt: FUTURE }, blockNumber: 11, logIndex: 0 },
      { name: 'MembershipRedeemed', args: { user: C, role: ROLE, tier: 2, voucherId: 7, expiresAt: FUTURE }, blockNumber: 12, logIndex: 0 },
      { name: 'MembershipExtended', args: { user: A, role: ROLE, durationDays: 30, price: usdc(2), expiresAt: FUTURE }, blockNumber: 13, logIndex: 0 },
      { name: 'MembershipUpgraded', args: { user: A, role: ROLE, fromTier: 1, toTier: 2, delta: usdc(6) }, blockNumber: 14, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    expect(d.counts).toEqual({ purchased: 1, granted: 1, redeemed: 1, extended: 1, upgraded: 1, revoked: 0 })
    expect(d.totalEvents).toBe(5)
    expect(d.truncated).toBe(false)
  })

  it('sums membership revenue only from paid streams (grants/redemptions are free)', () => {
    const events = [
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 1, price: usdc(2), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      { name: 'MembershipGranted', args: { user: B, role: ROLE, tier: 4, expiresAt: FUTURE }, blockNumber: 11, logIndex: 0 },
      { name: 'MembershipRedeemed', args: { user: C, role: ROLE, tier: 2, voucherId: 1, expiresAt: FUTURE }, blockNumber: 12, logIndex: 0 },
      { name: 'MembershipExtended', args: { user: A, role: ROLE, durationDays: 30, price: usdc(2), expiresAt: FUTURE }, blockNumber: 13, logIndex: 0 },
      { name: 'MembershipUpgraded', args: { user: A, role: ROLE, fromTier: 1, toTier: 2, delta: usdc(6) }, blockNumber: 14, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    expect(d.revenue.purchases).toBe(usdc(2))
    expect(d.revenue.extensions).toBe(usdc(2))
    expect(d.revenue.upgrades).toBe(usdc(6))
    expect(d.revenue.total).toBe(usdc(10)) // grant + voucher contribute nothing
    expect(d.revenue.withdrawn).toBe(0n)
  })

  it('attributes revenue to the member current tier, including extensions and upgrades', () => {
    const events = [
      // A buys Bronze ($2), extends at Bronze ($2), then upgrades to Silver ($6 delta).
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 1, price: usdc(2), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      { name: 'MembershipExtended', args: { user: A, role: ROLE, durationDays: 30, price: usdc(2), expiresAt: FUTURE }, blockNumber: 11, logIndex: 0 },
      { name: 'MembershipUpgraded', args: { user: A, role: ROLE, fromTier: 1, toTier: 2, delta: usdc(6) }, blockNumber: 12, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    // Bronze: purchase $2 + extension $2 (extension attributed to current tier at that block = Bronze)
    expect(d.revenueByTier[1]).toBe(usdc(4))
    // Silver: upgrade delta $6 attributed to toTier
    expect(d.revenueByTier[2]).toBe(usdc(6))
    expect(d.revenueByTier[3]).toBe(0n)
  })

  it('counts active members by tier using expiry and de-dupes repeat events per user', () => {
    const events = [
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 1, price: usdc(2), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      // A upgrades to Silver — still ONE member, now Silver.
      { name: 'MembershipUpgraded', args: { user: A, role: ROLE, fromTier: 1, toTier: 2, delta: usdc(6) }, blockNumber: 11, logIndex: 0 },
      { name: 'MembershipGranted', args: { user: B, role: ROLE, tier: 3, expiresAt: FUTURE }, blockNumber: 12, logIndex: 0 },
      // C's membership is already expired.
      { name: 'MembershipPurchased', args: { user: C, role: ROLE, tier: 1, price: usdc(2), expiresAt: PAST }, blockNumber: 13, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    expect(d.members.everMembers).toBe(3) // A, B, C
    expect(d.members.active).toBe(2) // A (Silver), B (Gold); C expired
    expect(d.members.byTier).toEqual({ 1: 0, 2: 1, 3: 1, 4: 0 })
  })

  it('drops revoked members from the active set', () => {
    const events = [
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 2, price: usdc(8), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      { name: 'MembershipRevoked', args: { user: A, role: ROLE, by: B }, blockNumber: 11, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    expect(d.counts.revoked).toBe(1)
    expect(d.members.active).toBe(0)
    expect(d.members.byTier[2]).toBe(0)
  })

  it('accumulates withdrawals to the treasury from FeesWithdrawn', () => {
    const events = [
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 4, price: usdc(100), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      { name: 'FeesWithdrawn', args: { to: B, amount: usdc(60) }, blockNumber: 11, logIndex: 0 },
      { name: 'FeesWithdrawn', args: { to: B, amount: usdc(40) }, blockNumber: 12, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    expect(d.revenue.total).toBe(usdc(100))
    expect(d.revenue.withdrawn).toBe(usdc(100))
  })

  it('builds a monotonic cumulative revenue series ordered by block', () => {
    const events = [
      { name: 'MembershipUpgraded', args: { user: A, role: ROLE, fromTier: 1, toTier: 2, delta: usdc(6) }, blockNumber: 30, logIndex: 0 },
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 1, price: usdc(2), expiresAt: FUTURE }, blockNumber: 10, logIndex: 0 },
      { name: 'MembershipExtended', args: { user: A, role: ROLE, durationDays: 30, price: usdc(2), expiresAt: FUTURE }, blockNumber: 20, logIndex: 0 },
    ]
    const d = reduceMembershipTreasuryStats(events, false, NOW)
    // Reordered by block: purchase(2) → extend(4) → upgrade(10).
    expect(d.series.map((p) => p.block)).toEqual([10, 20, 30])
    expect(d.series.map((p) => p.cumulative)).toEqual([usdc(2), usdc(4), usdc(10)])
  })

  it('orders the recent feed newest-first and honors the truncated flag', () => {
    const events = [
      { name: 'MembershipPurchased', args: { user: A, role: ROLE, tier: 1, price: usdc(2), expiresAt: FUTURE }, blockNumber: 5, logIndex: 0 },
      { name: 'MembershipRevoked', args: { user: A, role: ROLE, by: B }, blockNumber: 30, logIndex: 2 },
      { name: 'MembershipGranted', args: { user: B, role: ROLE, tier: 2, expiresAt: FUTURE }, blockNumber: 30, logIndex: 1 },
    ]
    const d = reduceMembershipTreasuryStats(events, true, NOW)
    expect(d.truncated).toBe(true)
    expect(d.recent.map((r) => r.type)).toEqual(['MembershipRevoked', 'MembershipGranted', 'MembershipPurchased'])
    expect(d.recent[0].block).toBe(30)
  })

  it('handles an empty event set', () => {
    const d = reduceMembershipTreasuryStats([], false, NOW)
    expect(d.counts).toEqual({ purchased: 0, granted: 0, redeemed: 0, extended: 0, upgraded: 0, revoked: 0 })
    expect(d.revenue.total).toBe(0n)
    expect(d.members.active).toBe(0)
    expect(d.series).toEqual([])
    expect(d.recent).toEqual([])
  })
})
