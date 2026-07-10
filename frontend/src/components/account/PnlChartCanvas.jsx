import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatSignedUsd } from '../../lib/account/format'
import { usePrivacy } from '../../hooks/usePrivacy'

const MASK = '••'

/**
 * PnlChartCanvas — the Recharts internals, isolated so it can be lazy-loaded
 * (spec 020 R1). Renders the cumulative realized-P&L area, themed via the
 * --chart-series / --semantic CSS tokens.
 */
function readVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v?.trim() || fallback
}

function ChartTooltip({ active, payload }) {
  const { hidden } = usePrivacy()
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const date = new Date(p.timestamp)
  return (
    <div className="account-chart-tooltip" role="status">
      <div className="account-chart-tooltip-date">{date.toLocaleDateString()}</div>
      <div className="account-chart-tooltip-value">
        {hidden ? MASK : formatSignedUsd(p.cumulativeUsd)}
      </div>
    </div>
  )
}

function PnlChartCanvas({ points }) {
  const { hidden } = usePrivacy()
  const end = points.length ? points[points.length - 1].cumulativeUsd : 0
  const positive = end >= 0
  const stroke = positive
    ? readVar('--semantic-win', '#2ECC71')
    : readVar('--semantic-loss', '#E5533D')
  const seriesFill = readVar('--chart-series-a', '#36B37E')

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seriesFill} stopOpacity={0.35} />
            <stop offset="100%" stopColor={seriesFill} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 11, fill: readVar('--text-muted', '#8A959E') }}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={(v) => (hidden ? MASK : formatSignedUsd(v))}
          tick={{ fontSize: 11, fill: readVar('--text-muted', '#8A959E') }}
          width={56}
        />
        <ReferenceLine y={0} stroke={readVar('--border-color', '#E3E7EB')} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="cumulativeUsd"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#pnlFill)"
          isAnimationActive={false}
          dot={points.length < 12}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default PnlChartCanvas
