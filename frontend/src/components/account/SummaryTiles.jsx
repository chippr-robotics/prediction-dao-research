import { formatSignedUsd, formatUsd, formatPercent, formatCompact, signGlyph } from '../../lib/account/format'
import { useCountUp } from './useCountUp'
import './SummaryTiles.css'

/** A single animated numeric value. */
function AnimatedValue({ value, format }) {
  const n = useCountUp(Number(value) || 0)
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
          {isEmpty ? formatUsd(0) : <AnimatedValueText value={pnl} format={formatSignedUsd} />}
        </span>
      ),
      sub: isEmpty ? 'no activity yet' : `${formatUsd(s.atStakeUsd || 0)} at stake`,
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
      render: () => <AnimatedValue value={s.totalWageredUsd} format={formatUsd} />,
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
      render: () => <AnimatedValue value={s.walletBalanceUsd} format={formatUsd} />,
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

/** Animated value that formats with a signed formatter. */
function AnimatedValueText({ value, format }) {
  const n = useCountUp(Number(value) || 0)
  return <span>{format(n)}</span>
}

export default SummaryTiles
