import { useActivityLedger } from '../../hooks/useActivityLedger'
import { getNetwork } from '../../config/networks'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

const STATUS_LABEL = {
  pending: 'In process',
  settled: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

// Legacy CSS hooks keyed by the old transferStore statuses.
const STATUS_CLASS = {
  pending: 'in_process',
  settled: 'complete',
  failed: 'failed',
  cancelled: 'failed',
}

function formatDate(ts) {
  if (ts == null) return null
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return null
  }
}

function explorerTxUrl(chainId, txHash) {
  if (!txHash || String(txHash).length !== 66) return null // only real tx hashes (not userOp/intent ids)
  const base = getNetwork(chainId)?.explorer?.baseUrl
  return base ? `${base}/tx/${txHash}` : null
}

/**
 * Activity tab — transfer entries from the unified activity ledger
 * (spec 051), newest first, with truthful status. Reading the ledger (instead
 * of the raw device log) keeps this tab and the Account tab structurally
 * consistent (FR-002): both render the same entries.
 */
export default function TransferActivityList() {
  const { entries } = useActivityLedger({ filter: { classes: ['transfer'] } })

  if (entries.length === 0) {
    return (
      <div className="pt-activity">
        <p className="pt-activity-empty">No transfers yet. Payments you send from this device will appear here.</p>
      </div>
    )
  }

  return (
    <ul className="pt-activity" aria-label="Transfer activity">
      {entries.map((e) => {
        const url = explorerTxUrl(e.chainId, e.txHash)
        const date = formatDate(e.timestamp)
        const statusClass = STATUS_CLASS[e.status] || e.status
        return (
          <li key={e.entryId} className="pt-item">
            <span className={`pt-status-dot ${statusClass}`} aria-hidden="true" />
            <div className="pt-item-body">
              <div className="pt-item-status">{STATUS_LABEL[e.status] || e.status}</div>
              <div className="pt-item-amount">{e.amount} {e.tokenSymbol}</div>
              <div className="pt-item-route">
                <span>{short(e.account)}</span>
                <span className="pt-item-arrow" aria-hidden="true">➡</span>
                <span>{short(e.counterparty)}</span>
              </div>
              <div className="pt-item-date">
                {date ?? 'date unavailable'}
                {e.refs?.route === 'gasless' ? ' · gasless' : ''}
                {e.status === 'failed' && e.failureReason ? ` · ${e.failureReason}` : ''}
              </div>
            </div>
            {url && (
              <a className="pt-item-link" href={url} target="_blank" rel="noopener noreferrer" aria-label="View on block explorer">›</a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
