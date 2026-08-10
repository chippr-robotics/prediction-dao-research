import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Regression guard for the "purchase contract is not found" bug: the membership
// purchase flow used to resolve the MembershipManager via the build-time chain
// (getContractAddress), while the network gate accepts ANY supported chain. A
// wallet on Amoy therefore resolved the Polygon address, found no code there,
// silently fell through to a removed PaymentProcessor path, and surfaced a
// misleading "no purchase contract found" error. The fix resolves the contract
// for the wallet's *actual* chain (getContractAddressForChain) and throws a
// clear, actionable error when none is deployed there.
//
// We control getContractAddressForChain while keeping the rest of the contracts
// config real (see frontend-test-gotchas: ACTIVE_CHAIN_ID is frozen at load).
const { resolverMock } = vi.hoisted(() => ({ resolverMock: vi.fn() }))
vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getContractAddressForChain: resolverMock }
})

import { purchaseRoleWithStablecoin, getUserTierOnChain } from '../utils/blockchainService'
import { membershipChainId } from '../config/networks'
import { makeSigner } from './helpers/chainMocks'

// makeSigner (shared) returns a signer whose provider reports chainId via
// getNetwork() and returns `code` from getCode(); on the "no code on this chain"
// path the function only touches those, so no real ethers contract calls happen.

const POLYGON_MM = '0x00c3ef4e02Ef00Ad6eE955dF5022A22F6ea73dae'

describe('purchaseRoleWithStablecoin — chain-aware contract resolution', () => {
  beforeEach(() => resolverMock.mockReset())

  it("resolves the MembershipManager for the wallet's actual chain, not the build chain", async () => {
    resolverMock.mockReturnValue(POLYGON_MM)
    const signer = makeSigner({ chainId: 80002, code: '0x' }) // Amoy wallet

    await expect(
      purchaseRoleWithStablecoin(signer, 'WAGER_PARTICIPANT', 2, 1, 'purchase', null)
    ).rejects.toThrow()

    // The core regression assertion: the resolver was queried with the wallet's
    // chain id (80002), proving resolution is chain-aware rather than build-bound.
    expect(resolverMock).toHaveBeenCalledWith('membershipManager', 80002)
  })

  it('throws an actionable "switch to Polygon" error (not the misleading legacy one) when the contract has no code on the connected chain', async () => {
    resolverMock.mockReturnValue(POLYGON_MM)
    const signer = makeSigner({ chainId: 80002, code: '0x' })

    await expect(
      purchaseRoleWithStablecoin(signer, 'WAGER_PARTICIPANT', 2, 1, 'purchase', null)
    ).rejects.toThrow(/switch your wallet to Polygon/i)

    // And the message must NOT be the old misleading wording.
    await expect(
      purchaseRoleWithStablecoin(signer, 'WAGER_PARTICIPANT', 2, 1, 'purchase', null)
    ).rejects.not.toThrow(/No purchase contract found/i)
  })
})

describe('purchaseRoleWithStablecoin — onProgress callback (spec 022)', () => {
  beforeEach(() => resolverMock.mockReset())

  // The approve/pay event SEQUENCE is exercised end-to-end via usePurchaseFlow,
  // which drives a mocked purchaseRoleWithStablecoin. Here we guard the additive
  // 7th `onProgress` parameter: it must not change the existing control flow, and a
  // throwing callback must never abort the purchase.

  it('accepts an onProgress arg without altering the no-contract error path (regression)', async () => {
    resolverMock.mockReturnValue(POLYGON_MM)
    const signer = makeSigner({ chainId: 80002, code: '0x' })
    const onProgress = vi.fn()

    await expect(
      purchaseRoleWithStablecoin(signer, 'WAGER_PARTICIPANT', 2, 1, 'purchase', null, onProgress)
    ).rejects.toThrow(/switch your wallet to Polygon/i)
  })

  it('behaves identically whether or not onProgress is provided', async () => {
    resolverMock.mockReturnValue(POLYGON_MM)
    const signer = makeSigner({ chainId: 80002, code: '0x' })

    const withCb = purchaseRoleWithStablecoin(signer, 'WAGER_PARTICIPANT', 2, 1, 'purchase', null, () => { throw new Error('cb boom') })
    const without = purchaseRoleWithStablecoin(signer, 'WAGER_PARTICIPANT', 2, 1, 'purchase', null)

    // A throwing callback does not surface as the rejection reason; both paths
    // reject with the same actionable contract error.
    await expect(withCb).rejects.toThrow(/switch your wallet to Polygon/i)
    await expect(without).rejects.toThrow(/switch your wallet to Polygon/i)
  })
})

describe('getUserTierOnChain — membership reads the REFERENCE chain (spec 071 FR-003)', () => {
  beforeEach(() => resolverMock.mockReset())
  // The test env sets VITE_SKIP_BLOCKCHAIN_CALLS=true (vite.config.js) which
  // short-circuits the function; un-skip it so the chain resolution runs.
  afterEach(() => vi.unstubAllEnvs())

  // This test used to assert the resolver was queried with the PASSED chain id, guarding a
  // spec-008 bug where an Amoy tier leaked into the mainnet purchase view. Spec 071 supersedes
  // that: membership lives in exactly one place per cohort, so the passed chain is ignored and
  // the reference chain is used. The original leak is still prevented — by cohort separation
  // (a mainnet build's reference chain is Polygon and can never be Amoy), asserted in
  // test/lib/chains/membershipChain.test.js — rather than by echoing the wallet's chain.
  it('ignores the passed chain id and resolves the reference chain', async () => {
    vi.stubEnv('VITE_SKIP_BLOCKCHAIN_CALLS', 'false')
    resolverMock.mockReturnValue(undefined)

    // Deliberately pass a cohort chain that is NOT the reference chain, so an implementation
    // that echoed its argument back would fail here rather than pass by coincidence.
    const notTheReferenceChain = 63
    expect(notTheReferenceChain).not.toBe(membershipChainId())

    await getUserTierOnChain(
      '0x0000000000000000000000000000000000000001',
      'WAGER_PARTICIPANT',
      notTheReferenceChain
    )

    expect(resolverMock).toHaveBeenCalledWith('membershipManager', membershipChainId())
    expect(resolverMock).not.toHaveBeenCalledWith('membershipManager', notTheReferenceChain)
  })

  it('reports "None" as a READ answer, distinct from an unreadable one (FR-004)', async () => {
    vi.stubEnv('VITE_SKIP_BLOCKCHAIN_CALLS', 'false')
    resolverMock.mockReturnValue(undefined) // no MembershipManager, no TierRegistry → genuinely none

    const res = await getUserTierOnChain(
      '0x0000000000000000000000000000000000000001',
      'WAGER_PARTICIPANT',
      membershipChainId()
    )

    expect(res).toMatchObject({ tier: 0, tierName: 'None', readable: true })
  })
})
