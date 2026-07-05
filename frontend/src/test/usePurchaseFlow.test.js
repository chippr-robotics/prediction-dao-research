import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock the services the hook depends on so we drive the wallet sequence
// deterministically without any chain calls (spec 022).
vi.mock('../utils/blockchainService', () => ({
  purchaseRoleWithStablecoin: vi.fn(),
  checkApprovalNeeded: vi.fn(),
  resolveMembershipIntentParams: vi.fn(),
}))
vi.mock('../utils/keyRegistryService', () => ({
  ensureKeyRegistered: vi.fn(),
}))

// Specs 035 + 036: the hook now routes the pay through useGaslessWrite. With no relayer configured
// (test default) the real seam self-submits anyway, but useGaslessWrite calls useWeb3() which throws
// outside a WalletProvider — so mock it to run the caller's selfSubmit directly. selfSubmit is the
// existing purchaseFn (approve+pay) call, so the step-machine assertions are unchanged. The
// self-submit leg returns errors in `result.error` (never throws), matching useIntentAction.
vi.mock('../lib/relay/useGaslessWrite', () => ({
  useGaslessWrite: (_action, cfg) => ({
    run: async (...args) => {
      try {
        const receipt = await cfg.selfSubmit(...args)
        return { via: 'self-submit', receipt, txHash: receipt?.hash ?? receipt?.transactionHash }
      } catch (error) {
        return { via: 'self-submit', error }
      }
    },
    status: 'idle', intent: null, result: null, error: null,
    invalidate: vi.fn(), selfSubmitNow: vi.fn(), reset: vi.fn(),
  }),
}))

import { usePurchaseFlow } from '../hooks/usePurchaseFlow'
import { purchaseRoleWithStablecoin, checkApprovalNeeded, resolveMembershipIntentParams } from '../utils/blockchainService'
import { ensureKeyRegistered } from '../utils/keyRegistryService'

// A resolved intent-params object; its exact contents don't matter to the step machine (the mocked
// gasless seam forwards straight to selfSubmit), only that it resolves so the purchase segment proceeds.
const INTENT_PARAMS = {
  roleHash: '0x' + '11'.repeat(32),
  validTier: 1,
  price: 2000000n,
  acceptedTermsHash: '0x' + '00'.repeat(32),
}

const baseParams = (overrides = {}) => ({
  signer: { getAddress: async () => '0xabc' },
  account: '0xabc',
  roleName: 'WAGER_PARTICIPANT',
  priceUSD: 2,
  tier: 1,
  action: 'purchase',
  termsHash: null,
  ensureInitialized: vi.fn(async () => ({ publicKey: new Uint8Array([1, 2, 3]) })),
  onPaid: vi.fn(async () => {}),
  ...overrides,
})

describe('usePurchaseFlow — step list construction (FR-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveMembershipIntentParams.mockResolvedValue(INTENT_PARAMS)
    purchaseRoleWithStablecoin.mockResolvedValue({ hash: '0xpay' })
    ensureKeyRegistered.mockResolvedValue(true)
  })

  it('includes the approve step when allowance is insufficient', async () => {
    checkApprovalNeeded.mockResolvedValue(true)
    const { result } = renderHook(() => usePurchaseFlow())

    await act(async () => { await result.current.start(baseParams()) })

    const ids = result.current.steps.map((s) => s.id)
    expect(ids).toEqual(['approve', 'pay', 'sign', 'register'])
    expect(result.current.total).toBe(4)
  })

  it('OMITS the approve step entirely when allowance already covers the price', async () => {
    checkApprovalNeeded.mockResolvedValue(false)
    const { result } = renderHook(() => usePurchaseFlow())

    await act(async () => { await result.current.start(baseParams()) })

    const ids = result.current.steps.map((s) => s.id)
    expect(ids).toEqual(['pay', 'sign', 'register'])
    expect(result.current.total).toBe(3)
  })

  it('marks signature vs transaction kinds correctly', async () => {
    checkApprovalNeeded.mockResolvedValue(true)
    const { result } = renderHook(() => usePurchaseFlow())
    await act(async () => { await result.current.start(baseParams()) })

    const byId = Object.fromEntries(result.current.steps.map((s) => [s.id, s]))
    expect(byId.approve.kind).toBe('transaction')
    expect(byId.pay.kind).toBe('transaction')
    expect(byId.sign.kind).toBe('signature')
    expect(byId.register.kind).toBe('transaction')
    expect(byId.sign.blocking).toBe(false)
    expect(byId.pay.blocking).toBe(true)
  })
})

describe('usePurchaseFlow — happy path & progress (US2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveMembershipIntentParams.mockResolvedValue(INTENT_PARAMS)
    checkApprovalNeeded.mockResolvedValue(false)
    ensureKeyRegistered.mockResolvedValue(true)
  })

  it('drives approve/pay step state from onProgress events and completes', async () => {
    purchaseRoleWithStablecoin.mockImplementation(async (...args) => {
      const onProgress = args[6]
      onProgress({ step: 'pay', phase: 'start' })
      onProgress({ step: 'pay', phase: 'sent', txHash: '0xp' })
      onProgress({ step: 'pay', phase: 'confirmed', txHash: '0xp' })
      return { hash: '0xp' }
    })
    const params = baseParams()
    const { result } = renderHook(() => usePurchaseFlow())

    await act(async () => { await result.current.start(params) })

    expect(result.current.status).toBe('succeeded')
    expect(result.current.steps.every((s) => s.state === 'completed')).toBe(true)
    expect(result.current.completedCount).toBe(3)
    expect(result.current.progressFraction).toBe(1)
    expect(result.current.keyRegOutcome).toBe('success')
    expect(params.onPaid).toHaveBeenCalledTimes(1)
  })

  it('reports skipped key registration as "skipped"', async () => {
    purchaseRoleWithStablecoin.mockResolvedValue({ hash: '0xp' })
    ensureKeyRegistered.mockResolvedValue(false)
    const { result } = renderHook(() => usePurchaseFlow())
    await act(async () => { await result.current.start(baseParams()) })
    expect(result.current.keyRegOutcome).toBe('skipped')
  })
})

describe('usePurchaseFlow — failure attribution & recovery (US3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveMembershipIntentParams.mockResolvedValue(INTENT_PARAMS)
    checkApprovalNeeded.mockResolvedValue(false)
  })

  it('attributes a payment rejection to the pay step with a reason (FR-007)', async () => {
    purchaseRoleWithStablecoin.mockImplementation(async (...args) => {
      const onProgress = args[6]
      onProgress({ step: 'pay', phase: 'start' })
      throw new Error('Transaction rejected by user')
    })
    const { result } = renderHook(() => usePurchaseFlow())

    await act(async () => { await result.current.start(baseParams()) })

    expect(result.current.status).toBe('failed')
    const pay = result.current.steps.find((s) => s.id === 'pay')
    expect(pay.state).toBe('failed')
    expect(pay.failureReason).toMatch(/rejected/i)
    // Non-blocking continue must NOT be offered for a blocking pay failure.
    expect(result.current.canContinueAnyway).toBe(false)
  })

  it('retry after a key-registration failure does NOT re-run payment (FR-008)', async () => {
    purchaseRoleWithStablecoin.mockResolvedValue({ hash: '0xp' })
    const ensureInitialized = vi.fn(async () => ({ publicKey: new Uint8Array([9]) }))
    ensureKeyRegistered
      .mockRejectedValueOnce(new Error('register boom'))
      .mockResolvedValueOnce(true)

    const { result } = renderHook(() => usePurchaseFlow())
    await act(async () => { await result.current.start(baseParams({ ensureInitialized })) })

    expect(result.current.status).toBe('failed')
    const reg = result.current.steps.find((s) => s.id === 'register')
    expect(reg.state).toBe('failed')
    expect(result.current.canContinueAnyway).toBe(true) // register is non-blocking

    await act(async () => { await result.current.retry() })

    expect(result.current.status).toBe('succeeded')
    // Payment ran exactly once across the initial attempt + retry.
    expect(purchaseRoleWithStablecoin).toHaveBeenCalledTimes(1)
    // The encryption signature was not re-requested (sign already completed).
    expect(ensureInitialized).toHaveBeenCalledTimes(1)
    expect(ensureKeyRegistered).toHaveBeenCalledTimes(2)
  })

  it('continueAnyway finalizes a non-blocking key failure as success (FR-010)', async () => {
    purchaseRoleWithStablecoin.mockResolvedValue({ hash: '0xp' })
    ensureKeyRegistered.mockRejectedValue(new Error('register boom'))
    const { result } = renderHook(() => usePurchaseFlow())

    await act(async () => { await result.current.start(baseParams()) })
    expect(result.current.status).toBe('failed')

    await act(async () => { result.current.continueAnyway() })

    await waitFor(() => expect(result.current.status).toBe('succeeded'))
    expect(result.current.keyRegOutcome).toBe('failed')
  })
})
