/**
 * AdminBarList (spec 093) — labelled horizontal distribution bars for admin
 * dashboards, promoted from MembershipTreasuryOverview's revenue bars.
 *
 * Every value is PRINTED as text beside its bar — the bar is emphasis, never
 * the only encoding. An empty item list renders an explicit empty state, and
 * a `partial` annotation names what is missing (a total computed while a
 * network was unreadable must say so — never render as complete).
 */
import './adminCharts.css'

export default function AdminBarList({
  items,
  ariaLabel,
  emptyLabel = 'No recorded activity yet.',
  partial,
}) {
  if (!items || items.length === 0) {
    return (
      <p className="admin-chart-empty" role="status">
        {emptyLabel}
      </p>
    )
  }

  const max = Math.max(...items.map((i) => (Number.isFinite(i.value) ? i.value : 0)), 0) || 1

  return (
    <div className="admin-bars-wrap">
      <div className="admin-bars" role="img" aria-label={ariaLabel}>
        {items.map((item) => {
          const value = Number.isFinite(item.value) ? item.value : 0
          const pct = Math.max(0, Math.min(100, (value / max) * 100))
          return (
            <div className="admin-bar-row" key={item.label}>
              <span className="admin-bar-label">{item.label}</span>
              <span className="admin-bar-track">
                <span className="admin-bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="admin-bar-value">{item.display ?? String(item.value)}</span>
            </div>
          )
        })}
      </div>
      {partial?.missing?.length > 0 && (
        <p className="admin-chart-partial" role="note">
          Partial — {partial.missing.join(', ')} could not be read, so nothing here includes
          {partial.missing.length === 1 ? ' it' : ' them'}.
        </p>
      )}
    </div>
  )
}
