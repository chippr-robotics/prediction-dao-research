/**
 * useGaslessWrite tests — the reusable call-site seam. useIntentAction (the state machine) and
 * intentClient.signIntent are mocked at the module boundary, so these assert only the helper's own
 * job: resolve the EIP-712 verifying contract from the action's verifier, shape params from run()
 * args, and pass a correct config through to useIntentAction (incl. the payment leg for payment-class
 * actions). The routing/never-stranded behaviour is covered by useIntentAction's own suite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({
  useIntentAction: vi.fn((cfg) => ({ __cfg: cfg, status: 'idle', run: vi.fn() })),
  signIntent: vi.fn(async (args) => ({ __signed: args })),
  getContractAddressForChain: vi.fn((name, cid) => `0xADDR_${name}_${cid}`),
  useWeb3: vi.fn(() => ({ signer: { getAddress: async () => '0xSIGNER' }, chainId: 63 })),
}))
vi.mock('../useIntentAction', () => ({ useIntentAction: h.useIntentAction }))
vi.mock('../intentClient', () => ({ signIntent: h.signIntent }))
vi.mock('../../../config/contracts', () => ({ getContractAddressForChain: h.getContractAddressForChain }))
vi.mock('../../../hooks/useWeb3', () => ({ useWeb3: h.useWeb3 }))

import { useGaslessWrite } from '../useGaslessWrite'

describe('useGaslessWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes action/chainId/selfSubmit through to useIntentAction', () => {
    const selfSubmit = vi.fn()
    renderHook(() => useGaslessWrite('cancelOpen', { params: (id) => ({ wagerId: id }), selfSubmit }))
    const cfg = h.useIntentAction.mock.calls[0][0]
    expect(cfg.action).toBe('cancelOpen')
    expect(cfg.chainId).toBe(63)
    expect(cfg.selfSubmit).toBe(selfSubmit)
    expect(typeof cfg.buildIntent).toBe('function')
  })

  it('buildIntent signs with the resolved wagerRegistry target + shaped params (signer-attributed, no payment)', async () => {
    renderHook(() => useGaslessWrite('cancelOpen', { params: (id) => ({ wagerId: id }), selfSubmit: vi.fn() }))
    const cfg = h.useIntentAction.mock.calls[0][0]
    await cfg.buildIntent(42)
    expect(h.getContractAddressForChain).toHaveBeenCalledWith('wagerRegistry', 63)
    expect(h.signIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cancelOpen',
        chainId: 63,
        targetContract: '0xADDR_wagerRegistry_63',
        params: { wagerId: 42 },
      })
    )
    expect(h.signIntent.mock.calls[0][0].payment).toBeUndefined()
  })

  it('forwards payment.value + targets membershipManager for a payment-class action', async () => {
    renderHook(() =>
      useGaslessWrite('purchaseTier', {
        params: (role, tier, terms) => ({ role, tier, acceptedTermsHash: terms }),
        payment: (_role, _tier, _terms, price) => ({ value: price }),
        selfSubmit: vi.fn(),
      })
    )
    const cfg = h.useIntentAction.mock.calls[0][0]
    await cfg.buildIntent('0xROLE', 2, '0xTERMS', 5000000n)
    expect(h.getContractAddressForChain).toHaveBeenCalledWith('membershipManager', 63)
    expect(h.signIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'purchaseTier',
        targetContract: '0xADDR_membershipManager_63',
        params: { role: '0xROLE', tier: 2, acceptedTermsHash: '0xTERMS' },
        payment: { value: 5000000n },
      })
    )
  })

  it('honors an explicit targetContract override (never resolves from the verifier)', async () => {
    renderHook(() =>
      useGaslessWrite('declineWager', {
        targetContract: '0xMODAL_REGISTRY',
        params: (id) => ({ wagerId: id }),
        selfSubmit: vi.fn(),
      })
    )
    const cfg = h.useIntentAction.mock.calls[0][0]
    await cfg.buildIntent(9)
    expect(h.getContractAddressForChain).not.toHaveBeenCalled()
    expect(h.signIntent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'declineWager', targetContract: '0xMODAL_REGISTRY', params: { wagerId: 9 } })
    )
  })

  it('tolerates an unconfigured chain (getContractAddressForChain throws) → null target, no crash', () => {
    h.getContractAddressForChain.mockImplementationOnce(() => {
      throw new Error('no address for chain')
    })
    const { result } = renderHook(() => useGaslessWrite('cancelOpen', { params: (id) => ({ wagerId: id }), selfSubmit: vi.fn() }))
    // render must not throw; the hook still returns a useIntentAction handle
    expect(result.current).toBeTruthy()
    const cfg = h.useIntentAction.mock.calls[0][0]
    expect(cfg.action).toBe('cancelOpen')
  })
})
