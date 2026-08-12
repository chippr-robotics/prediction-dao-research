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
/**
 * `Fee.totalPositionSizeFeeP` → a FRACTION of position size. 1e12, not 1e10: the stored value is a
 * PERCENT at 1e10, and the extra /100 turns it into the fraction the fee is actually multiplied by
 * (@gainsnetwork/sdk lib/backend/tradingVariables/converter.js#convertFee). BTC's 350000000 is
 * 0.00035 = 0.035%, which is the rate gTrade publishes for it.
 */
const GAINS_FEE_RATE_P = 1e12
/** `Fee.minPositionSizeUsd` → USD (same converter). BTC's 285715 is $285.715. */
const GAINS_MIN_POSITION_SIZE_USD_P = 1e3
/**
 * `openTrade` reverts `InsufficientCollateral` below 5 × the pair's minimum fee — the check that
 * REPLACED the old `BelowMinPositionSizeUsd` in gTrade v9 (docs.gains.trade changelog v9-update,
 * unchanged by v10, which only relaxed the partial-close/leverage bound to 1 × min fee).
 */
const GAINS_MIN_COLLATERAL_MIN_FEE_MULTIPLE = 5
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

/**
 * Non-negative integer or null — used for indices and block numbers. A missing index must never
 * arrive as 0: index 0 is a REAL trade/order on Gains, so a fabricated 0 is a handle to someone
 * else's object rather than an honest "unknown" (FR-005, and the index trap below).
 */
function uint(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * Exact non-negative integer as a decimal STRING, or null. Collateral `precision` is 10**decimals
 * and reaches 1e18 for DAI/WETH markets — past the float range where JSON round-trips are
 * guaranteed exact — so scales cross the wire as strings and are never re-derived from a float.
 */
function digits(value) {
  if (value == null || value === '') return null
  const s = typeof value === 'string' ? value.trim() : String(value)
  if (/^\d+$/.test(s)) return s
  try {
    const b = BigInt(value)
    return b >= 0n ? b.toString() : null
  } catch {
    return null
  }
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
 * The collateral tokens Gains accepts on a chain, as the OPEN path needs them (spec 083 US3).
 *
 * WHY IT IS ON THE PAIR FEED. `openTrade` takes a 1-BASED `collateralIndex` and the token's own
 * decimals decide what a member's typed amount means. Neither is derivable from anything else the
 * client holds — a symbol is not an index, and a wrong index opens the position in a different
 * collateral. Without this the open sheet has no collateral it can name, so it would render a
 * control that cannot submit; publishing the venue's own list is what makes the control real.
 *
 * INACTIVE COLLATERALS ARE OMITTED, not marked: the venue refuses a trade in one, so offering it
 * would be a dead choice. An entry missing its address, index or decimals is omitted for the same
 * reason — a partial collateral is not a collateral, and inventing the missing half is exactly the
 * fabrication the DTO rules forbid.
 */
function gainsCollateralOptions(tv) {
  const out = []
  for (const col of tv?.collaterals ?? []) {
    if (col?.isActive === false) continue
    const address = isAddress(col?.collateral) ? col.collateral : null
    const collateralIndex = uint(col?.collateralIndex)
    const decimals = uint(col?.collateralConfig?.decimals)
    // 0 is not a collateral index on this venue — the space is 1-based, so a 0 here is an absent
    // value that `uint` legitimately kept, and using it would name the wrong collateral.
    if (!address || collateralIndex == null || collateralIndex <= 0 || decimals == null) continue
    out.push({
      symbol: typeof col.symbol === 'string' && col.symbol !== '' ? col.symbol : null,
      address,
      decimals,
      collateralIndex,
      // The venue's own USD price for it. Never assumed to be 1: the sheet sizes the position from
      // this, and a de-pegged stable priced at par would misstate the notional a member signs for.
      usdPrice: pos(col?.prices?.collateralPriceUsd),
    })
  }
  return out
}

/**
 * THE VENUE'S OWN TRADING FEE for a pair, and the minimum its own contract enforces (spec 083).
 *
 * WHY THIS IS A RATE AND NOT AN AMOUNT. A perps fee is a fraction of POSITION SIZE, and the size is
 * whatever the member types. A per-pair dollar figure could only be a fee for one particular size,
 * so it would be wrong for every other one — the feed publishes the rate and the client multiplies
 * it by the size it is showing, which is the only way the number on screen can match the order.
 *
 * SCALES, from `@gainsnetwork/sdk` and re-verified against the LIVE Arbitrum payload + diamond
 * (2026-08-12, `0xFF162c694eAA571f685030649814282eA457f169`):
 *   fees[feeIndex].totalPositionSizeFeeP  350000000 / 1e12 = 0.00035  (BTC, 0.035%)
 *   fees[feeIndex].minPositionSizeUsd     285715    / 1e3  = $285.715
 *   pairMinFeeUsd(0) on chain             100000250000000000 / 1e18 = $0.10000025
 *                                       = 0.00035 × 285.715 exactly — checked on 5 pairs.
 *
 * THE FLOOR IS NOT A MINIMUM SIZE. `getTotalTradeFeesCollateral` charges the rate on
 * `max(positionSize, minPositionSizeUsd)`, so a position SMALLER than the floor is accepted and
 * pays the fee of a floor-sized one. That is why `minNotional` below is null and not this number:
 * publishing it as a minimum would refuse orders the venue would happily fill, which is a dead
 * control, and the harm it would hide (a $50 BTC position paying $0.10 — 0.2%, nearly six times the
 * headline rate) is disclosed by charging the floor rather than by forbidding the trade.
 *
 * WHAT THE RATE EXCLUDES, and why it is labelled an estimate rather than a quote: spread and price
 * impact, borrowing and funding (charged over time, not at open), the counter-trade discount (a
 * property of the order book at execution, unknowable here) and the member's own fee-tier/staking
 * multiplier — which only ever REDUCES it, so the published rate is an honest upper bound.
 *
 * → `{ openRate, closeRate, feeFloorNotionalUsd, minFeeUsd, basis }` or null where the payload does
 * not describe the pair's fee. Null means "not published", never "no fee".
 */
function gainsPairFee(tv, pair) {
  const feeIndex = uint(pair?.feeIndex)
  const fee = feeIndex == null ? null : (tv?.fees?.[feeIndex] ?? null)
  if (!fee) return null
  const rawRate = num(fee.totalPositionSizeFeeP)
  // A zero rate is a real, publishable fact ("this pair costs nothing to open"), so it is kept and
  // only a MISSING rate yields null — the two must not collapse into one answer.
  if (rawRate == null || rawRate < 0) return null
  const openRate = rawRate / GAINS_FEE_RATE_P
  const rawFloor = num(fee.minPositionSizeUsd)
  const feeFloorNotionalUsd = rawFloor != null && rawFloor > 0 ? rawFloor / GAINS_MIN_POSITION_SIZE_USD_P : null
  return {
    openRate,
    // The same rate on the way out: `getClosingFee` delegates to the very same
    // `getTotalTradeFeesCollateral`. Emitted as its own field rather than left implied, so a venue
    // that ever splits the two does not need a consumer change to be told apart.
    closeRate: openRate,
    feeFloorNotionalUsd,
    // The venue's own `pairMinFeeUsd` — the fee a below-floor position pays.
    minFeeUsd: feeFloorNotionalUsd != null ? openRate * feeFloorNotionalUsd : null,
    // A RATE THE VENUE PUBLISHES, not a quote it gave for this order. Consumers must say so.
    basis: 'published-rate',
  }
}

/**
 * @param {{tradingVariables: object, chartPrices?: object|null, chainId: number}} input
 * @returns {object[]} PerpPair[]
 */
export function normalizeGainsPairs({ tradingVariables: tv, chartPrices, chainId }) {
  if (!tv || !Array.isArray(tv.pairs)) return []
  const opens = Array.isArray(chartPrices?.opens) ? chartPrices.opens : null
  // Chain-wide on this venue, so it is built once and shared by reference across the pair rows.
  const collaterals = gainsCollateralOptions(tv)
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
    // Group minimums are 1e3-scaled like the maximum. Gains' forex groups start above 1x, and a
    // default below the floor is refused at signing — so the client needs the floor, not just the
    // ceiling. A group that does not publish one leaves it null (no floor asserted).
    const groupMin = num(group?.minLeverage)
    const venueFee = gainsPairFee(tv, pair)
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
      /* Spec 083 US3 — the venue's OWN handles for opening on this pair. Display fields above are
       * exactly as spec 082 shipped them. `pairIndex` is the loop index by construction: it is the
       * position in `tv.pairs`, which is the same index `openTrade` consumes and the same one
       * `gainsPairAggregates` reads OI and funding at, so it cannot drift from the row it describes. */
      pairIndex: i,
      minLeverage: groupMin != null && groupMin > 0 ? groupMin / GAINS_LEVERAGE_SCALE : null,
      collaterals,
      /* Spec 083 — THE VENUE'S OWN COST, so the confirm step does not show FairWins' fee in money
       * beside the venue's as a dash. A dash there reads as "FairWins is what this costs", which is
       * the opposite of the disclosure this feature exists for. See `gainsPairFee`. */
      venueFee,
      /* DELIBERATELY NULL, and this is the fix for the gap tasks.md recorded as "gains does not
       * publish a minimum". It does not publish one because since v9 it does not HAVE one: the
       * `BelowMinPositionSizeUsd` check was removed and `minPositionSizeUsd` became the fee floor
       * above. Emitting that number here would refuse a $100 BTC position as "below the venue's
       * $285.72 minimum" while the venue would fill it. The bound that DOES exist is on collateral,
       * and it is the next field. */
      minNotional: null,
      /* The `InsufficientCollateral` bound: `openTrade` requires collateral ≥ 5 × the pair's own
       * minimum fee. Small ($0.50 on every pair measured) but real, and refusing it before the
       * wallet prompt is strictly better than the member paying gas to read a revert selector. */
      minCollateralUsd:
        venueFee?.minFeeUsd != null ? venueFee.minFeeUsd * GAINS_MIN_COLLATERAL_MIN_FEE_MULTIPLE : null,
    })
  }
  return out
}

/* ------------------------------------------------------------------------------------------- *
 * Gains venue references (spec 083) — what the client needs to ACT on a position or an order.
 *
 * THE INDEX TRAP (specs/083-.../contracts/venue-calldata.md). Gains has TWO disjoint uint32 index
 * spaces: a TRADE index (`getTrades[].index` / `MarketExecuted.index`, consumed by
 * closeTradeMarket / updateTp / updateSl / updateLeverage / de-increasePositionSize) and a
 * PENDING-ORDER index (`getPendingOrders[].index` / `MarketOrderInitiated.orderId.index`, consumed
 * ONLY by cancelOrderAfterTimeout). Passing one where the other belongs does not revert — it acts
 * on a DIFFERENT OBJECT. The client keeps them in branded types that a raw number cannot enter, and
 * a JSON wire has no brands, so the defence here is the FIELD NAME: this module emits `tradeIndex`
 * and `pendingOrderIndex` and never a bare `index`. Nothing downstream can mix them up by accident
 * because neither name is guessable from the other.
 *
 * The refs carry IDENTIFIERS and static scales only — never mutable position state (collateral
 * amount, leverage, prices). Those are re-read from the venue at signing time: a cached amount is
 * already stale by the time the member signs, and a close/reduce built from it would be wrong in
 * exactly the moments that matter (rule: honest numbers).
 * ------------------------------------------------------------------------------------------- */

/**
 * `ITradingStorage.PendingOrderType`. The numeric `orderType` is authoritative; this table only
 * NAMES it. It mirrors `frontend/src/abis/perps/gainsDiamond.js#GAINS_PENDING_ORDER_TYPE` — the
 * gateway is plain Node ESM and cannot import the SPA tree, so the duplication is deliberate. An
 * unmapped value stays `null` rather than being invented (FR-008).
 */
const GAINS_PENDING_ORDER_TYPE_NAMES = Object.freeze({
  0: 'MARKET_OPEN',
  1: 'MARKET_CLOSE',
  2: 'LIMIT_OPEN',
  3: 'STOP_OPEN',
  4: 'TP_CLOSE',
  5: 'SL_CLOSE',
  6: 'LIQ_CLOSE',
  7: 'UPDATE_LEVERAGE',
  8: 'MARKET_PARTIAL_OPEN',
  9: 'MARKET_PARTIAL_CLOSE',
  10: 'PARAM_UPDATE',
  11: 'PNL_WITHDRAWAL',
  12: 'MANUAL_HOLDING_FEES_REALIZATION',
  13: 'MANUAL_NEGATIVE_PNL_REALIZATION',
})

/** MARKET_OPEN is the one pending-order type with no trade behind it yet (see gainsPendingRef). */
const GAINS_MARKET_OPEN = 0

/** The tv entry for a 1-based collateralIndex, or null when the payload does not describe it. */
function gainsCollateral(tv, collateralIndex) {
  if (collateralIndex == null) return null
  return (tv?.collaterals ?? []).find((c) => String(c?.collateralIndex) === String(collateralIndex)) ?? null
}

/**
 * The collateral half of a venue ref: token address + the scale its amounts are denominated in.
 * `collateralAmount` on this venue is in the COLLATERAL TOKEN'S OWN decimals (USDC = 1e6), never
 * 1e18 — the single most common mis-scaling in a Gains integration — so the ref carries both the
 * decimals and the exact `precision` (10**decimals) the payload reports, and null when it does not
 * report them (the client then resolves `getCollateral(index)` on chain rather than assuming).
 */
function gainsCollateralRef(col) {
  return {
    collateralToken: isAddress(col?.collateral) ? col.collateral : null,
    collateralDecimals: uint(col?.collateralConfig?.decimals),
    collateralPrecision: digits(col?.collateralConfig?.precision),
  }
}

/**
 * Venue ref for an OPEN TRADE — the TRADE index space. `closeTradeMarket`, `updateTp`, `updateSl`,
 * `updateLeverage` and `de/increasePositionSize` all take this index; `cancelOrderAfterTimeout`
 * never does.
 */
function gainsTradeRef({ trade, tv, chainId, pairIndex }) {
  const collateralIndex = uint(trade?.collateralIndex)
  return {
    venue: 'gains',
    chainId,
    tradeIndex: uint(trade?.index),
    pairIndex,
    collateralIndex,
    ...gainsCollateralRef(gainsCollateral(tv, collateralIndex)),
  }
}

/**
 * Venue ref for a PENDING ORDER — the PENDING-ORDER index space, plus the trade the order acts on
 * where one exists.
 *
 * TRAP ENCODED HERE: a MARKET_OPEN pending order has no trade yet, and the venue overwrites
 * `Trade.index` to 0 on the way in. Publishing that 0 as `tradeIndex` would hand the client a live
 * handle to the member's trade #0 — a different position entirely. So `tradeIndex` is null for
 * MARKET_OPEN and only present for the order types that reference a stored trade (limit/stop
 * orders included: those ARE stored trade records with a real index).
 */
function gainsPendingRef({ order, tv, chainId, pendingOrderIndex, orderType }) {
  const trade = order?.trade ?? null
  const collateralIndex = uint(trade?.collateralIndex)
  const tradeIndex = orderType === GAINS_MARKET_OPEN ? null : uint(trade?.index)
  return {
    venue: 'gains',
    chainId,
    pendingOrderIndex,
    tradeIndex,
    pairIndex: uint(trade?.pairIndex),
    collateralIndex,
    ...gainsCollateralRef(gainsCollateral(tv, collateralIndex)),
  }
}

/**
 * Pending (not-yet-executed) Gains market orders for one member — the recovery surface. A member
 * cannot recover a stuck order the client cannot see, so this read is served alongside positions
 * and every value it cannot establish is null rather than absent-shaped-as-zero.
 *
 * Source: `GET /user-trading-variables/<address>` → `{ pendingMarketOrdersIds, pendingMarketOrders }`
 * (verified live against backend-arbitrum.gains.trade, 2026-08-12). Entries are the venue's
 * `PendingOrder`: `{ trade, user, index, isOpen, orderType, createdBlock, maxSlippageP }` — note
 * `index` there is the PENDING-ORDER index while `trade.index` is the TRADE index.
 *
 * Everything here is REQUESTED, not executed: inclusion is not execution, so the size/price/
 * leverage fields are named `requested*` and no component can mistake them for what the position
 * actually became.
 *
 * @param {{userTradingVariables: object, tradingVariables?: object|null, chainId: number}} input
 * @returns {object[]} PerpPendingOrder[]
 */
export function normalizeGainsPendingOrders({ userTradingVariables: utv, tradingVariables: tv = null, chainId }) {
  const entries = Array.isArray(utv?.pendingMarketOrders) ? utv.pendingMarketOrders : []
  const ids = Array.isArray(utv?.pendingMarketOrdersIds) ? utv.pendingMarketOrdersIds : []
  // The timeout the venue itself reports; cancelOrderAfterTimeout reverts WaitTimeout() until
  // createdBlock + this many blocks. Passing it through stops the client hardcoding a per-chain
  // constant (measured 200 Arbitrum / 30 Base / 30 Polygon) that the venue can change.
  const timeoutBlocks = uint(tv?.marketOrdersTimeoutBlocks)
  const out = []
  const seen = new Set()

  for (const order of entries) {
    const pendingOrderIndex = uint(order?.index)
    if (pendingOrderIndex == null) continue
    if (order?.isOpen === false) continue // the venue already resolved it — nothing to recover
    seen.add(pendingOrderIndex)

    const trade = order?.trade ?? null
    const orderTypeRaw = uint(order?.orderType)
    const pairIndex = uint(trade?.pairIndex)
    const pair = pairIndex != null ? tv?.pairs?.[pairIndex] : null
    const col = gainsCollateral(tv, uint(trade?.collateralIndex))
    const precision = num(col?.collateralConfig?.precision)
    const colPriceUsd = num(col?.prices?.collateralPriceUsd)
    const leverage = num(trade?.leverage) != null ? Number(trade.leverage) / GAINS_LEVERAGE_SCALE : null
    const collateralUsd =
      precision != null && colPriceUsd != null && num(trade?.collateralAmount) != null
        ? (Number(trade.collateralAmount) / precision) * colPriceUsd
        : null

    out.push({
      id: `gains:${chainId}:pending:${pendingOrderIndex}`,
      venue: 'gains',
      chainId,
      symbol: pair ? `${pair.from}/${pair.to}` : pairIndex != null ? `pair #${pairIndex}` : null,
      direction: trade?.long == null ? null : trade.long ? 'long' : 'short',
      orderType: orderTypeRaw,
      orderTypeName: orderTypeRaw != null ? (GAINS_PENDING_ORDER_TYPE_NAMES[orderTypeRaw] ?? null) : null,
      createdBlock: uint(order?.createdBlock),
      timeoutBlocks,
      // Pre-execution values: what the member ASKED for, never what exists on the venue.
      requestedCollateralUsd: collateralUsd,
      requestedLeverage: leverage,
      requestedSizeUsd: collateralUsd != null && leverage != null ? collateralUsd * leverage : null,
      requestedPrice: num(trade?.openPrice) != null ? pos(Number(trade.openPrice) / GAINS_P) : null,
      venueRef: gainsPendingRef({ order, tv, chainId, pendingOrderIndex, orderType: orderTypeRaw }),
    })
  }

  // `pendingMarketOrdersIds` carries the same orders as bare {user, index} ids. When the backend
  // reports an id with no matching detail entry we still emit the ref: a recovery handle the member
  // cannot see is the failure this whole surface exists to prevent. Everything unknown stays null,
  // so the client offers cancellation without claiming a countdown it cannot compute.
  for (const id of ids) {
    const pendingOrderIndex = uint(id?.index ?? id)
    if (pendingOrderIndex == null || seen.has(pendingOrderIndex)) continue
    seen.add(pendingOrderIndex)
    out.push({
      id: `gains:${chainId}:pending:${pendingOrderIndex}`,
      venue: 'gains',
      chainId,
      symbol: null,
      direction: null,
      orderType: null,
      orderTypeName: null,
      createdBlock: null,
      timeoutBlocks,
      requestedCollateralUsd: null,
      requestedLeverage: null,
      requestedSizeUsd: null,
      requestedPrice: null,
      venueRef: {
        venue: 'gains',
        chainId,
        pendingOrderIndex,
        tradeIndex: null,
        pairIndex: null,
        collateralIndex: null,
        collateralToken: null,
        collateralDecimals: null,
        collateralPrecision: null,
      },
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
      // Spec 083: the handles the calldata builders need. Display fields above stay exactly as
      // spec 082 shipped them — the phase-0 UI reads them.
      venueRef: gainsTradeRef({ trade: t, tv, chainId, pairIndex }),
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
  const tokenByAddress = new Map(tokenList.map((t) => [String(t.address).toLowerCase(), t]))
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
      /* Spec 083 US3 — the venue's OWN handles for opening on this market.
       *
       * `market` is the market TOKEN, which is what `CreateOrderParams.addresses.market` takes. It
       * is already inside the row's id, and the client can parse it back out; publishing it as a
       * field means nothing downstream has to parse an id to act, and the two can never disagree
       * because both come from this one value.
       *
       * `collaterals` are the market's own long and short tokens — the only two GMX accepts here.
       * They are emitted ONLY when the payload names them and the token list resolves their
       * decimals: a collateral whose decimals we do not know cannot turn a member's typed amount
       * into base units, so offering it would produce an order for the wrong size. An empty list
       * therefore means "GMX did not tell us", and the sheet declines to offer this venue rather
       * than guessing a token. */
      market: isAddress(m.marketToken) ? m.marketToken : null,
      collaterals: gmxCollateralOptions(m, tokenByAddress, tickerByAddress),
      /* PRESENT-AND-NULL, NOT ABSENT (spec 083). GMX's position fee is
       * `positionFeeFactorForPositiveImpact` / `…ForNegativeImpact` in its DataStore, and the
       * minimums are `MIN_COLLATERAL_USD` / `MIN_POSITION_SIZE_USD` there too. NONE of them appear
       * in `/markets/info`, `/markets` or any other REST path this proxy can reach — verified
       * against the live arbitrum-api.gmxinfra.io response on 2026-08-12, whose market objects
       * carry name/tokens/liquidity/OI/rates and nothing else.
       *
       * So the honest answer is a dash and this null, not a rate borrowed from GMX's docs: a
       * published number that the deployed DataStore has since moved is a wrong fee, and a wrong
       * fee is worse than an admitted unknown. The fields are EMITTED rather than omitted so a
       * consumer can tell "this producer knows about venue fees and GMX does not publish one" from
       * "this gateway predates the field" — absence would read as the second.
       *
       * The fix, if it is ever wanted, is a DataStore read; it belongs on the client next to
       * `readExecutionFee`, which already reads that contract, not in this HTTP-only proxy. */
      venueFee: null,
      minNotional: null,
      minCollateralUsd: null,
    })
  }
  return out
}

/**
 * A GMX market's accepted collateral, from the market's own long/short tokens.
 *
 * De-duplicated: a single-token market names the same address twice, and two identical choices in
 * a picker is a defect the member has to reason about.
 */
function gmxCollateralOptions(market, tokenByAddress, tickerByAddress) {
  const out = []
  const seen = new Set()
  for (const address of [market?.longToken, market?.shortToken]) {
    if (!isAddress(address)) continue
    const key = address.toLowerCase()
    if (seen.has(key)) continue
    const token = tokenByAddress.get(key)
    const decimals = uint(token?.decimals)
    if (decimals == null) continue
    seen.add(key)
    out.push({
      symbol: typeof token?.symbol === 'string' && token.symbol !== '' ? token.symbol : null,
      address,
      decimals,
      // GMX has no per-collateral index — the token address IS the handle. Null rather than absent
      // so the shape matches Gains' and a consumer never has to know which venue it came from.
      collateralIndex: null,
      // GMX's OWN price for the collateral, so the notional a member is shown is measured in the
      // venue's units and not against an assumed $1 peg. Null where the venue did not price it.
      usdPrice: gmxTokenPriceUsd(tickerByAddress.get(key), decimals),
    })
  }
  return out
}

/** A GMX ticker → USD, at the venue's own 10^(30 - decimals) scale. Null when it did not report. */
function gmxTokenPriceUsd(ticker, decimals) {
  const min = num(ticker?.minPrice)
  const max = num(ticker?.maxPrice)
  if (min == null || max == null) return null
  return pos((min + max) / 2 / 10 ** (30 - decimals))
}

// ---------------------------------------------------------------------------------------------
// Hyperliquid
//
// PERP DEXES (HIP-3). Hyperliquid is not one order book: alongside its own book it hosts
// validator-operated ("builder-deployed") perp dexes, each with its own asset universe and its own
// per-member clearinghouse state. Every `/info` read that touches either takes a `dex` field, and
// the venue's docs are explicit that it *"Defaults to the empty string which represents the first
// perp dex."* A read that omits it therefore answers ONLY for the first dex — which is how spec 082
// came to tell a member holding 35 positions across `xyz`/`hyna`/`mkts` that they held none
// (`specs/083-perps-position-management/hyperliquid-decision.md` §5.2, defect 1). A fabricated
// absence is the one thing this feature's rules forbid most clearly, so every Hyperliquid DTO below
// is SCOPED TO THE DEX IT CAME FROM and the routes fan the read out across the discovered list.
// ---------------------------------------------------------------------------------------------

/**
 * Hyperliquid's own name for the first/default perp dex is the EMPTY STRING — not "hyperliquid",
 * not null. It is a real value in the venue's vocabulary and is sent verbatim on every read.
 */
export const HL_DEFAULT_DEX = ''

/** A dex name we can put in an id and a request body, or the default dex. Never undefined. */
function hlDex(value) {
  return typeof value === 'string' ? value : HL_DEFAULT_DEX
}

/**
 * The asset's own name, with a redundant `dex:` prefix stripped.
 *
 * Some Hyperliquid surfaces qualify a HIP-3 asset as `"<dex>:<COIN>"` while the dex's own universe
 * lists it bare. Both reach here, and `"xyz:BTC/USD"` in a symbol column is the venue's plumbing
 * leaking onto a member's screen — the dex belongs beside the symbol (`variant`), not inside it.
 */
function hlBase(name, dex) {
  const text = String(name)
  return dex && text.startsWith(`${dex}:`) ? text.slice(dex.length + 1) : text
}

/**
 * Ids must be unique ACROSS dexes: two dexes listing BTC produce two real markets, and two real
 * positions, and an id that omits the dex merges them into one row (the collision recorded in
 * hyperliquid-decision.md §5.2).
 *
 * The DEFAULT dex keeps the exact id spec 082 shipped. That is deliberate rather than tidy: the
 * SPA's activity source fingerprints these ids to notice a position changing, so re-keying the
 * default dex's rows would emit a "your perp positions changed on Hyperliquid" entry to every
 * existing holder on the first poll after deploy — a fabricated event, which is the same class of
 * lie in the other direction. Non-default dexes are new here, so they carry the dex segment and
 * cannot collide with a 3-segment default id.
 */
function hlId(dex, ...parts) {
  return ['hyperliquid', ...(dex ? [dex] : []), ...parts].join(':')
}

/**
 * The venue's perp-dex list → the dex names to read, default dex first.
 *
 * The response is an array whose FIRST element is a bare `null` standing for the first/default dex
 * (whose name is `''`); every other element is an object with a `name`. A `null` here is the
 * venue's encoding, not a missing value, so it must not be filtered out.
 *
 * @param {unknown} perpDexs the raw `{"type":"perpDexs"}` response
 * @returns {string[]} dex names, deduped, default (`''`) first
 */
export function normalizeHyperliquidDexes(perpDexs) {
  const out = []
  const seen = new Set()
  const add = (name) => {
    if (typeof name !== 'string' || seen.has(name)) return
    seen.add(name)
    out.push(name)
  }
  if (Array.isArray(perpDexs)) {
    for (const entry of perpDexs) {
      if (entry == null) add(HL_DEFAULT_DEX)
      else if (typeof entry?.name === 'string') add(entry.name.trim())
    }
  }
  // The default dex is what every un-scoped read already answered for. If the venue's list omits
  // it (or the list is unusable), read it anyway rather than losing the positions we serve today.
  if (!seen.has(HL_DEFAULT_DEX)) out.unshift(HL_DEFAULT_DEX)
  return out
}

/**
 * @param {{metaAndAssetCtxs: [object, object[]], dex?: string}} input  the raw `metaAndAssetCtxs`
 *   response, and the perp dex it was read from (`''` = the first/default dex)
 * @returns {object[]} PerpPair[]
 */
export function normalizeHyperliquidPairs({ metaAndAssetCtxs, dex }) {
  if (!Array.isArray(metaAndAssetCtxs) || metaAndAssetCtxs.length < 2) return []
  const d = hlDex(dex)
  const universe = Array.isArray(metaAndAssetCtxs[0]?.universe) ? metaAndAssetCtxs[0].universe : []
  const ctxs = Array.isArray(metaAndAssetCtxs[1]) ? metaAndAssetCtxs[1] : []
  const out = []
  for (let i = 0; i < universe.length; i += 1) {
    const asset = universe[i]
    if (!asset?.name || asset.isDelisted) continue
    const ctx = ctxs[i] ?? {}
    const markPx = pos(ctx.markPx)
    const oiBase = num(ctx.openInterest)
    const base = hlBase(asset.name, d)
    out.push({
      id: hlId(d, base),
      venue: 'hyperliquid',
      chainId: null, // non-EVM venue (FR-012) — never a numeric chain id
      symbol: `${base}/USD`,
      base,
      quote: 'USD',
      // Which of Hyperliquid's perp dexes lists this market. `''` is the venue's own name for the
      // first/default one, so absence is never implied by an empty string here.
      dex: d,
      // Rides the SAME field GMX's market variant uses, so two same-symbol markets are already
      // distinguishable on every surface that renders a row (`PerpsPairTable`, `PerpsPositions`,
      // `PositionSheet`) without any of them learning what a perp dex is. Null on the default dex,
      // where there is no variant to state.
      variant: d || null,
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
 * @param {{clearinghouseState: object, dex?: string}} input  the raw `clearinghouseState` response,
 *   and the perp dex it was read from (`''` = the first/default dex)
 * @returns {object[]} PerpPosition[]
 */
export function normalizeHyperliquidPositions({ clearinghouseState, dex }) {
  const d = hlDex(dex)
  const assetPositions = Array.isArray(clearinghouseState?.assetPositions)
    ? clearinghouseState.assetPositions
    : []
  const out = []
  for (const ap of assetPositions) {
    const p = ap?.position
    const szi = num(p?.szi)
    if (p?.coin == null || szi == null || szi === 0) continue
    const base = hlBase(p.coin, d)
    const direction = szi > 0 ? 'long' : 'short'
    out.push({
      id: hlId(d, base, direction),
      venue: 'hyperliquid',
      chainId: null,
      symbol: `${base}/USD`,
      dex: d,
      variant: d || null,
      direction,
      sizeUsd: num(p.positionValue),
      collateralUsd: num(p.marginUsed),
      entryPrice: num(p.entryPx),
      leverage: num(p.leverage?.value),
      unrealizedPnlUsd: num(p.unrealizedPnl),
      // Hyperliquid is READ-ONLY here (FR-021) so this is an identity, never a handle to act
      // through: it names which book the row came from so a client can tell two same-symbol
      // positions apart and link out to the right one. Nothing downstream turns a ref into a
      // control — `canManage` asks `perpsManageEnabled(venue, chainId)`, which is config.
      venueRef: { venue: 'hyperliquid', dex: d },
    })
  }
  return out
}
