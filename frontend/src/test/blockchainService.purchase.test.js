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

describe('getUserTierOnChain — chain-aware tier read', () => {
  beforeEach(() => resolverMock.mockReset())
  // The test env sets VITE_SKIP_BLOCKCHAIN_CALLS=true (vite.config.js) which
  // short-circuits the function; un-skip it so the chain-aware resolution runs.
  afterEach(() => vi.unstubAllEnvs())

  it("resolves the membership contract for the passed chain id, not the build chain", async () => {
    vi.stubEnv('VITE_SKIP_BLOCKCHAIN_CALLS', 'false')
    // No membership contract on this chain -> tier 0. The point of the test is
    // the resolver is queried with the wallet's chain id, guarding against the
    // bug where a testnet (Amoy) tier leaked into the mainnet purchase view.
    resolverMock.mockReturnValue(undefined)

    const res = await getUserTierOnChain(
      '0x0000000000000000000000000000000000000001',
      'WAGER_PARTICIPANT',
      80002
    )

    expect(resolverMock).toHaveBeenCalledWith('membershipManager', 80002)
    expect(res).toEqual({ tier: 0, tierName: 'None' })
  })
})
