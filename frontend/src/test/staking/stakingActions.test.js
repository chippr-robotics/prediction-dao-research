/**
 * stakingActions tests (spec 065, T016) — amount validation incl. the native
 * gas reserve, Max computation, and provider dispatch.
 */
import { describe, it, expect } from 'vitest'
import {
  validateStakeAmount,
  maxStakeable,
  buildStakeForOption,
  optionIsNative,
  NATIVE_GAS_RESERVE,
} from '../../lib/staking/stakingActions'
import { LIDO_CONTRACTS } from '../../config/staking'

const ETH = 10n ** 18n

describe('validateStakeAmount', () => {
  it('rejects zero / negative', () => {
    expect(validateStakeAmount({ amount: 0n, walletBalance: ETH }).ok).toBe(false)
    expect(validateStakeAmount({ amount: -1n, walletBalance: ETH }).ok).toBe(false)
  })

  it('rejects below minimum and above cap', () => {
    expect(validateStakeAmount({ amount: 5n, walletBalance: ETH, minStakeRaw: 100n }).ok).toBe(false)
    expect(validateStakeAmount({ amount: 2n * ETH, walletBalance: 5n * ETH, maxStakeRaw: ETH }).ok).toBe(false)
  })

  it('rejects more than balance for an ERC-20 (no gas reserve)', () => {
    expect(validateStakeAmount({ amount: 2n * ETH, walletBalance: ETH, isNative: false }).ok).toBe(false)
    expect(validateStakeAmount({ amount: ETH, walletBalance: ETH, isNative: false }).ok).toBe(true)
  })

  it('reserves gas for a native coin', () => {
    // exactly balance leaves nothing for gas → rejected
    expect(validateStakeAmount({ amount: ETH, walletBalance: ETH, isNative: true }).ok).toBe(false)
    // balance minus the reserve is fine
    expect(
      validateStakeAmount({ amount: ETH - NATIVE_GAS_RESERVE, walletBalance: ETH, isNative: true }).ok,
    ).toBe(true)
  })
})

describe('maxStakeable', () => {
  it('returns full balance for an ERC-20', () => {
    expect(maxStakeable({ walletBalance: ETH, isNative: false })).toBe(ETH)
  })
  it('subtracts the gas reserve for a native coin', () => {
    expect(maxStakeable({ walletBalance: ETH, isNative: true })).toBe(ETH - NATIVE_GAS_RESERVE)
  })
  it('never goes negative', () => {
    expect(maxStakeable({ walletBalance: 1n, isNative: true })).toBe(0n)
  })
})

describe('buildStakeForOption dispatch', () => {
  it('builds a native ETH value call for Lido', async () => {
    const option = { providerKind: 'lido', contracts: LIDO_CONTRACTS }
    const { calls, requiresApproval } = await buildStakeForOption(option, { amount: ETH })
    expect(requiresApproval).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].value).toBe(ETH)
    expect(calls[0].target.toLowerCase()).toBe(LIDO_CONTRACTS.wsteth.toLowerCase())
  })

  it('throws for an unknown provider kind', async () => {
    await expect(buildStakeForOption({ providerKind: 'nope' }, {})).rejects.toThrow(/Unknown staking provider/)
  })

  it('optionIsNative only for Lido', () => {
    expect(optionIsNative({ providerKind: 'lido' })).toBe(true)
    expect(optionIsNative({ providerKind: 'spol' })).toBe(false)
    expect(optionIsNative({ providerKind: 'validator-share' })).toBe(false)
  })
})
