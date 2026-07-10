import { formatSignedUsd, formatUsd, formatPercent, formatCompact, signGlyph } from '../../lib/account/format'
import { useCountUp } from './useCountUp'
import SensitiveValue from '../common/SensitiveValue'
import './SummaryTiles.css'

/**
 * A single animated numeric value. Monetary tiles pass `sensitive` so the value
 * is masked (placeholder, no animation shown) when tilt-to-hide is active
 * (spec 046); non-monetary tiles (win rate, active count) are never masked.
 */
function AnimatedValue({ value, format, sensitive = false }) {
  const n = useCountUp(Number(value) || 0)
  if (sensitive) {
    return <SensitiveValue className="account-tile-value">{format(n)}</SensitiveValue>
  }
  return <span className="account-tile-value">{format(n)}</span>
}

/**
 * SummaryTiles — the headline performance tiles (spec 020 US1).
 * Net P&L, Win Rate, Total Wagered, Active Wagers, Wallet Balance.
 */
function SummaryTiles({ summary, isEmpty }) {
  const s = summary || {}
  const pnl = Number(s.netPnlUsd) || 0
  const pnlTone = isEmpty ? 'neutral' : pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'neutral'

  const tiles = [
    {
      key: 'pnl',
      label: 'Net P&L',
      tone: pnlTone,
      render: () => (
        <span className={`account-tile-value tone-${pnlTone}`}>
          <span className="account-tile-cue" aria-hidden="true">{isEmpty ? '' : signGlyph(pnl)} </span>
          {isEmpty
            ? <SensitiveValue>{formatUsd(0)}</SensitiveValue>
            : <AnimatedValueText value={pnl} format={formatSignedUsd} />}
        </span>
      ),
      sub: isEmpty
        ? 'no activity yet'
        : <><SensitiveValue>{formatUsd(s.atStakeUsd || 0)}</SensitiveValue> at stake</>,
    },
    {
      key: 'winrate',
      label: 'Win Rate',
      render: () => <span className="account-tile-value">{formatPercent(s.winRate)}</span>,
      sub: isEmpty ? 'no settled wagers' : `${s.wins || 0}W · ${s.losses || 0}L`,
    },
    {
      key: 'wagered',
      label: 'Total Wagered',
      render: () => <AnimatedValue value={s.totalWageredUsd} format={formatUsd} sensitive />,
      sub: 'your stake',
    },
    {
      key: 'active',
      label: 'Active Wagers',
      render: () => <AnimatedValue value={s.activeWagers} format={formatCompact} />,
      sub: 'live now',
    },
    {
      key: 'balance',
      label: 'Wallet Balance',
      render: () => <AnimatedValue value={s.walletBalanceUsd} format={formatUsd} sensitive />,
      sub: 'available',
    },
  ]

  return (
    <div className="account-tiles" role="list" aria-label="Account summary">
      {tiles.map((t) => (
        <div className="account-tile" role="listitem" key={t.key}>
          <span className="account-tile-label">{t.label}</span>
          {t.render()}
          <span className="account-tile-sub">{t.sub}</span>
        </div>
      ))}
    </div>
  )
}

/** Animated value that formats with a signed formatter (Net P&L — always monetary). */
function AnimatedValueText({ value, format }) {
  const n = useCountUp(Number(value) || 0)
  return <SensitiveValue>{format(n)}</SensitiveValue>
}

export default SummaryTiles
