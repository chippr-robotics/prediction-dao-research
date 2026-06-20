import { formatUsd, formatCompact } from '../../lib/account/format'
import './ActivityBreakdowns.css'

const STATUS_LABEL = {
  open: 'Open',
  active: 'Active',
  draw_proposed: 'Draw proposed',
  resolved: 'Resolved',
  drawn: 'Drawn',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  declined: 'Declined',
}

function Group({ title, children }) {
  return (
    <div className="account-breakdown-group">
      <h4 className="account-breakdown-title">{title}</h4>
      {children}
    </div>
  )
}

/**
 * ActivityBreakdowns — by status / token / oracle (spec 020 US4).
 * Counts use text labels (not color alone) and reconcile to the tiles.
 */
function ActivityBreakdowns({ breakdowns }) {
  const b = breakdowns || { byStatus: [], byToken: [], byOracle: [] }
  const hasAny = b.byStatus.length || b.byToken.length || b.byOracle.length
  if (!hasAny) return null

  return (
    <section className="account-breakdowns" aria-label="Activity breakdowns">
      <Group title="By status">
        <ul className="account-breakdown-list">
          {b.byStatus.map((s) => (
            <li key={s.status}>
              <span>{STATUS_LABEL[s.status] || s.status}{s.active ? ' · live' : ''}</span>
              <span className="account-breakdown-count">{formatCompact(s.count)}</span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="By token">
        <ul className="account-breakdown-list">
          {b.byToken.map((t) => (
            <li key={t.tokenAddress}>
              <span>{t.symbol || 'Token'}</span>
              <span className="account-breakdown-count">{formatUsd(t.ownStakeUsd)}</span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="By resolution">
        <ul className="account-breakdown-list">
          {b.byOracle.map((o) => (
            <li key={o.resolutionType}>
              <span>{o.label}</span>
              <span className="account-breakdown-count">{formatCompact(o.count)}</span>
            </li>
          ))}
        </ul>
      </Group>
    </section>
  )
}

export default ActivityBreakdowns
