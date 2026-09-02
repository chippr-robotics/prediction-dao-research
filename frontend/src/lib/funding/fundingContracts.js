/**
 * Contract wiring for funding pools (spec 103). Addresses come from the synced config
 * (`getContractAddressForChain`), never hardcoded (Principle V); ABIs are derived from the compiled
 * artifacts (`src/abis/FundingPool*.js`).
 */
import { ethers } from 'ethers'
import { FUNDING_POOL_FACTORY_ABI } from '../../abis/FundingPoolFactory'
import { FUNDING_POOL_ABI } from '../../abis/FundingPool'
import { getContractAddressForChain } from '../../config/contracts'

export { ERC20_ABI } from '../pools/poolContracts'

/** The FundingPoolFactory address for `chainId`, or undefined/'' if not deployed there. */
export function getFundingFactoryAddress(chainId) {
  try {
    return getContractAddressForChain('fundingPoolFactory', chainId)
  } catch {
    return undefined
  }
}

/** True when funding pools are deployed on `chainId`. */
export function isFundingAvailable(chainId) {
  const a = getFundingFactoryAddress(chainId)
  return typeof a === 'string' && a.length === 42
}

/** Build the factory contract bound to `runner` (signer or provider). Throws if not deployed. */
export function getFundingFactory(runner, chainId) {
  const address = getFundingFactoryAddress(chainId)
  if (!address) throw new Error(`Funding pools are not available on this network (chain ${chainId}).`)
  return new ethers.Contract(address, FUNDING_POOL_FACTORY_ABI, runner)
}

/** Build a pool contract bound to `runner`. */
export function getFundingPool(address, runner) {
  return new ethers.Contract(address, FUNDING_POOL_ABI, runner)
}

export const FUNDING_STATE = ['Open', 'Closed', 'Refunding']
export const FUNDING_STATE_DISPLAY = ['Open', 'Closed', 'Refunding']
export const REFUND_REASON = { 0: null, 1: 'organizer', 2: 'majority', 3: 'deadline' }
export const REFUND_REASON_TEXT = {
  organizer: 'The organizer chose to refund everyone.',
  majority: 'A majority of contributors voted to refund.',
  deadline: 'The settlement deadline passed without the organizer closing.',
}

/** User-facing label for a pool state. */
export function fundingStateDisplay(state) {
  return FUNDING_STATE_DISPLAY[Number(state)] ?? 'Unknown'
}
