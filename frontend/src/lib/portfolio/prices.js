/**
 * Verifiable on-chain USD prices for portfolio assets (spec 044 v1.2, FR-022).
 *
 * Resolution ladder per underlying symbol (ETH, BTC, MATIC, ETC, LINK, …):
 *   1. Chainlink AggregatorV3 feed (config/priceFeeds.js) — rejected when the
 *      answer is non-positive or older than FEED_MAX_AGE_SECONDS.
 *   2. DEX pool spot: the asset's representative ERC-20 vs the network's
 *      stablecoin on that chain's configured Uniswap-V3-style DEX, from the
 *      pool's slot0 sqrtPriceX96 (stablecoin at par $1).
 *
 * Stablecoins are valued at par elsewhere and never priced here. A symbol
 * with no resolvable source is simply absent from the result — the caller
 * renders it unpriced rather than inventing a value.
 */
import { Contract } from 'ethers'
import { AGGREGATOR_V3_ABI } from '../../abis/AggregatorV3'
import { UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from '../../abis/UniswapV3PoolReader'
import { CHAINLINK_FEEDS, FEED_MAX_AGE_SECONDS, DEX_SPOT_FEE_TIERS } from '../../config/priceFeeds'
import { NETWORKS } from '../../config/networks'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const Q96 = 2 ** 96

export function underlyingSymbolOf(asset) {
  return (asset.baselineSymbol || asset.symbol || '').toUpperCase()
}

async function readChainlinkUsd(provider, feedAddress, nowSeconds) {
  const feed = new Contract(feedAddress, AGGREGATOR_V3_ABI, provider)
  const [roundData, decimals] = await Promise.all([feed.latestRoundData(), feed.decimals()])
  const answer = roundData[1]
  const updatedAt = Number(roundData[3])
  if (answer <= 0n) throw new Error('non-positive feed answer')
  if (nowSeconds - updatedAt > FEED_MAX_AGE_SECONDS) throw new Error('stale feed answer')
  return Number(answer) / 10 ** Number(decimals)
}

/**
 * Spot price of `token` in the stablecoin (≈USD), from the most liquid
 * existing pool across the probed fee tiers. Returns null when no pool
 * exists or the pool is empty.
 */
async function readDexSpotUsd(provider, dex, token, stable) {
  const factory = new Contract(dex.factory, UNISWAP_V3_FACTORY_ABI, provider)
  for (const fee of DEX_SPOT_FEE_TIERS) {
    let poolAddress
    try {
      poolAddress = await factory.getPool(token.address, stable.address, fee)
    } catch {
      continue
    }
    if (!poolAddress || poolAddress === ZERO_ADDRESS) continue
    try {
      const pool = new Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider)
      const [slot0, token0, liquidity] = await Promise.all([
        pool.slot0(),
        pool.token0(),
        pool.liquidity(),
      ])
      if (liquidity === 0n) continue
      const sqrtPriceX96 = Number(slot0[0])
      if (!sqrtPriceX96) continue
      // rawRatio = raw token1 per raw token0. Human price of our token in
      // the stablecoin: token0 → rawRatio·10^(dTok−dStable);
      // token1 → (1/rawRatio)·10^(dTok−dStable).
      const rawRatio = (sqrtPriceX96 / Q96) ** 2
      const tokenIsToken0 = token0.toLowerCase() === token.address.toLowerCase()
      const price =
        (tokenIsToken0 ? rawRatio : 1 / rawRatio) * 10 ** (token.decimals - stable.decimals)
      if (Number.isFinite(price) && price > 0) return price
    } catch {
      continue
    }
  }
  return null
}

// The ERC-20 stand-in used to price an underlying on a DEX chain: the
// wrapped native for the chain's own gas asset, else a registry token whose
// underlying matches (e.g. WETH pricing ETH).
function dexCandidateFor(underlying, chainId, registryEntries) {
  return registryEntries.find(
    (e) =>
      e.chainId === chainId &&
      e.kind === 'erc20' &&
      e.categoryId !== 'payment-stablecoins' &&
      underlyingSymbolOf(e) === underlying,
  )
}

/**
 * Resolve USD prices for every non-stablecoin underlying in the registry.
 *
 * @param {Map<number, import('ethers').Provider>} providers - per-chain read providers
 * @param {Array} registryEntries - combined per-chain registry entries in scope
 * @param {number} [nowSeconds] - clock for feed staleness checks (testable)
 * @returns {Promise<Map<string, {usd: number, source: string, chainId: number}>>}
 */
export async function fetchPortfolioPrices(providers, registryEntries, nowSeconds = Math.floor(Date.now() / 1000)) {
  const prices = new Map()
  const underlyings = new Set(
    registryEntries
      .filter((e) => e.categoryId !== 'payment-stablecoins' && e.kind !== 'nft')
      .map((e) => underlyingSymbolOf(e))
      .filter(Boolean),
  )

  // 1. Chainlink feeds (highest trust), all fetched concurrently.
  const feedJobs = []
  for (const [chainIdKey, feeds] of Object.entries(CHAINLINK_FEEDS)) {
    const chainId = Number(chainIdKey)
    const provider = providers.get(chainId)
    if (!provider) continue
    for (const [symbol, feedAddress] of Object.entries(feeds)) {
      if (!underlyings.has(symbol) || prices.has(symbol)) continue
      feedJobs.push(
        readChainlinkUsd(provider, feedAddress, nowSeconds)
          .then((usd) => ({ symbol, usd, chainId }))
          .catch(() => null),
      )
    }
  }
  for (const result of await Promise.all(feedJobs)) {
    if (result && !prices.has(result.symbol)) {
      prices.set(result.symbol, { usd: result.usd, source: 'chainlink', chainId: result.chainId })
    }
  }

  // 2. DEX pool spot for whatever is still unpriced, chain by chain.
  for (const underlying of underlyings) {
    if (prices.has(underlying)) continue
    for (const [chainIdKey, provider] of providers) {
      const chainId = Number(chainIdKey)
      const net = NETWORKS[chainId]
      if (!net?.dex || !net?.stablecoin?.address) continue
      const candidate = dexCandidateFor(underlying, chainId, registryEntries)
      if (!candidate) continue
      try {
        const usd = await readDexSpotUsd(provider, net.dex, candidate, net.stablecoin)
        if (usd != null) {
          prices.set(underlying, { usd, source: 'dex', chainId })
          break
        }
      } catch {
        /* try the next chain */
      }
    }
  }

  return prices
}

// Member-facing names for price provenance (shown in the asset sheet).
export function priceSourceLabel(entry) {
  if (!entry) return null
  const network = NETWORKS[entry.chainId]?.name || `chain ${entry.chainId}`
  if (entry.source === 'chainlink') return `Chainlink oracle (${network})`
  if (entry.source === 'dex') return `DEX pool spot (${network})`
  return null
}
