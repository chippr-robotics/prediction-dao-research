import { useMemo, useState } from 'react'
import { getNetwork } from '../../config/networks'
import { formatUsd, formatRelativeTime } from '../../lib/account/format'
import SensitiveValue from '../common/SensitiveValue'
import EmptyState from './EmptyState'
import './RecentActivityFeed.css'

/** kind → icon/label/tone for every ledger activity class (spec 051 US1). */
const KIND_META = {
  deposit: { icon: '↑', label: 'Deposit', tone: 'out' },
  payout: { icon: '↓', label: 'Payout', tone: 'in' },
  refund: { icon: '↩', label: 'Refund', tone: 'in' },
  send: { icon: '➡', label: 'Transfer', tone: 'out' },
  vault_deposit: { icon: '🌱', label: 'Earn deposit', tone: 'out' },
  vault_withdraw: { icon: '🌾', label: 'Earn withdrawal', tone: 'in' },
  reward_claim: { icon: '✦', label: 'Rewards claimed', tone: 'in' },
  pool_join: { icon: '⛳', label: 'Pool join', tone: 'out' },
  pool_claim: { icon: '🏆', label: 'Pool claim', tone: 'in' },
  pool_refund: { icon: '↩', label: 'Pool refund', tone: 'in' },
  voucher_purchase: { icon: '🎟', label: 'Voucher purchase', tone: 'out' },
  voucher_redeem: { icon: '🎟', label: 'Voucher redeemed', tone: 'in' },
}

const CLASS_FILTERS = [
  { key: null, label: 'All activity' },
  { key: 'wager', label: 'Wagers' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'earn', label: 'Earn' },
  { key: 'pool', label: 'Pools' },
  { key: 'membership', label: 'Membership' },
]

function explorerTxUrl(chainId, txHash) {
  // Only real 66-char tx hashes are explorer-linkable (not userOp/intent ids).
  if (!txHash || String(txHash).length !== 66) return null
  const net = getNetwork(Number(chainId))
  const base = net?.explorer?.baseUrl
  if (!base) return null
  return `${base.replace(/\/$/, '')}/tx/${txHash}`
}

function amountLine(e) {
  if (e.valueUsd != null) return formatUsd(e.valueUsd)
  if (e.amount != null) return String(e.amount)
  return null
}

/**
 * RecentActivityFeed — the Account tab's canonical activity record
 * (spec 051 US1): every ledger class, newest first, with class filters,
 * honest failed states, and an explicit "date unavailable" state instead of
 * a fabricated relative time (FR-006).
 */
function RecentActivityFeed({ entries = [], chainId, staleClasses = [], prunedBefore = null }) {
  const [classFilter, setClassFilter] = useState(null)

  const rows = useMemo(
    () => (classFilter ? entries.filter((e) => e.class === classFilter) : entries),
    [entries, classFilter],
  )

  const filterChips = (
    <div className="account-feed-filters" role="group" aria-label="Filter activity by type">
      {CLASS_FILTERS.map((f) => (
        <button
          key={f.label}
          type="button"
          className={`account-feed-filter${classFilter === f.key ? ' active' : ''}`}
          aria-pressed={classFilter === f.key}
          onClick={() => setClassFilter(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )

  return (
    <section className="account-feed" aria-label="Recent activity">
      <h3 className="account-feed-title">Recent activity</h3>
      {filterChips}
      {staleClasses.length > 0 && (
        <p className="account-feed-stale" role="status">
          Some activity may be out of date: {staleClasses.join(', ')} could not be refreshed.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No recent activity"
          message="Your wagers, transfers, earn, pool, and membership activity will appear here."
        />
      ) : (
        <ul className="account-feed-list">
          {rows.map((e) => {
            const meta = KIND_META[e.kind] || { icon: '•', label: e.kind, tone: 'out' }
            const url = explorerTxUrl(e.chainId ?? chainId, e.txHash)
            const relative = e.timestamp != null ? formatRelativeTime(e.timestamp) : null
            const amount = amountLine(e)
            const failed = e.status === 'failed'
            return (
              <li className={`account-feed-row${failed ? ' failed' : ''}`} key={e.entryId}>
                <span className={`account-feed-icon tone-${failed ? 'failed' : meta.tone}`} aria-hidden="true">
                  {failed ? '✕' : meta.icon}
                </span>
                <span className="account-feed-main">
                  <span className="account-feed-label">
                    {meta.label}
                    {failed && <span className="account-feed-badge-failed"> Failed</span>}
                    {e.valuationStatus === 'unvalued' && (
                      <span className="account-feed-badge-unvalued" title="No USD value could be determined for this entry"> · unvalued</span>
                    )}
                  </span>
                  {amount != null && (
                    <span className="account-feed-amount">
                      <SensitiveValue>{amount}</SensitiveValue>{' '}
                      <span className="account-feed-token">{e.tokenSymbol || ''}</span>
                    </span>
                  )}
                  {failed && e.failureReason && (
                    <span className="account-feed-reason">{e.failureReason}</span>
                  )}
                </span>
                <span className="account-feed-meta">
                  {relative != null ? (
                    <time>{relative}</time>
                  ) : (
                    <span className="account-feed-nodate">date unavailable</span>
                  )}
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
      )}
      {prunedBefore != null && (
        <p className="account-feed-pruned">
          Entries before {new Date(prunedBefore).toLocaleDateString()} were pruned from device history; on-chain
          activity remains recoverable.
        </p>
      )}
    </section>
  )
}

export default RecentActivityFeed
