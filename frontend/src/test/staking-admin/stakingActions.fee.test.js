/**
 * Spec 066 (T023): buildStakeForOption routes LIQUID stakes through the StakingRouter
 * when a fee applies (router deployed + rate > 0) and passes the quoted bps as maxFeeBps;
 * otherwise it emits the byte-identical spec-065 direct calls. Delegated always stays the
 * direct ValidatorShare call (fee-free v1).
 */
import { describe, it, expect, vi } from 'vitest'
import { Interface } from 'ethers'
import { STAKING_ROUTER_ABI } from '../../abis/StakingRouter'

// Sentinel the spec-065 direct builders so we can prove which path was taken.
vi.mock('../../lib/staking/lidoStaking', () => ({
  buildStakeCalls: vi.fn(() => ({ calls: [{ target: 'DIRECT_LIDO', data: '0x', value: 0n }], requiresApproval: false })),
}))
vi.mock('../../lib/staking/spolStaking', () => ({
  buildStakeCalls: vi.fn(() => ({ calls: [{ target: 'DIRECT_SPOL', data: '0x', value: 0n }], requiresApproval: true })),
}))
vi.mock('../../lib/staking/polygonDelegation', () => ({
  buildDelegateCalls: vi.fn(() => ({ calls: [{ target: 'DIRECT_DELEGATE', data: '0x', value: 0n }], requiresApproval: true })),
}))

import { buildStakeForOption } from '../../lib/staking/stakingActions'

const IFACE = new Interface(STAKING_ROUTER_ABI)
const ROUTER = '0x1111111111111111111111111111111111111111'
const POL = '0x2222222222222222222222222222222222222222'
const ctx = { account: '0xabc', amount: 1000n, polToken: POL, provider: {} }

describe('buildStakeForOption — LIQUID fee routing', () => {
  it('lido: routes through the router when a fee applies, passing maxFeeBps', async () => {
    const option = { providerKind: 'lido', stakingRouterAddress: ROUTER, feeQuote: { available: true, bps: 50 } }
    const { calls } = await buildStakeForOption(option, ctx)
    expect(calls[0].target).toBe(ROUTER)
    expect(calls[0].value).toBe(1000n)
    const decoded = IFACE.parseTransaction({ data: calls[0].data })
    expect(decoded.name).toBe('stakeLido')
    expect(Number(decoded.args[0])).toBe(50)
  })

  it('lido: uses the direct spec-065 path when the rate is 0', async () => {
    const option = { providerKind: 'lido', stakingRouterAddress: ROUTER, feeQuote: { available: true, bps: 0 } }
    const { calls } = await buildStakeForOption(option, ctx)
    expect(calls[0].target).toBe('DIRECT_LIDO')
  })

  it('lido: uses the direct path when no router is deployed', async () => {
    const option = { providerKind: 'lido', feeQuote: { available: true, bps: 50 } }
    const { calls } = await buildStakeForOption(option, ctx)
    expect(calls[0].target).toBe('DIRECT_LIDO')
  })

  it('spol: routes approve-router + stakeSpol when a fee applies', async () => {
    const option = { providerKind: 'spol', stakingRouterAddress: ROUTER, feeQuote: { available: true, bps: 40 } }
    const { calls, requiresApproval } = await buildStakeForOption(option, ctx)
    expect(requiresApproval).toBe(true)
    expect(calls[0].target).toBe(POL) // approve leg
    expect(calls[1].target).toBe(ROUTER)
    const stake = IFACE.parseTransaction({ data: calls[1].data })
    expect(stake.name).toBe('stakeSpol')
    expect(stake.args[0]).toBe(1000n)
    expect(Number(stake.args[1])).toBe(40)
  })

  it('delegated: always the direct ValidatorShare call, even with a fee quote (fee-free v1)', async () => {
    const option = {
      providerKind: 'validator-share',
      validatorShare: '0x3333333333333333333333333333333333333333',
      stakeManager: '0x4444444444444444444444444444444444444444',
      stakingRouterAddress: ROUTER,
      feeQuote: { available: true, bps: 50 },
    }
    const { calls } = await buildStakeForOption(option, ctx)
    expect(calls[0].target).toBe('DIRECT_DELEGATE')
  })
})
