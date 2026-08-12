/**
 * Venue payload → PerpPair / PerpPosition DTO normalizers (spec 082).
 *
 * Contract: specs/082-perps-trade-view/contracts/gateway-perps-api.md. This is the ONLY module
 * that knows upstream shapes; routes and the SPA consume the DTOs. Honesty rules (FR-005):
 * a metric a venue did not report is null, never 0; a value whose scale cannot be applied
 * (missing decimals, absent price) is null; nothing is derived from a guess.
 *
 * Scale provenance (verified against venue sources, research D2):
 *   - Gains Network: percentages/prices use 1e10 fixed-point ("P"), leverage 1e3,
 *     lastFundingRatePerSecondP is PERCENT per second at 1e18 (SDK
 *     FUNDING_FEES_PRECISION.FUNDING_RATE_PER_SECOND_P), collateral amounts use each
 *     collateral's own `collateralConfig.precision`, v10 token OI is 1e18
 *     (@gainsnetwork/sdk lib/markets/oi/converter.js, lib/trade/fees/fundingFees/converter.js).
 *   - GMX v2: USD values are 1e30 fixed-point; ticker prices are 10^(30 - tokenDecimals);
 *     funding/borrowing/net rates are ANNUALIZED fractions at 1e30 (we convert to hourly by
 *     /8760 and label hourly in the DTO).
 *   - Hyperliquid: decimal strings; `funding` is already the HOURLY rate as a fraction;
 *     `openInterest` is base-asset units (× mark price → USD); `dayNtlVlm` is 24h USD volume.
 */

const GAINS_P = 1e10 // gains 1e10 fixed-point (prices, percents)
const GAINS_LEVERAGE_SCALE = 1e3
const GAINS_FUNDING_RATE_PER_SECOND_P = 1e18 // percent/second
const GMX_FLOAT = 1e30
const HOURS_PER_YEAR = 8760
const SECONDS_PER_HOUR = 3600

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export function isAddress(value) {
  return typeof value === 'string' && ADDRESS_RE.test(value)
}

/** Finite number or null — the DTO never carries NaN/Infinity/undefined. */
function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Finite positive number or null (prices, OI, volume). */
function pos(value) {
  const n = num(value)
  return n != null && n > 0 ? n : null
}

// ---------------------------------------------------------------------------------------------
// Gains Network (gTrade)
// ---------------------------------------------------------------------------------------------

/**
 * Per-pair funding + OI across gains' per-collateral markets. One display row per pair: OI is the
 * SUM across collateral markets (total pair exposure); funding comes from the collateral market
 * with the largest OI (the dominant market), because funding is per-collateral in v10 and a single
 * blended rate would be a fabricated number.
 */
function gainsPairAggregates(tv, pairIndex, price) {
  let totalOiUsd = 0
  let sawOi = false
  let dominant = { oiUsd: -1, hourlyRate: null }
  for (const col of tv.collaterals ?? []) {
    if (!col?.isActive) continue
    const precision = num(col.collateralConfig?.precision)
    const colPriceUsd = num(col.prices?.collateralPriceUsd)
    const oi = col.pairOis?.[pairIndex]
    if (!oi || precision == null || colPriceUsd == null) continue
    const legacy = (num(oi.beforeV10?.long) ?? 0) + (num(oi.beforeV10?.short) ?? 0)
    const current = (num(oi.collateral?.oiLongCollateral) ?? 0) + (num(oi.collateral?.oiShortCollateral) ?? 0)
    const tokenUnits = (num(oi.token?.oiLongToken) ?? 0) + (num(oi.token?.oiShortToken) ?? 0)
    let oiUsd = (legacy / GAINS_P + current / precision) * colPriceUsd
    if (tokenUnits > 0 && price != null) oiUsd += (tokenUnits / 1e18) * price
    totalOiUsd += oiUsd
    sawOi = true

    const data = col.fundingFees?.pairData?.[pairIndex]
    const params = col.fundingFees?.pairParams?.[pairIndex]
    let hourlyRate = null
    if (params?.fundingFeesEnabled && data?.lastFundingRatePerSecondP != null) {
      const pctPerSecond = Number(data.lastFundingRatePerSecondP) / GAINS_FUNDING_RATE_PER_SECOND_P
      const hourly = (pctPerSecond * SECONDS_PER_HOUR) / 100 // percent → fraction
      hourlyRate = Number.isFinite(hourly) ? hourly : null
    }
    if (oiUsd > dominant.oiUsd) dominant = { oiUsd, hourlyRate }
  }
  return {
    openInterestUsd: sawOi ? totalOiUsd : null,
    fundingRate: dominant.hourlyRate,
  }
}

/**
 * @param {{tradingVariables: object, chartPrices?: object|null, chainId: number}} input
 * @returns {object[]} PerpPair[]
 */
export function normalizeGainsPairs({ tradingVariables: tv, chartPrices, chainId }) {
  if (!tv || !Array.isArray(tv.pairs)) return []
  const opens = Array.isArray(chartPrices?.opens) ? chartPrices.opens : null
  const out = []
  for (let i = 0; i < tv.pairs.length; i += 1) {
    const pair = tv.pairs[i]
    if (!pair?.from || !pair?.to) continue
    const group = tv.groups?.[Number(pair.groupIndex)] ?? null
    const override = num(tv.pairInfos?.maxLeverages?.[i])
    // Per-pair overrides are 1e3-scaled like group leverage; small sentinel values (0/1) mean
    // "use the group default" — a 0.001x max leverage is not a real market.
    const maxLeverage =
      override != null && override >= GAINS_LEVERAGE_SCALE
        ? override / GAINS_LEVERAGE_SCALE
        : group
          ? num(group.maxLeverage) != null
            ? Number(group.maxLeverage) / GAINS_LEVERAGE_SCALE
            : null
          : null
    const price = opens ? pos(opens[i]) : null
    const { openInterestUsd, fundingRate } = gainsPairAggregates(tv, i, price)
    out.push({
      id: `gains:${chainId}:${pair.from}/${pair.to}`,
      venue: 'gains',
      chainId,
      symbol: `${pair.from}/${pair.to}`,
      base: pair.from,
      quote: pair.to,
      group: group?.name ?? null,
      price,
      fundingRate,
      fundingIntervalHours: 1,
      openInterestUsd,
      maxLeverage,
      volume24hUsd: null, // not exposed by the gains backend
    })
  }
  return out
}

/**
 * @param {{openTrades: object[], tradingVariables: object, chartPrices?: object|null, chainId: number}} input
 * @returns {object[]} PerpPosition[]
 */
export function normalizeGainsPositions({ openTrades, tradingVariables: tv, chainId }) {
  if (!Array.isArray(openTrades)) return []
  const out = []
  for (const entry of openTrades) {
    const t = entry?.trade
    // tradeType 0 = an open market position; 1/2 are resting limit/stop orders, not exposure.
    if (!t?.isOpen || String(t.tradeType) !== '0') continue
    const pairIndex = Number(t.pairIndex)
    const pair = tv?.pairs?.[pairIndex]
    const col = (tv?.collaterals ?? []).find((c) => String(c.collateralIndex) === String(t.collateralIndex))
    const precision = num(col?.collateralConfig?.precision)
    const colPriceUsd = num(col?.prices?.collateralPriceUsd)
    const leverage = num(t.leverage) != null ? Number(t.leverage) / GAINS_LEVERAGE_SCALE : null
    const collateralUsd =
      precision != null && colPriceUsd != null && num(t.collateralAmount) != null
        ? (Number(t.collateralAmount) / precision) * colPriceUsd
        : null
    out.push({
      id: `gains:${chainId}:${t.index}`,
      venue: 'gains',
      chainId,
      symbol: pair ? `${pair.from}/${pair.to}` : `pair #${pairIndex}`,
      direction: t.long ? 'long' : 'short',
      sizeUsd: collateralUsd != null && leverage != null ? collateralUsd * leverage : null,
      collateralUsd,
      entryPrice: num(t.openPrice) != null ? Number(t.openPrice) / GAINS_P : null,
      leverage,
      unrealizedPnlUsd: null, // gains' backend does not report PnL on this read
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// GMX v2
// ---------------------------------------------------------------------------------------------

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * @param {{marketsInfo: object, tickers: object[], tokens: object, chainId: number}} input
 * @returns {object[]} PerpPair[]
 */
export function normalizeGmxPairs({ marketsInfo, tickers, tokens, chainId }) {
  const markets = Array.isArray(marketsInfo?.markets) ? marketsInfo.markets : []
  const tokenList = Array.isArray(tokens?.tokens) ? tokens.tokens : Array.isArray(tokens) ? tokens : []
  const decimalsByAddress = new Map(tokenList.map((t) => [String(t.address).toLowerCase(), num(t.decimals)]))
  const tickerByAddress = new Map(
    (Array.isArray(tickers) ? tickers : []).map((t) => [String(t.tokenAddress).toLowerCase(), t]),
  )
  const out = []
  for (const m of markets) {
    if (!m?.isListed) continue
    // indexToken == zero address is a swap-only (spot) market, not a perp.
    if (!m.indexToken || String(m.indexToken).toLowerCase() === ZERO_ADDRESS) continue
    const name = typeof m.name === 'string' ? m.name : ''
    const bracket = name.indexOf(' [')
    const symbol = bracket > 0 ? name.slice(0, bracket) : name
    if (!symbol.includes('/')) continue
    const [base, quote] = symbol.split('/')
    const indexKey = String(m.indexToken).toLowerCase()
    const decimals = decimalsByAddress.get(indexKey)
    const ticker = tickerByAddress.get(indexKey)
    let price = null
    if (ticker && decimals != null) {
      const scale = 10 ** (30 - decimals)
      const min = num(ticker.minPrice)
      const max = num(ticker.maxPrice)
      if (min != null && max != null) price = pos((min + max) / 2 / scale)
    }
    const oiLong = num(m.openInterestLong)
    const oiShort = num(m.openInterestShort)
    const openInterestUsd = oiLong != null && oiShort != null ? (oiLong + oiShort) / GMX_FLOAT : null
    // Funding rates arrive as annualized 1e30 fractions; the DTO is hourly.
    const fundingAnnual = num(m.fundingRateLong)
    const fundingRate = fundingAnnual != null ? fundingAnnual / GMX_FLOAT / HOURS_PER_YEAR : null
    out.push({
      id: `gmx:${chainId}:${symbol}:${m.marketToken}`,
      venue: 'gmx',
      chainId,
      symbol,
      base,
      quote,
      variant: bracket > 0 ? name.slice(bracket + 2, -1) : null, // e.g. "WBTC.b-USDC"
      price,
      fundingRate,
      fundingIntervalHours: 1,
      openInterestUsd,
      maxLeverage: null, // not exposed by the GMX REST API
      volume24hUsd: null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Hyperliquid
// ---------------------------------------------------------------------------------------------

/**
 * @param {{metaAndAssetCtxs: [object, object[]]}} input  the raw `metaAndAssetCtxs` response
 * @returns {object[]} PerpPair[]
 */
export function normalizeHyperliquidPairs({ metaAndAssetCtxs }) {
  if (!Array.isArray(metaAndAssetCtxs) || metaAndAssetCtxs.length < 2) return []
  const universe = Array.isArray(metaAndAssetCtxs[0]?.universe) ? metaAndAssetCtxs[0].universe : []
  const ctxs = Array.isArray(metaAndAssetCtxs[1]) ? metaAndAssetCtxs[1] : []
  const out = []
  for (let i = 0; i < universe.length; i += 1) {
    const asset = universe[i]
    if (!asset?.name || asset.isDelisted) continue
    const ctx = ctxs[i] ?? {}
    const markPx = pos(ctx.markPx)
    const oiBase = num(ctx.openInterest)
    out.push({
      id: `hyperliquid:${asset.name}`,
      venue: 'hyperliquid',
      chainId: null, // non-EVM venue (FR-012) — never a numeric chain id
      symbol: `${asset.name}/USD`,
      base: asset.name,
      quote: 'USD',
      price: pos(ctx.midPx) ?? markPx,
      fundingRate: num(ctx.funding), // already hourly, already a fraction
      fundingIntervalHours: 1,
      openInterestUsd: oiBase != null && markPx != null ? oiBase * markPx : null,
      maxLeverage: num(asset.maxLeverage),
      volume24hUsd: num(ctx.dayNtlVlm),
    })
  }
  return out
}

/**
 * @param {{clearinghouseState: object}} input  the raw `clearinghouseState` response
 * @returns {object[]} PerpPosition[]
 */
export function normalizeHyperliquidPositions({ clearinghouseState }) {
  const assetPositions = Array.isArray(clearinghouseState?.assetPositions)
    ? clearinghouseState.assetPositions
    : []
  const out = []
  for (const ap of assetPositions) {
    const p = ap?.position
    const szi = num(p?.szi)
    if (p?.coin == null || szi == null || szi === 0) continue
    out.push({
      id: `hyperliquid:${p.coin}:${szi > 0 ? 'long' : 'short'}`,
      venue: 'hyperliquid',
      chainId: null,
      symbol: `${p.coin}/USD`,
      direction: szi > 0 ? 'long' : 'short',
      sizeUsd: num(p.positionValue),
      collateralUsd: num(p.marginUsed),
      entryPrice: num(p.entryPx),
      leverage: num(p.leverage?.value),
      unrealizedPnlUsd: num(p.unrealizedPnl),
    })
  }
  return out
}
