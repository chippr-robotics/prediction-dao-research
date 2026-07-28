/**
 * LiquidityPoolCard (spec 067, US2 — T094) — one curated pool in Earn → Supply,
 * as a SCANNABLE LIST ROW.
 *
 * The row is a summary you skim; the pool's detail sheet is where you read. It
 * carries the four things that let a member choose between pools at a glance —
 * the asset or asset PAIR, the KIND, where it lives (PROTOCOL · NETWORK · pool
 * fee tier), and how big it is — plus a short label whenever the pool is not
 * taking deposits. Everything else FR-017 asks for (the estimated return in
 * full, the total with its caveat, the kind-specific RISK SUMMARY, the platform
 * fee rate, and every InfoTip that explains those terms) lives one tap away in
 * `SupplySheet`, which every row opens.
 *
 * ── FOUR THINGS THIS ROW IS CAREFUL ABOUT ───────────────────────────────────
 *
 * 1. THE WHOLE ROW IS THE CONTROL, so it is a single `<button>` — the same
 *    shape as the Lend vault row, and the reason neither carries an InfoTip:
 *    nesting one interactive element inside another is an accessibility
 *    failure. Tips moved to the sheet rather than being dropped.
 *
 * 2. A CLOSED POOL STILL OPENS (FR-024). "Closed to new deposits" is a state,
 *    not a disappearance: the row stays listed, stays labelled, and stays
 *    tappable, because the member's exit is inside the sheet it opens. What a
 *    closed pool never gets is a control that would start a deposit.
 *
 * 3. NOTHING HERE IS INVENTED (FR-054). A figure we could not read renders "—",
 *    and the sheet says why. The dense-row design this follows put a 7-day
 *    sparkline and a value-weighted composition bar in the row; neither has an
 *    honest source here — no price feed backs a two-asset split, and no history
 *    feed backs a trend — so neither is drawn. A decorative chart on a value
 *    surface is a claim, and we do not make claims we cannot source.
 *
 * 4. THE ESTIMATED RETURN READS "N/A", NOT "0%". Neither protocol publishes a
 *    realised return we can read on-chain, so the slot states an absence.
 */
import AssetLogo from '../wallet/AssetLogo'
import { NETWORKS } from '../../config/networks'
import {
  LIQUIDITY_KIND_LABEL,
  LIQUIDITY_POOL_KIND,
  poolKindOf,
  poolStateLabel,
} from '../../lib/liquidity/liquidityCopy'
import { formatApy } from '../../lib/earn/format'

/** A Uniswap fee tier in hundredths of a bip → "0.30%". Null when there is none. */
function formatFeeTier(feeTier) {
  if (feeTier == null || Number(feeTier) <= 0) return null
  return `${(Number(feeTier) / 10_000).toFixed(2)}%`
}

/** "USDC / WETH" for a pair, "USDC" for a single asset. */
function assetLabel(assets) {
  return assets.map((a) => a.symbol || 'Unknown asset').join(' / ')
}

export default function LiquidityPoolCard({ pool, position = null, onOpen }) {
  const kind = poolKindOf(pool.kind)
  const isTrading = kind === LIQUIDITY_POOL_KIND.TRADING_LP
  const assets = pool.assets || []
  const label = assetLabel(assets)
  const networkName = pool.networkName || NETWORKS[pool.chainId]?.name || 'unknown network'
  const feeTier = isTrading ? formatFeeTier(pool.feeTier) : null
  const kindLabel = LIQUIDITY_KIND_LABEL[kind] || 'Liquidity pool'
  // `totalSuppliedParts` is the same figure the sheet joins into one line. Falling back
  // to the joined label keeps a caller that only has that one (a test, a future source)
  // rendering the truth rather than a dash.
  const totalParts =
    pool.totalSuppliedParts || (pool.totalSuppliedLabel ? [pool.totalSuppliedLabel] : [])

  // FR-024 — retirement, a pause, an unreachable protocol and an unreadable fee
  // rate all close DEPOSITS and none of them closes the pool. Each names itself:
  // the remedies differ, so the labels must too. `=== false` on purpose: only a pool
  // we positively read as closed is drawn as closed — a missing field is an unknown,
  // and an unknown must not be dressed up as a state we did not read.
  const closed = pool.available === false
  const stateLabel = closed ? poolStateLabel(pool.unavailableReason) : null

  // Point 1: the row is only a control where there is somewhere for it to lead.
  const Row = onOpen ? 'button' : 'div'
  const rowProps = onOpen
    ? { type: 'button', onClick: () => onOpen(pool) }
    : {}

  // Announced in one breath, because a screen reader reaches the row as a single
  // control: what it is, where it lives, how big it is, and whether it is open.
  const described = [
    `${label} — ${kindLabel} on ${networkName}`,
    feeTier ? `${feeTier} pool fee` : null,
    pool.totalSuppliedLabel ? `${pool.totalSuppliedLabel} supplied` : 'total supplied unknown',
    position ? 'you have a position in this pool' : null,
    stateLabel,
  ]
    .filter(Boolean)
    .join('. ')

  return (
    <Row
      {...rowProps}
      className={`supply-row ${isTrading ? 'trading' : 'bridge'}${closed ? ' supply-row-closed' : ''}`}
      aria-label={described}
    >
      <span className="supply-row-head">
        {/* Nested asset + network artwork, the same the portfolio uses, so where
            a pool lives is visible without reading a word (FR-060). */}
        <span className={`supply-card-logos${assets.length > 1 ? ' pair' : ''}`}>
          {assets.map((asset) => (
            <AssetLogo
              key={asset.address || asset.symbol}
              symbol={asset.symbol}
              chainId={pool.chainId}
              showBadge
              size={28}
            />
          ))}
        </span>

        <span className="supply-row-name">{label}</span>

        {/* Point 3 — the figure, or a dash. Never a stand-in zero. A pair's total is
            two amounts, and they stack: joined with a "+" they wrap mid-figure at this
            width and read as one broken number. */}
        <span className="supply-row-total">
          {totalParts.length > 0 ? (
            // Keyed by position, not by text: the legs are a fixed, ordered pair from
            // one read, and two legs can round to the same rendered amount.
            totalParts.map((part, i) => (
              <span key={i} className="supply-row-total-value">
                {part}
              </span>
            ))
          ) : (
            <span className="supply-row-total-value">—</span>
          )}
          <span className="supply-row-total-label">supplied</span>
        </span>
      </span>

      <span className="supply-row-meta">
        <span className={`supply-row-chip ${isTrading ? 'trading' : 'bridge'}`}>{kindLabel}</span>
        {position && <span className="supply-row-chip position">Your position</span>}
        {/* Point 2 — the state travels WITH the row, never instead of it. */}
        {stateLabel && <span className="supply-row-chip closed">{stateLabel}</span>}
        <span className="supply-row-facts">
          <span>{pool.protocol}</span>
          <span aria-hidden="true">·</span>
          <span>{networkName}</span>
          {feeTier && (
            <>
              <span aria-hidden="true">·</span>
              <span>{feeTier} fee</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          {/* Point 4 — an absence stated as one. */}
          <span className={pool.estimatedReturnApr == null ? 'supply-row-absent' : undefined}>
            {pool.estimatedReturnApr == null ? 'Return n/a' : `Return ${formatApy(pool.estimatedReturnApr)}`}
          </span>
        </span>
      </span>
    </Row>
  )
}
