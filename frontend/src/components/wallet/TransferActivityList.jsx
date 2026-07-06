import { useMemo } from 'react'
import { useTransferActivity } from '../../hooks/useTransferActivity'
import { getNetwork } from '../../config/networks'
import { TRANSFER_STATUS } from '../../lib/transfer/transferStore'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

const STATUS_LABEL = {
  [TRANSFER_STATUS.IN_PROCESS]: 'In process',
  [TRANSFER_STATUS.COMPLETE]: 'Complete',
  [TRANSFER_STATUS.FAILED]: 'Failed',
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}

function explorerTxUrl(chainId, txHash) {
  if (!txHash || String(txHash).length !== 66) return null // only real tx hashes (not userOp/intent ids)
  const base = getNetwork(chainId)?.explorer?.baseUrl
  return base ? `${base}/tx/${txHash}` : null
}

/**
 * Activity tab — the transfers this browser has sent, newest first, with truthful status. Mirrors the
 * reference design: status label, amount, from → to, date, and a deep link to the on-chain transaction
 * once it is known.
 */
export default function TransferActivityList() {
  const { transfers } = useTransferActivity()

  const rows = useMemo(() => transfers, [transfers])

  if (rows.length === 0) {
    return (
      <div className="pt-activity">
        <p className="pt-activity-empty">No transfers yet. Payments you send from this device will appear here.</p>
      </div>
    )
  }

  return (
    <ul className="pt-activity" aria-label="Transfer activity">
      {rows.map((r) => {
        const url = explorerTxUrl(r.chainId, r.txHash)
        return (
          <li key={r.id} className="pt-item">
            <span className={`pt-status-dot ${r.status}`} aria-hidden="true" />
            <div className="pt-item-body">
              <div className="pt-item-status">{STATUS_LABEL[r.status] || r.status}</div>
              <div className="pt-item-amount">{r.amount} {r.symbol}</div>
              <div className="pt-item-route">
                <span>{short(r.from)}</span>
                <span className="pt-item-arrow" aria-hidden="true">➡</span>
                <span>{short(r.to)}</span>
              </div>
              <div className="pt-item-date">
                {formatDate(r.createdAt)}
                {r.route === 'gasless' ? ' · gasless' : ''}
                {r.status === TRANSFER_STATUS.FAILED && r.error ? ` · ${r.error}` : ''}
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
