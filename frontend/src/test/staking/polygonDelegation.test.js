/**
 * polygonDelegation tests (spec 065, T015) — allowlist decoration is bounded
 * (never expands), exit/claim call encoding, and the unbonding label.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Interface } from 'ethers'
import {
  fetchValidatorDecoration,
  buildUndelegateCalls,
  buildDelegationClaimCalls,
  buildDelegationWithdrawCalls,
  unbondingLabel,
} from '../../lib/staking/polygonDelegation'
import { POLYGON_VALIDATOR_SHARE_ABI } from '../../abis/PolygonValidatorShare'

const IFACE = new Interface(POLYGON_VALIDATOR_SHARE_ABI)
const VS = '0xD14a87025109013B0a2354a775cB335F926Af65A'

afterEach(() => vi.restoreAllMocks())

describe('fetchValidatorDecoration', () => {
  it('decorates only allowlisted ids and never expands the list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [
            { id: 47, commissionPercent: 5, status: 'active', delegationEnabled: true, totalStaked: '10' },
            { id: 999, commissionPercent: 100, status: 'active', delegationEnabled: true }, // NOT allowlisted
          ],
        }),
      }),
    )
    const map = await fetchValidatorDecoration('x', [47, 87])
    expect(map.has(47)).toBe(true)
    expect(map.get(47).commissionPct).toBe(5)
    expect(map.has(999)).toBe(false) // never surfaced — allowlist is the boundary
  })

  it('returns an empty map on failure (honest degradation)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    expect((await fetchValidatorDecoration('x', [47])).size).toBe(0)
  })
})

describe('delegation exit/claim calls', () => {
  it('encodes sellVoucherPOL for undelegation', () => {
    const { calls } = buildUndelegateCalls({ validatorShare: VS, amount: 5n })
    expect(IFACE.parseTransaction({ data: calls[0].data }).name).toBe('sellVoucherPOL')
  })
  it('encodes unstakeClaimTokens_newPOL by nonce', () => {
    const { calls } = buildDelegationWithdrawCalls({ validatorShare: VS, unbondNonce: '7' })
    const parsed = IFACE.parseTransaction({ data: calls[0].data })
    expect(parsed.name).toBe('unstakeClaimTokens_newPOL')
    expect(parsed.args[0]).toBe(7n)
  })
  it('encodes withdrawRewardsPOL for a claim', () => {
    const { calls } = buildDelegationClaimCalls({ validatorShare: VS })
    expect(IFACE.parseTransaction({ data: calls[0].data }).name).toBe('withdrawRewardsPOL')
  })
})

describe('unbondingLabel', () => {
  it('describes the delay in days + checkpoints', () => {
    expect(unbondingLabel(80n)).toBe('~2–4 days (80 checkpoints)')
    expect(unbondingLabel(null)).toBeNull()
  })
})
