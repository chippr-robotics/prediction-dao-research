/**
 * AdminStatTile (spec 093) — a headline stat with an explicit three-state
 * contract, so "zero because the read failed" has no code path in any admin
 * dashboard.
 *
 * Pass EITHER `result` (a spec-071 chainReadResult: read | not-deployed |
 * unreadable, with `display` used for the value when provided) OR a plain
 * `value` for figures that are not chain reads (counts the caller already
 * derived from data it verifiably has). A tile never invents a number: an
 * unreadable result renders "Could not be read", not 0.
 */
import { isRead, isNotDeployed } from '../../../lib/chains/chainReadResult'
import './adminCharts.css'

export default function AdminStatTile({ label, result, value, display, tone }) {
  let body
  let state = 'read'
  if (result != null) {
    if (isRead(result)) {
      body = display ?? String(result.value)
    } else if (isNotDeployed(result)) {
      state = 'not-deployed'
      body = 'Not deployed'
    } else {
      state = 'unreadable'
      body = 'Could not be read'
    }
  } else {
    body = display ?? String(value)
  }

  return (
    <div
      className={`admin-stat-tile${tone ? ` admin-stat-tile--${tone}` : ''}${
        state !== 'read' ? ` admin-stat-tile--${state}` : ''
      }`}
    >
      <span className="admin-stat-tile__value">{body}</span>
      <span className="admin-stat-tile__label">{label}</span>
    </div>
  )
}
