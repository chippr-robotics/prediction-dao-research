/**
 * LiquidityPoolCard (spec 067, US2 — T094) — one curated pool in Earn → Supply.
 *
 * Shows everything FR-017 asks for: the pool KIND, the asset or asset PAIR, the
 * PROTOCOL and NETWORK, the ESTIMATED RETURN, the TOTAL already supplied, and a
 * kind-specific RISK SUMMARY — every unfamiliar term carrying an InfoTip in the
 * same plain register as the Lend area.
 *
 * ── FOUR THINGS THIS CARD IS CAREFUL ABOUT ──────────────────────────────────
 *
 * 1. THE FEE LINE STATES A RATE, NEVER AN AMOUNT. `LiquidityRouter._supply`
 *    quotes the platform fee AFTER the mint, against the amounts Uniswap
 *    actually consumed — the pool takes only what its current price ratio needs
 *    and refunds the rest whole. So there is no honest "fee = rate × what you
 *    entered" figure to show before a deposit exists, and this card never
 *    implies one: it discloses the rate and says what the rate applies to.
 *
 * 2. A BRIDGE POOL HAS NO FEE LINE AT ALL. Across's `HubPool.addLiquidity` has
 *    no recipient parameter, so a fee-taking wrapper would own the position and
 *    the member could never exit it (research R3). That path is fee-free by
 *    design — and a line reading "0.00%" would imply a lever an operator could
 *    raise, which does not exist. `liquidityFeeCopy` returns null for one, and
 *    the fee row is simply absent.
 *
 * 3. A RETIRED POOL STAYS VISIBLE AND WITHDRAWABLE (FR-024). "Closed to new
 *    deposits" is a state, not a disappearance: the Supply control goes away,
 *    the Withdraw control does not, and a member with money inside always sees
 *    their pool. An unreachable protocol degrades the same way — figures read
 *    "—" with a reason rather than becoming invented numbers.
 *
 * 4. NO DEAD CONTROLS. A control is rendered only when it can actually be used,
 *    so a closed pool with no position shows a stated reason and no buttons.
 *
 * The card is an `<article>`, not a giant `<button>`, because it contains
 * InfoTip buttons — nesting interactive elements is an accessibility failure the
 * Lend row avoids by having no tips inside it. Actions are explicit buttons at
 * the foot of the card instead.
 */
import InfoTip from '../ui/InfoTip'
import AssetLogo from '../wallet/AssetLogo'
import { NETWORKS } from '../../config/networks'
import {
  LIQUIDITY_KIND_LABEL,
  LIQUIDITY_POOL_KIND,
  LIQUIDITY_TIPS,
  LIQUIDITY_UNAVAILABLE,
  POOL_UNREACHABLE_COPY,
  RETIRED_POOL_COPY,
  liquidityFeeCopy,
  poolKindOf,
  poolRiskSummary,
} from '../../lib/liquidity/liquidityCopy'
import { formatApy } from '../../lib/earn/format'

/** Why an estimated return is missing, when the pool itself did not say. */
const NO_RETURN_COPY =
  'Not available right now. An estimated return comes from the pool’s recent trading and bridging activity — we would rather show nothing than a figure we cannot source.'

/** Why a total is missing. Same rule: a blank with a reason beats an invented zero. */
const NO_TOTAL_COPY = 'We could not read this pool’s total just now, so it is not being shown.'

/** A Uniswap fee tier in hundredths of a bip → "0.30%". Null when there is none. */
function formatFeeTier(feeTier) {
  if (feeTier == null || Number(feeTier) <= 0) return null
  return `${(Number(feeTier) / 10_000).toFixed(2)}%`
}

/** "USDC / WETH" for a pair, "USDC" for a single asset. */
function assetLabel(assets) {
  return assets.map((a) => a.symbol || 'Unknown asset').join(' / ')
}

export default function LiquidityPoolCard({ pool, position = null, onSupply, onWithdraw }) {
  const kind = poolKindOf(pool.kind)
  const isTrading = kind === LIQUIDITY_POOL_KIND.TRADING_LP
  const assets = pool.assets || []
  const label = assetLabel(assets)
  const networkName = pool.networkName || NETWORKS[pool.chainId]?.name || 'unknown network'
  const feeTier = isTrading ? formatFeeTier(pool.feeTier) : null

  // FR-024 — retirement and unreachability close DEPOSITS, never the position.
  const retired = pool.enabled === false
  const unreachable = pool.unavailableReason === 'unreachable'
  const canSupply = Boolean(pool.available && onSupply)
  const canWithdraw = Boolean(position && onWithdraw)

  // Rule 1 + rule 2: a rate, only where a rate can actually be charged.
  const fee = liquidityFeeCopy({
    kind: pool.kind,
    bps: pool.feeBps ?? 0,
    available: pool.feeAvailable !== false,
  })

  const risk = poolRiskSummary(pool.kind)
  const kindTip = isTrading ? LIQUIDITY_TIPS.tradingPool : LIQUIDITY_TIPS.bridgePool

  return (
    <article
      className={`supply-card${pool.available ? '' : ' supply-card-closed'}`}
      aria-label={`${LIQUIDITY_KIND_LABEL[kind] || 'Liquidity pool'}: ${label} on ${networkName}`}
    >
      <div className="supply-card-head">
        {/* Nested asset + network artwork, the same the portfolio uses, so where
            a pool lives is visible without reading a word (FR-060). */}
        <span className={`supply-card-logos${assets.length > 1 ? ' pair' : ''}`}>
          {assets.map((asset) => (
            <AssetLogo
              key={asset.address || asset.symbol}
              symbol={asset.symbol}
              chainId={pool.chainId}
              showBadge
              size={32}
            />
          ))}
        </span>

        <span className="supply-card-id">
          <span className="supply-card-assets">{label}</span>
          <span className="supply-card-kind">
            <span className={`supply-kind-badge ${isTrading ? 'trading' : 'bridge'}`}>
              {LIQUIDITY_KIND_LABEL[kind] || 'Liquidity pool'}
            </span>
            <InfoTip
              label={isTrading ? 'What is a trading pool?' : 'What is a bridge pool?'}
              className="earn-info"
            >
              {kindTip}
            </InfoTip>
            {retired && (
              <span className="supply-kind-badge closed">Closed to new deposits</span>
            )}
            {unreachable && !retired && <span className="supply-kind-badge closed">Unreachable</span>}
          </span>
          <span className="supply-card-where">
            {pool.protocol} · on {networkName}
            {feeTier ? ` · ${feeTier} pool fee` : ''}
            {feeTier && (
              <InfoTip label="What is the pool fee?" className="earn-info">
                {LIQUIDITY_TIPS.feeTier}
              </InfoTip>
            )}
          </span>
        </span>
      </div>

      <dl className="supply-card-figures">
        <div>
          <dt>
            Estimated return
            <InfoTip label="What is the estimated return?" className="earn-info">
              {LIQUIDITY_TIPS.estimatedReturn}
            </InfoTip>
          </dt>
          <dd>
            {pool.estimatedReturnApr == null ? '—' : formatApy(pool.estimatedReturnApr)}
            {pool.estimatedReturnApr == null && (
              <span className="supply-figure-note">{pool.estimatedReturnReason || NO_RETURN_COPY}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            Total supplied
            <InfoTip label="What does total supplied mean?" className="earn-info">
              {LIQUIDITY_TIPS.totalSupplied}
            </InfoTip>
          </dt>
          <dd>
            {pool.totalSuppliedLabel || '—'}
            {!pool.totalSuppliedLabel && <span className="supply-figure-note">{NO_TOTAL_COPY}</span>}
          </dd>
        </div>
      </dl>

      {/* Rule 2: rendered only when a fee can genuinely be charged here. A bridge
          pool falls out at `liquidityFeeCopy`, which returns null for one. */}
      {fee && (
        <p className="supply-card-fee">
          <span className="supply-card-fee-rate">{fee.headline}</span>{' '}
          <span className="supply-card-fee-basis">{fee.basis}</span>
          <InfoTip label="About the platform fee" className="earn-info">
            {LIQUIDITY_TIPS.platformFee}
          </InfoTip>
        </p>
      )}

      {risk && (
        <p className="supply-card-risk">
          {risk}
          <InfoTip
            label={isTrading ? 'About changing asset mix' : 'About withdrawing from a bridge pool'}
            className="earn-info"
          >
            {isTrading ? LIQUIDITY_TIPS.impermanentLoss : LIQUIDITY_TIPS.inventory}
          </InfoTip>
        </p>
      )}

      {/* FR-024 — the honest closed states, each with its own reason. Never a
          hidden pool, and never a pool that looks open when it is not. */}
      {retired && (
        <p className="supply-card-state" role="note">
          {RETIRED_POOL_COPY}
          <InfoTip label="What does closed mean?" className="earn-info">
            {LIQUIDITY_TIPS.retiredPool}
          </InfoTip>
        </p>
      )}
      {unreachable && !retired && (
        <p className="supply-card-state" role="note">
          {POOL_UNREACHABLE_COPY}
        </p>
      )}
      {!retired && !unreachable && pool.unavailableReason === 'paused' && (
        <p className="supply-card-state" role="note">
          New deposits to this pool are paused right now. Your position is unaffected and can
          still be withdrawn.
        </p>
      )}
      {/* The pool is fine; the fee rate is what we could not read. Naming the
          right fault matters — the remedy is different. */}
      {!retired && !unreachable && pool.unavailableReason === 'fees' && (
        <p className="supply-card-state" role="note">
          {LIQUIDITY_UNAVAILABLE.fees}
        </p>
      )}

      {(canSupply || canWithdraw) && (
        <div className="supply-card-actions">
          {canSupply && (
            <button type="button" className="earn-btn primary" onClick={() => onSupply(pool)}>
              Supply {label}
            </button>
          )}
          {/* Exit is never gated on the pool being open, and never carries a
              FairWins fee (FR-021/FR-030). */}
          {canWithdraw && (
            <button type="button" className="earn-btn secondary" onClick={() => onWithdraw(pool)}>
              Withdraw
            </button>
          )}
        </div>
      )}
    </article>
  )
}
