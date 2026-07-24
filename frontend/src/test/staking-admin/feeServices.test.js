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
  it('is falsy on every configured chain until the router is deployed', () => {
    for (const chainId of [1, 63, 137, 80002, 1337]) {
      expect(getContractAddressForChain('stakingRouter', chainId)).toBeFalsy()
    }
  })
})
