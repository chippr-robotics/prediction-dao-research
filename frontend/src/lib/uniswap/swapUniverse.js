/**
 * The cross-network swap universe — every tradeable pair leg the app can route,
 * on every network that has a real V3 deployment, not just the connected one.
 *
 * WHY THIS EXISTS. The Trade ticket used to derive its token list from the
 * ACTIVE chain only (`DexContext.tradeTokens`), so a member connected to Polygon
 * could not even see that WETH/USDC exists on Base. Listing every network's legs
 * in one place is a READ concern: quotes come from each chain's own QuoterV2 over
 * that chain's read provider, exactly the way the portfolio reads balances across
 * chains (spec 044) and ClearPath reads DAOs across chains. Only the WRITE (the
 * swap itself) needs the wallet to actually be on the pair's network.
 *
 * ONE NETWORK PER PAIR. A Uniswap V3 pool lives on a single chain, so a pair is
 * never cross-chain: pick the first leg and the second leg is pinned to that
 * leg's network. The rule is not re-derived here — `lib/assets/networkPin.js`
 * already owns it (`samePair`, the exact inverse of the bridge's `bridgeDest`),
 * and this module produces options in the shape those predicates read
 * (`{ key, chainId, symbol, networkName, … }`, spec 064's SelectableAsset).
 * Moving value BETWEEN networks is the Bridge's job, never this ticket's.
 *
 * Pure and synchronous: bundled config only, no chain reads, no React. The
 * per-chain token derivation is deliberately identical to the one DexContext
 * used for the active chain (registry ERC-20s with an address), so the active
 * chain's list does not change shape now that other chains sit beside it.
 */

import { NETWORKS, getSwapChainIds } from '../../config/networks'
import { getPortfolioRegistry } from '../../config/assetTaxonomy'

/** Stable identity for a pair leg. Same `chainId:address` form as spec 064's asset keys. */
export const swapOptionKey = (chainId, address) =>
  `${Number(chainId)}:${String(address || '').toLowerCase()}`

/** Whether `chainId` has BOTH the swap policy gate and real router config. */
export function isSwapChain(chainId) {
  const net = NETWORKS[Number(chainId)]
  return Boolean(net?.capabilities?.dex)
}

/**
 * The DEX addresses a swap on `chainId` routes through, or null when the chain
 * has no deployment. Strictly per-chain — never falls back to another network's
 * router, which would send an approval to a foreign address.
 */
export function getSwapAddresses(chainId) {
  const net = NETWORKS[Number(chainId)]
  if (!net?.capabilities?.dex) return null
  return {
    factory: net.dex.factory,
    swapRouter: net.dex.swapRouter,
    quoter: net.dex.quoter,
    wnative: net.dex.wnative,
    stablecoin: net.stablecoin?.address || null,
  }
}

/** `{ name, url }` for the chain's DEX (ETCswap on the ETC family, else Uniswap). */
export const getSwapVenue = (chainId) => NETWORKS[Number(chainId)]?.dexProvider ?? null

/**
 * The tradeable ERC-20s on one network: every registry asset with an address.
 * Native coins are excluded (they must be wrapped first) as are NFT credentials.
 * Returns [] for a chain with no DEX, which is what drives the honest empty state.
 */
export function getSwapTokens(chainId) {
  if (!isSwapChain(chainId)) return []
  return getPortfolioRegistry(Number(chainId))
    .filter((entry) => entry.kind === 'erc20' && entry.address)
    .map((entry) => ({
      address: entry.address,
      symbol: entry.symbol,
      name: entry.name,
      decimals: entry.decimals,
    }))
}

/** Metadata for one leg (decimals/symbol for quote math), or null if unknown here. */
export function getSwapTokenMeta(chainId, address) {
  if (!address) return null
  const lower = String(address).toLowerCase()
  return getSwapTokens(chainId).find((t) => t.address.toLowerCase() === lower) || null
}

/**
 * Every pair leg on every swap-capable network, as selector options.
 *
 * Testnets are included only when the member is actually connected to one: a
 * mainnet member has no business seeing Mordor liquidity, but a member ON Mordor
 * must be able to trade there. (Mordor/Amoy build their `dex` from env vars, so
 * `isSwapChain` already hides them where they are unconfigured.)
 *
 * Ordering puts the connected network first — its pairs are the ones that need no
 * network switch — then mainnets, keeping each network's registry order (wrapped
 * native, the stablecoin, then curated assets) so the common legs stay on top.
 */
export function buildSwapOptions({ connectedChainId = null } = {}) {
  const connected = Number(connectedChainId)
  const chainIds = getSwapChainIds().filter(
    (id) => !NETWORKS[id]?.isTestnet || id === connected,
  )
  const ordered = [
    ...chainIds.filter((id) => id === connected),
    ...chainIds.filter((id) => id !== connected),
  ]

  const options = []
  for (const chainId of ordered) {
    const net = NETWORKS[chainId]
    for (const token of getSwapTokens(chainId)) {
      options.push({
        key: swapOptionKey(chainId, token.address),
        chainId,
        kind: 'erc20',
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        networkName: net.name,
        isTestnet: Boolean(net.isTestnet),
        venueName: net.dexProvider?.name || null,
      })
    }
  }
  return options
}

/** The option matching `key`, or null. */
export const findSwapOption = (options, key) =>
  (options || []).find((o) => o.key === key) || null

/** The first option on `chainId` whose address matches, or null. */
export const findSwapOptionByAddress = (options, chainId, address) =>
  findSwapOption(options, swapOptionKey(chainId, address))

/**
 * The ticket's opening pair on a network: sell wrapped-native for the
 * stablecoin — the same default the single-chain ticket has always used. Falls
 * back to the first two legs when a chain lacks one of them, and returns null
 * when the network cannot form a pair at all.
 */
export function defaultPairForChain(options, chainId) {
  const legs = (options || []).filter((o) => o.chainId === Number(chainId))
  if (legs.length < 2) return null
  const addrs = getSwapAddresses(chainId)
  const at = (address) =>
    address ? legs.find((o) => o.address.toLowerCase() === String(address).toLowerCase()) : null
  const from = at(addrs?.wnative) || legs[0]
  const to = at(addrs?.stablecoin) || legs.find((o) => o.key !== from.key)
  if (!to || to.key === from.key) return null
  return { from, to }
}

/**
 * The counterpart to auto-select when the pinned network changes (the member
 * picked a first leg on another chain). Keeps the existing choice when it is
 * still on the pinned network — a pin move must never silently repoint a leg the
 * member deliberately chose — and otherwise prefers that network's stablecoin so
 * the ticket stays immediately quotable instead of half-empty.
 */
export function counterpartFor(options, chainId, firstLeg, current) {
  if (current && current.chainId === Number(chainId) && current.key !== firstLeg?.key) return current
  const legs = (options || []).filter(
    (o) => o.chainId === Number(chainId) && o.key !== firstLeg?.key,
  )
  if (legs.length === 0) return null
  const stable = getSwapAddresses(chainId)?.stablecoin
  const preferred = stable
    ? legs.find((o) => o.address.toLowerCase() === String(stable).toLowerCase())
    : null
  return preferred || legs[0]
}
