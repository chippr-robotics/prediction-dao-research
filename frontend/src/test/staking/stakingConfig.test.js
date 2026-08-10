/**
 * Staking config gating tests (spec 065, FR-001/FR-008) — the staking
 * capability is on exactly for chains with a real, deposits-open provider
 * (chain 1 at launch), helpers resolve strictly per-chain, the curated
 * validator allowlist is the hard boundary with valid checksummed addresses,
 * and deep links build correctly.
 */
import { describe, it, expect } from 'vitest'
import { getAddress } from 'ethers'
import {
  NETWORKS,
  isStakingAvailable,
  getStakingConfig,
  getStakingNetworks,
  listSupportedChainIds,
} from '../../config/networks'
import { stakingPath, CURATED_POLYGON_VALIDATORS } from '../../config/staking'

const STAKING_CHAINS = [1]

describe('staking network capability (spec 065)', () => {
  it('is available exactly on Ethereum mainnet at launch', () => {
    for (const chainId of listSupportedChainIds()) {
      expect(isStakingAvailable(chainId), `chain ${chainId}`).toBe(STAKING_CHAINS.includes(chainId))
      expect(NETWORKS[chainId].capabilities.staking, `capabilities ${chainId}`).toBe(
        STAKING_CHAINS.includes(chainId),
      )
    }
  })

  it('never falls back across chains for unknown ids', () => {
    expect(isStakingAvailable(999999)).toBe(false)
    expect(isStakingAvailable(null)).toBe(false)
    expect(getStakingConfig(999999)).toBeNull()
  })

  it('exposes both liquid options (Lido ETH, sPOL POL) and delegated on chain 1', () => {
    const config = getStakingConfig(1)
    expect(config).toBeTruthy()
    const kinds = config.liquid.map((l) => l.kind)
    expect(kinds).toContain('lido')
    expect(kinds).toContain('spol')
    const lido = config.liquid.find((l) => l.kind === 'lido')
    expect(lido.asset.symbol).toBe('ETH')
    expect(lido.lstSymbol).toBe('wstETH')
    const spol = config.liquid.find((l) => l.kind === 'spol')
    expect(spol.asset.symbol).toBe('POL')
    expect(spol.lstSymbol).toBe('sPOL')
    expect(spol.unbonding.instantExit).toBe(true)
    expect(config.delegated.validators.length).toBeGreaterThan(0)
  })

  it('getStakingNetworks names Ethereum', () => {
    const names = getStakingNetworks().map((n) => n.name)
    expect(names).toContain('Ethereum')
  })

  it('curated validator allowlist has valid checksummed ValidatorShare addresses', () => {
    expect(CURATED_POLYGON_VALIDATORS.length).toBe(8)
    for (const v of CURATED_POLYGON_VALIDATORS) {
      expect(typeof v.validatorId).toBe('number')
      expect(v.name).toBeTruthy()
      // getAddress throws on a bad checksum — the entry is already normalized.
      expect(v.validatorShare).toBe(getAddress(v.validatorShare))
    }
  })

  it('stakingPath builds the earn?view=stake deep link', () => {
    expect(stakingPath({})).toBe('/wallet?tab=earn&view=stake')
    expect(stakingPath({ chainId: 1, tokenSymbol: 'ETH' })).toBe(
      '/wallet?tab=earn&view=stake&chain=1&token=ETH',
    )
  })
})
