/**
 * lidoStaking tests (spec 065, T015) — stake call shape and APR normalization.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildStakeCalls, fetchLidoApr } from '../../lib/staking/lidoStaking'
import { LIDO_CONTRACTS } from '../../config/staking'

const ETH = 10n ** 18n

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lido buildStakeCalls', () => {
  it('sends ETH to wstETH receive() as a single native-value call', () => {
    const { calls, requiresApproval } = buildStakeCalls({ contracts: LIDO_CONTRACTS, amount: ETH })
    expect(requiresApproval).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe(LIDO_CONTRACTS.wsteth)
    expect(calls[0].data).toBe('0x')
    expect(calls[0].value).toBe(ETH)
  })
})

describe('fetchLidoApr', () => {
  it('normalizes the percentage SMA to a fraction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { smaApr: 3.2 } }) }))
    expect(await fetchLidoApr('x')).toBeCloseTo(0.032, 6)
  })

  it('returns null on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await fetchLidoApr('x')).toBeNull()
  })

  it('returns null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    expect(await fetchLidoApr('x')).toBeNull()
  })
})
