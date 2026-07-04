/**
 * Contract wiring for Wager Pools (spec 034, address-based — Semaphore removed). Addresses come from the
 * synced config (`getContractAddressForChain`), never hardcoded (Principle V); ABIs are mirrored from the
 * compiled artifacts.
 */
import { ethers } from 'ethers'
import { WAGER_POOL_FACTORY_ABI } from '../../abis/WagerPoolFactory'
import { WAGER_POOL_ABI } from '../../abis/WagerPool'
import { getContractAddressForChain } from '../../config/contracts'

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

/** The WagerPoolFactory address for `chainId`, or undefined if not deployed there. */
export function getFactoryAddress(chainId) {
  return getContractAddressForChain('wagerPoolFactory', chainId)
}

/** Build the factory contract bound to `runner` (signer or provider). Throws if not deployed. */
export function getFactory(runner, chainId) {
  const address = getFactoryAddress(chainId)
  if (!address) throw new Error(`Wager Pools are not available on this network (chain ${chainId}).`)
  return new ethers.Contract(address, WAGER_POOL_FACTORY_ABI, runner)
}

/** Build a pool contract bound to `runner`. */
export function getPool(address, runner) {
  return new ethers.Contract(address, WAGER_POOL_ABI, runner)
}

export const POOL_STATE = ['JoiningOpen', 'JoiningClosed', 'Resolved', 'Cancelled']

/**
 * Human display labels for POOL_STATE (tester feedback: the raw enum name "JoiningOpen" leaked into
 * the UI). Keep POOL_STATE as the stable enum-name mapping; render THIS in user-facing surfaces.
 */
export const POOL_STATE_DISPLAY = ['Open', 'Closed — resolving', 'Resolved', 'Cancelled']

/** User-facing label for a pool state (falls back to 'Unknown' for an unrecognized value). */
export function poolStateDisplay(state) {
  return POOL_STATE_DISPLAY[Number(state)] ?? 'Unknown'
}
