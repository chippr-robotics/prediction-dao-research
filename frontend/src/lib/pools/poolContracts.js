/**
 * Contract wiring for ZK-Wager Pools (spec 034). Addresses come from the synced config
 * (`getContractAddressForChain`), never hardcoded (Principle V); ABIs are mirrored from the compiled
 * artifacts.
 */
import { ethers } from 'ethers'
import { ZK_WAGER_POOL_FACTORY_ABI } from '../../abis/ZKWagerPoolFactory'
import { ZK_WAGER_POOL_ABI } from '../../abis/ZKWagerPool'
import { getContractAddressForChain } from '../../config/contracts'

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

/** The ZKWagerPoolFactory address for `chainId`, or undefined if not deployed there. */
export function getFactoryAddress(chainId) {
  return getContractAddressForChain('zkWagerPoolFactory', chainId)
}

/** Build the factory contract bound to `runner` (signer or provider). Throws if not deployed. */
export function getFactory(runner, chainId) {
  const address = getFactoryAddress(chainId)
  if (!address) throw new Error(`ZK-Wager Pools are not available on this network (chain ${chainId}).`)
  return new ethers.Contract(address, ZK_WAGER_POOL_FACTORY_ABI, runner)
}

/** Build a pool contract bound to `runner`. */
export function getPool(address, runner) {
  return new ethers.Contract(address, ZK_WAGER_POOL_ABI, runner)
}

export const POOL_STATE = ['JoiningOpen', 'JoiningClosed', 'Resolved', 'Cancelled']
