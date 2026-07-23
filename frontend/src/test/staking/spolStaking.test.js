/**
 * spolStaking tests (spec 065, T015) — exit call encoding and rate helper.
 */
import { describe, it, expect } from 'vitest'
import { Interface } from 'ethers'
import { buildUnstakeCalls, buildWithdrawCalls, spolRateToFraction } from '../../lib/staking/spolStaking'
import { SPOL_CONTROLLER_ABI } from '../../abis/SPOLController'
import { SPOL_CONTRACTS } from '../../config/staking'

const IFACE = new Interface(SPOL_CONTROLLER_ABI)
const ETH = 10n ** 18n

describe('spol exit calls', () => {
  it('encodes sellSPOL for an unstake request', () => {
    const { calls } = buildUnstakeCalls({ contracts: SPOL_CONTRACTS, amount: ETH })
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe(SPOL_CONTRACTS.controller)
    const parsed = IFACE.parseTransaction({ data: calls[0].data })
    expect(parsed.name).toBe('sellSPOL')
    expect(parsed.args[0]).toBe(ETH)
  })

  it('encodes withdrawPOL for a claim', () => {
    const { calls } = buildWithdrawCalls({ contracts: SPOL_CONTRACTS })
    const parsed = IFACE.parseTransaction({ data: calls[0].data })
    expect(parsed.name).toBe('withdrawPOL')
  })
})

describe('spolRateToFraction', () => {
  it('turns convertSPOLtoPOL(1e18) into a >1 fraction when gaining', () => {
    expect(spolRateToFraction(1_050_000_000_000_000_000n)).toBeCloseTo(1.05, 6)
    expect(spolRateToFraction(null)).toBeNull()
  })
})
