/**
 * Spec 066 setup plumbing (T007): the per-provider staking fee-service ids resolve
 * to the right keccak labels, `stakingRouterServiceIdFor` maps liquid kinds to their
 * service (and delegated/unknown to null — fee-free), and the `stakingRouter` contract
 * key resolves falsy before any deploy (member app then falls back to spec-065).
 */
import { describe, it, expect } from 'vitest'
import { id as keccakId } from 'ethers'

import { FEE_SERVICES } from '../../lib/fees/feeQuote'
import { stakingRouterServiceIdFor } from '../../config/staking'
import { getContractAddressForChain } from '../../config/contracts'

describe('staking fee-service ids', () => {
  it('map to the canonical keccak labels', () => {
    expect(FEE_SERVICES.STAKE_LIDO).toBe(keccakId('stake.lido'))
    expect(FEE_SERVICES.STAKE_POLYGON).toBe(keccakId('stake.polygon'))
  })

  it('are distinct 32-byte ids', () => {
    expect(FEE_SERVICES.STAKE_LIDO).not.toBe(FEE_SERVICES.STAKE_POLYGON)
    for (const idHex of [FEE_SERVICES.STAKE_LIDO, FEE_SERVICES.STAKE_POLYGON]) {
      expect(idHex).toMatch(/^0x[0-9a-f]{64}$/)
    }
  })
})

describe('stakingRouterServiceIdFor', () => {
  it('maps liquid provider kinds to their service id', () => {
    expect(stakingRouterServiceIdFor('lido')).toBe(FEE_SERVICES.STAKE_LIDO)
    expect(stakingRouterServiceIdFor('spol')).toBe(FEE_SERVICES.STAKE_POLYGON)
  })

  it('returns null for delegated and unknown kinds (fee-free)', () => {
    expect(stakingRouterServiceIdFor('delegated')).toBeNull()
    expect(stakingRouterServiceIdFor('polygon')).toBeNull()
    expect(stakingRouterServiceIdFor(undefined)).toBeNull()
  })
})

describe('stakingRouter address resolution', () => {
  /*
   * 1337 is deliberately NOT in this list. The local sandbox genuinely has a StakingRouter now —
   * `setup:e2e` / `setup:local` deploy one (with contracts/mocks stand-ins for Lido, sPOL and the
   * Polygon StakeManager) so the specs 065/066 flows have a router to read, pause and curate.
   * What this test is about is the SHIPPED networks: none of them has one yet, so the member app
   * falls back to spec-065 fee-free direct staking there.
   */
  it('is falsy on every shipped chain until the router is deployed', () => {
    for (const chainId of [1, 63, 137, 80002]) {
      expect(getContractAddressForChain('stakingRouter', chainId)).toBeFalsy()
    }
  })

  it('resolves on the local sandbox, which does have one', () => {
    expect(getContractAddressForChain('stakingRouter', 1337)).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})
