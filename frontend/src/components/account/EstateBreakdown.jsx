import { useMemo } from 'react'
import { formatUsd } from '../../lib/account/format'
import { estateByNetwork, estateByCategory } from '../../lib/account/estateBreakdown'
import SensitiveValue from '../common/SensitiveValue'
import './EstateBreakdown.css'

/**
 * Labeled proportion-bar rows: one measure (USD), one hue — identity lives in
 * the text label and every bar carries its exact value, so color never says
 * anything on its own.
 */
function BarRows({ rows, max, groupLabel }) {
  return (
    <ul className="estate-rows" aria-label={groupLabel}>
      {rows.map((r) => (
        <li className="estate-row" key={r.network || r.id || r.label}>
          <span className="estate-row-label">{r.network || r.label}</span>
          <span className="estate-row-bar-track" aria-hidden="true">
            <span
              className="estate-row-bar"
              style={{ width: `${max > 0 ? Math.max((r.usd / max) * 100, r.usd > 0 ? 1.5 : 0) : 0}%` }}
            />
          </span>
          <SensitiveValue className="estate-row-value">{formatUsd(r.usd)}</SensitiveValue>
        </li>
      ))}
    </ul>
  )
}

/**
 * EstateBreakdown — the account's holdings across its ENTIRE estate (every
 * supported network the portfolio scans), grouped by network and by asset
 * class. Fed by the SAME portfolio instance MyAccountView already holds, so
 * it costs no extra reads and follows the acting account — this is what makes
 * Stats say something useful about an imported/recovered account that has
 * never touched a wager.
 *
 * Honest states: a scan still loading says so; failed reads are named (never
 * summed as zero); unpriced holdings are excluded from USD figures and the
 * exclusion is disclosed.
 */
function EstateBreakdown({ portfolio }) {
  const { status, holdings = [], categories = [], totalUsd = 0, failedAssets = [] } = portfolio || {}

  const byNetwork = useMemo(() => estateByNetwork(holdings), [holdings])
  const byCategory = useMemo(() => estateByCategory(categories), [categories])

  if (!portfolio || status === 'disconnected') return null

  if (status === 'loading' && holdings.length === 0) {
    return (
      <section className="estate-breakdown" aria-label="Estate overview">
        <h3 className="estate-title">Across your estate</h3>
        <p className="estate-note" role="status">Reading balances across your networks…</p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="estate-breakdown" aria-label="Estate overview">
        <h3 className="estate-title">Across your estate</h3>
        <p className="estate-note" role="status">
          Balances could not be read right now. Nothing is shown rather than showing zeros.
        </p>
      </section>
    )
  }

  const hasAny = byNetwork.rows.length > 0 || byCategory.length > 0
  const netMax = byNetwork.rows.reduce((m, r) => Math.max(m, r.usd), 0)
  const catMax = byCategory.reduce((m, r) => Math.max(m, r.usd), 0)

  return (
    <section className="estate-breakdown" aria-label="Estate overview">
      <div className="estate-header">
        <h3 className="estate-title">Across your estate</h3>
        <SensitiveValue className="estate-total">{formatUsd(totalUsd)}</SensitiveValue>
      </div>

      {!hasAny ? (
        <p className="estate-note">No holdings found on the scanned networks yet.</p>
      ) : (
        <div className="estate-groups">
          <div className="estate-group">
            <h4 className="estate-group-title">By network</h4>
            <BarRows rows={byNetwork.rows} max={netMax} groupLabel="Estate value by network" />
          </div>
          <div className="estate-group">
            <h4 className="estate-group-title">By asset class</h4>
            <BarRows rows={byCategory} max={catMax} groupLabel="Estate value by asset class" />
          </div>
        </div>
      )}

      {failedAssets.length > 0 && (
        <p className="estate-note" role="status">
          Could not read: {failedAssets.join(', ')} — totals may be partial.
        </p>
      )}
      {byNetwork.unpricedCount > 0 && (
        <p className="estate-note">
          {byNetwork.unpricedCount} holding{byNetwork.unpricedCount === 1 ? '' : 's'} without an
          on-chain price {byNetwork.unpricedCount === 1 ? 'is' : 'are'} excluded from USD figures.
        </p>
      )}
    </section>
  )
}

export default EstateBreakdown
