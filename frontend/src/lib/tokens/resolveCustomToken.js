/**
 * Custom token resolution (Spec 034, US2 / FR-003, FR-004, FR-011).
 *
 * Reads symbol/name/decimals for a user-supplied contract address directly from
 * its ERC-20 contract (ethers v6 + the shared ERC20 ABI). Unlike
 * data/reports/tokenMeta.js#resolveTokenMeta — which intentionally never throws
 * and memoizes a fallback — this REJECTS addresses that don't resolve, because
 * FR-011 requires invalid custom additions to be refused (no placeholder token
 * is ever added). The reuse here is the ERC20_ABI + ethers read idiom.
 */

import { ethers } from 'ethers'
import { ERC20_ABI } from '../../abis/ERC20'
import { MAX_SYMBOL_LENGTH, MAX_NAME_LENGTH } from './constants'

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * @param {string} address candidate token contract address
 * @param {number} chainId active chain
 * @param {import('ethers').Provider} provider read provider for the active chain
 * @returns {Promise<{address,chainId,source:'custom',symbol,name,decimals}>}
 * @throws if the address is invalid or the contract is not a readable ERC-20
 */
export async function resolveCustomToken(address, chainId, provider) {
  const addr = String(address || '').trim()
  if (!ethers.isAddress(addr)) {
    throw new Error('Enter a valid token contract address')
  }
  if (!provider) {
    throw new Error('Connect a wallet to add a custom token')
  }

  const contract = new ethers.Contract(addr, ERC20_ABI, provider)

  let symbol
  let decimals
  try {
    ;[symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()])
  } catch {
    throw new Error('Could not read this token. Check the address and that it is an ERC-20 on this network.')
  }

  let name = ''
  try {
    name = await contract.name()
  } catch {
    /* name is optional */
  }

  const dec = Number(decimals)
  return {
    address: addr.toLowerCase(),
    chainId: Number(chainId),
    source: 'custom',
    symbol: String(symbol || '').slice(0, MAX_SYMBOL_LENGTH) || short(addr),
    name: String(name || '').slice(0, MAX_NAME_LENGTH),
    decimals: Number.isInteger(dec) && dec >= 0 && dec <= 255 ? dec : 18,
  }
}
