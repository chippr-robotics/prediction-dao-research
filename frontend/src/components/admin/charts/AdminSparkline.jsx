/**
 * AdminSparkline (spec 093) — the shared single-series sparkline for admin
 * dashboards, promoted from MembershipTreasuryOverview's RevenueSparkline.
 *
 * One hue (brand), thin line + soft area fill, latest value direct-labelled
 * in the caption. Honest by construction: fewer than two points renders an
 * explicit "no recorded activity" state, never an invented flat line. The
 * x-axis is whatever clock the caller's data carries (block numbers, event
 * index) — the caption should say which; this component never claims
 * calendar time it does not have.
 */
import { useMemo } from 'react'
import './adminCharts.css'

const W = 320
const H = 64
const PAD = 4

export default function AdminSparkline({
  points,
  ariaLabel,
  caption,
  latestLabel,
  hint,
  emptyLabel = 'No recorded activity yet.',
}) {
  const geometry = useMemo(() => {
    if (!points || points.length < 2) return null
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    const spanX = maxX - minX || 1
    const spanY = maxY || 1
    const sx = (x) => PAD + ((x - minX) / spanX) * (W - PAD * 2)
    const sy = (y) => H - PAD - (y / spanY) * (H - PAD * 2)
    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
      .join(' ')
    const area = `${line} L${sx(maxX).toFixed(1)},${(H - PAD).toFixed(1)} L${sx(minX).toFixed(1)},${(H - PAD).toFixed(1)} Z`
    const last = points[points.length - 1]
    return { line, area, lastX: sx(last.x), lastY: sy(last.y) }
  }, [points])

  if (!geometry) {
    return (
      <p className="admin-chart-empty" role="status">
        {emptyLabel}
      </p>
    )
  }

  return (
    <figure className="admin-spark">
      {/* The svg is the image and carries the accessible name; the figcaption
          repeats the latest value as text for everyone. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
        className="admin-spark__svg"
      >
        <path d={geometry.area} className="admin-spark__area" />
        <path d={geometry.line} className="admin-spark__line" />
        <circle cx={geometry.lastX} cy={geometry.lastY} r="3" className="admin-spark__dot" />
      </svg>
      <figcaption className="admin-spark__caption">
        {caption} {latestLabel != null && <strong>{latestLabel}</strong>}
        {hint && <span className="admin-spark__hint"> ({hint})</span>}
      </figcaption>
    </figure>
  )
}
