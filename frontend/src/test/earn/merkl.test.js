/**
 * Merkl rewards module tests (spec 050, contracts/merkl-rewards.md) —
 * cumulative claimable math, lowercased address, per-chain scoping, claim-arg
 * construction (CUMULATIVE amounts), and honest failure.
 */
import { describe, it, expect, vi } from 'vitest'
import { fetchRewards, buildClaimArgs, normalizeReward, MerklApiError } from '../../lib/earn/merkl'

const NOW = 1_752_000_000_000
const ACCOUNT = '0x00000000000000000000000000000000000000AC'

const REWARD_RECORD = {
  token: { address: '0xMORPHO', symbol: 'MORPHO', decimals: 18 },
  amount: '2000000000000000000',
  claimed: '500000000000000000',
  pending: '100000000000000000',
  proofs: ['0xaa', '0xbb'],
}

const responseFor = (records, chainId = 137) => [{ chain: { id: chainId }, rewards: records }]

describe('normalizeReward', () => {
  it('computes claimable = amount − claimed as bigints', () => {
    const reward = normalizeReward(REWARD_RECORD, { nowMs: NOW })
    expect(reward.amount).toBe(2000000000000000000n)
    expect(reward.claimed).toBe(500000000000000000n)
    expect(reward.claimable).toBe(1500000000000000000n)
    expect(reward.pending).toBe(100000000000000000n)
    expect(reward.fetchedAt).toBe(NOW)
  })

  it('never goes negative when claimed exceeds amount', () => {
    const reward = normalizeReward({ ...REWARD_RECORD, amount: '1', claimed: '5' }, { nowMs: NOW })
    expect(reward.claimable).toBe(0n)
  })
})

describe('fetchRewards', () => {
  it('lowercases the address in the request URL and scopes to the chain', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        ...responseFor([REWARD_RECORD], 137),
        ...responseFor([{ ...REWARD_RECORD, token: { ...REWARD_RECORD.token, address: '0xOther' } }], 1),
      ],
    }))
    const rewards = await fetchRewards(ACCOUNT, 137, { fetchImpl, nowMs: NOW })
    expect(fetchImpl.mock.calls[0][0]).toContain(`/users/${ACCOUNT.toLowerCase()}/rewards?chainId=137`)
    expect(rewards).toHaveLength(1)
    expect(rewards[0].token.address).toBe('0xMORPHO')
  })

  it('drops rewards with nothing claimable and nothing pending', async () => {
    const spent = { ...REWARD_RECORD, amount: '5', claimed: '5', pending: '0' }
    const fetchImpl = async () => ({ ok: true, json: async () => responseFor([spent]) })
    await expect(fetchRewards(ACCOUNT, 137, { fetchImpl, nowMs: NOW })).resolves.toEqual([])
  })

  it('throws MerklApiError on HTTP/network failure (never a fabricated zero)', async () => {
    await expect(
      fetchRewards(ACCOUNT, 137, { fetchImpl: async () => ({ ok: false, status: 500 }), nowMs: NOW }),
    ).rejects.toBeInstanceOf(MerklApiError)
    await expect(
      fetchRewards(ACCOUNT, 137, {
        fetchImpl: async () => {
          throw new Error('offline')
        },
        nowMs: NOW,
      }),
    ).rejects.toBeInstanceOf(MerklApiError)
  })
})

describe('buildClaimArgs', () => {
  const claimable = normalizeReward(REWARD_RECORD, { nowMs: NOW })
  const pendingOnly = normalizeReward(
    { ...REWARD_RECORD, token: { ...REWARD_RECORD.token, address: '0xP' }, amount: '5', claimed: '5' },
    { nowMs: NOW },
  )
  const noProofs = normalizeReward(
    { ...REWARD_RECORD, token: { ...REWARD_RECORD.token, address: '0xN' }, proofs: [] },
    { nowMs: NOW },
  )

  it('builds index-aligned parallel arrays with CUMULATIVE amounts', () => {
    const args = buildClaimArgs(ACCOUNT, [claimable, pendingOnly, noProofs])
    expect(args.users).toEqual([ACCOUNT])
    expect(args.tokens).toEqual(['0xMORPHO'])
    // Cumulative amount, NOT the claimable difference.
    expect(args.amounts).toEqual([2000000000000000000n])
    expect(args.proofs).toEqual([['0xaa', '0xbb']])
  })

  it('returns null when nothing is claimable — the wallet is never prompted for a no-op', () => {
    expect(buildClaimArgs(ACCOUNT, [pendingOnly, noProofs])).toBeNull()
    expect(buildClaimArgs(ACCOUNT, [])).toBeNull()
    expect(buildClaimArgs(null, [claimable])).toBeNull()
  })
})
