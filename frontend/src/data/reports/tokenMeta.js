/**
 * Stablecoin ticker/decimals resolution for report line items
 * (spec 016-wager-tax-report, FR-004; research.md D7).
 *
 * The active network's stablecoin metadata lives in config/networks.js. For
 * the common case (a wager staked in the network's canonical stablecoin) the
 * ticker/decimals come straight from that config — no network call. For any
 * non-default token address, an injected on-chain `symbol()/decimals()` lookup
 * is used and memoized per (chainId, address) so repeated rows don't re-query.
 *
 * I/O (the on-chain lookup) is injected so this module is unit-testable without
 * a provider; the default resolver in the app supplies the real lookup.
 */

import { getNetwork } from '../../config/networks'

const memo = new Map() // key: `${chainId}:${address.toLowerCase()}` → {ticker, decimals, address}

function cacheKey(chainId, address) {
  return `${chainId}:${String(address).toLowerCase()}`
}

function sameAddress(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase()
}

/** Reset the memo cache (test helper / network switch). */
export function clearTokenMetaCache() {
  memo.clear()
}

/**
 * Resolve { ticker, decimals, address } for a stake token on a chain.
 *
 * Resolution order:
 *   1. Memo cache.
 *   2. The chain's canonical stablecoin (config/networks.js) when the address
 *      matches — no I/O.
 *   3. Injected `fetchOnChain(address)` → { symbol, decimals } for custom
 *      tokens; result is memoized. If absent or it throws, a safe truncated
 *      fallback ticker is returned (never throws into the report).
 *
 * @param {string} address - stake token address
 * @param {number|string} chainId - active chain id
 * @param {object} [deps]
 * @param {(chainId:number)=>object} [deps.network] - getNetwork override (tests)
 * @param {(address:string)=>Promise<{symbol:string,decimals:number}>} [deps.fetchOnChain]
 * @returns {Promise<{ticker: string, decimals: number, address: string}>}
 */
export async function resolveTokenMeta(address, chainId, deps = {}) {
  const key = cacheKey(chainId, address)
  if (memo.has(key)) return memo.get(key)

  const networkOf = deps.network || getNetwork
  const net = networkOf(Number(chainId))
  const stable = net?.stablecoin

  if (stable && sameAddress(stable.address, address)) {
    const meta = { ticker: stable.symbol, decimals: stable.decimals, address: stable.address }
    memo.set(key, meta)
    return meta
  }

  if (typeof deps.fetchOnChain === 'function') {
    try {
      const onchain = await deps.fetchOnChain(address)
      const meta = {
        ticker: onchain?.symbol || shortAddress(address),
        decimals: Number.isFinite(Number(onchain?.decimals)) ? Number(onchain.decimals) : 18,
        address,
      }
      memo.set(key, meta)
      return meta
    } catch {
      // fall through to safe fallback
    }
  }

  const fallback = { ticker: shortAddress(address), decimals: 18, address }
  memo.set(key, fallback)
  return fallback
}

function shortAddress(address) {
  const a = String(address || '')
  return a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || 'UNKNOWN'
}
