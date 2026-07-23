/**
 * Spec 066 (T025/T028/T031): overlayRouterConfig overlays the on-chain router config onto
 * the member option list — provider addresses (US3), paused flag (US2), validator allowlist
 * (US4, removed validators drop from NEW-stake options), and the LIQUID fee (US1) — and safely
 * falls back to the spec-065 constants when the router is undeployed or unreadable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/staking/stakingRouter', () => ({ readStakingRouterConfig: vi.fn() }))
vi.mock('../../lib/fees/feeQuote', async (orig) => ({ ...(await orig()), fetchFeeQuote: vi.fn() }))

import { overlayRouterConfig } from '../../hooks/useStakingOptions'
import { readStakingRouterConfig } from '../../lib/staking/stakingRouter'
import { fetchFeeQuote } from '../../lib/fees/feeQuote'

const ROUTER = '0x1111111111111111111111111111111111111111'
const ctx = { chainId: 1, provider: {} }

beforeEach(() => {
  vi.clearAllMocks()
  fetchFeeQuote.mockResolvedValue({ available: true, bps: 50, capBps: 250 })
})

describe('overlayRouterConfig — safe fallback', () => {
  it('leaves options untouched (fee-free) when no router is deployed', async () => {
    readStakingRouterConfig.mockResolvedValue(null)
    const opts = [{ providerKind: 'lido', contracts: { steth: '0xold', wsteth: '0xold2' } }]
    await overlayRouterConfig(opts, ctx)
    expect(opts[0].feeQuote).toBeUndefined()
    expect(opts[0].stakingPaused).toBeUndefined()
    expect(opts[0].contracts.steth).toBe('0xold')
  })
})

describe('overlayRouterConfig — router present', () => {
  beforeEach(() => {
    readStakingRouterConfig.mockResolvedValue({
      routerAddress: ROUTER,
      paused: true,
      providers: {
        lido: { steth: '0xNEWste', wsteth: '0xNEWwst' },
        spol: { controller: undefined, token: undefined },
        polygon: { polToken: undefined, stakeManager: undefined },
      },
      validators: ['0xkeep000000000000000000000000000000000001'],
    })
  })

  it('overlays provider addresses, the paused flag, and the LIQUID fee', async () => {
    const opts = [{ providerKind: 'lido', contracts: { steth: '0xold', wsteth: '0xold2' } }]
    await overlayRouterConfig(opts, ctx)
    expect(opts[0].contracts.steth).toBe('0xNEWste')
    expect(opts[0].stakingPaused).toBe(true)
    expect(opts[0].stakingRouterAddress).toBe(ROUTER)
    expect(opts[0].feeQuote).toEqual({ available: true, bps: 50, capBps: 250 })
    expect(opts[0].stakingFeeBps).toBe(50)
  })

  it('drops validators removed from the on-chain allowlist (case-insensitive)', async () => {
    const opts = [
      { providerKind: 'validator-share', validatorShare: '0xKEEP000000000000000000000000000000000001' },
      { providerKind: 'validator-share', validatorShare: '0xDROP000000000000000000000000000000000002' },
    ]
    await overlayRouterConfig(opts, ctx)
    expect(opts).toHaveLength(1)
    expect(opts[0].validatorShare).toBe('0xKEEP000000000000000000000000000000000001')
    expect(opts[0].feeQuote).toBeUndefined() // delegated is fee-free
  })

  it('blocks the fee path (feeBlocked) when the rate read throws', async () => {
    fetchFeeQuote.mockRejectedValue(new Error('rpc down'))
    const opts = [{ providerKind: 'lido', contracts: {} }]
    await overlayRouterConfig(opts, ctx)
    expect(opts[0].feeBlocked).toBe(true)
    expect(opts[0].feeQuote).toBeNull()
  })
})
