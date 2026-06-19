import { getNetwork } from '../../config/networks'
import { formatUsd, formatRelativeTime } from '../../lib/account/format'
import EmptyState from './EmptyState'
import './RecentActivityFeed.css'

const DIRECTION_META = {
  deposit: { icon: '↑', label: 'Deposit', tone: 'out' },
  payout: { icon: '↓', label: 'Payout', tone: 'in' },
  refund: { icon: '↩', label: 'Refund', tone: 'in' },
}

function explorerTxUrl(chainId, txHash) {
  const net = getNetwork(Number(chainId))
  const base = net?.explorer?.baseUrl
  if (!base || !txHash) return null
  return `${base.replace(/\/$/, '')}/tx/${txHash}`
}

/**
 * RecentActivityFeed — newest-first deposits/payouts/refunds (spec 020 US4).
 * Shows direction (icon + text), amount + token, USD value, relative time, and
 * a link to the transaction on the active network's explorer.
 */
function RecentActivityFeed({ activity = [], chainId }) {
  if (!activity.length) {
    return (
      <section className="account-feed" aria-label="Recent activity">
        <h3 className="account-feed-title">Recent activity</h3>
        <EmptyState compact title="No recent activity" message="Your deposits, payouts, and refunds will appear here." />
      </section>
    )
  }

  return (
    <section className="account-feed" aria-label="Recent activity">
      <h3 className="account-feed-title">Recent activity</h3>
      <ul className="account-feed-list">
        {activity.map((e) => {
          const meta = DIRECTION_META[e.direction] || { icon: '•', label: e.direction, tone: 'out' }
          const url = explorerTxUrl(chainId, e.txHash)
          return (
            <li className="account-feed-row" key={e.id}>
              <span className={`account-feed-icon tone-${meta.tone}`} aria-hidden="true">{meta.icon}</span>
              <span className="account-feed-main">
                <span className="account-feed-label">{meta.label}</span>
                <span className="account-feed-amount">{formatUsd(e.usdValue)} <span className="account-feed-token">{e.symbol}</span></span>
              </span>
              <span className="account-feed-meta">
                <time>{formatRelativeTime(e.timestamp)}</time>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="account-feed-link">
                    View tx
                  </a>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default RecentActivityFeed
