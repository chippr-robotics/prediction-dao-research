// Spec 043 (US2) — the vault's pending queue + history with approve/execute actions. Non-owners see state
// but no action buttons (FR-016). Blocked states are surfaced honestly (approvals remaining; not-ready).

import { STATUS } from '../../lib/custody/proposalStatus'
import { approvalsRemaining } from '../../lib/custody/proposalStatus'

function shortHash(h) {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : ''
}

function ProposalRow({ p, isOwner, hasApproved, onApprove, onExecute, onCancel, busy }) {
  const remaining = approvalsRemaining(p.approvals, p.threshold)
  return (
    <li className="custody-proposal-row">
      <div className="custody-proposal-main">
        <span className={`custody-status custody-status--${p.status}`}>{p.status}</span>
        <span className="custody-proposal-meta">
          {p.approvals}/{p.threshold} approvals
          {p.status === STATUS.PENDING && remaining > 0 ? ` · ${remaining} more needed` : ''}
        </span>
        <code className="custody-proposal-hash">{shortHash(p.safeTxHash)}</code>
      </div>
      <div className="custody-proposal-facts">
        <span>to <code>{p.to}</code></span>
        <span>nonce {String(p.nonce)}</span>
      </div>
      {isOwner && (
        <div className="custody-actions">
          {p.status === STATUS.PENDING && (
            <button type="button" onClick={() => onApprove(p.safeTxHash)} disabled={busy || hasApproved}>
              {hasApproved ? 'Approved' : 'Approve'}
            </button>
          )}
          {p.status === STATUS.READY && (
            <button type="button" onClick={() => onExecute(p)} disabled={busy}>
              Execute
            </button>
          )}
          {(p.status === STATUS.PENDING || p.status === STATUS.READY) && onCancel && (
            <button type="button" className="custody-link" onClick={() => onCancel(p.safeTxHash)} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function ProposalQueue({ queue, history, isOwner, connectedAddress, onApprove, onExecute, onCancel, busy }) {
  const approvedByMe = (p) =>
    !!connectedAddress && (p.approvers || []).some((a) => a.toLowerCase() === connectedAddress.toLowerCase())

  return (
    <div className="custody-proposals" role="region" aria-label="Vault proposals">
      <h5>Pending queue</h5>
      {queue.length === 0 ? (
        <p className="custody-hint" role="status">
          No pending transactions.
        </p>
      ) : (
        <ul className="custody-proposal-list">
          {queue.map((p) => (
            <ProposalRow
              key={p.safeTxHash}
              p={p}
              isOwner={isOwner}
              hasApproved={approvedByMe(p)}
              onApprove={onApprove}
              onExecute={onExecute}
              onCancel={onCancel}
              busy={busy}
            />
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <>
          <h5>History</h5>
          <ul className="custody-proposal-list custody-proposal-list--history">
            {history.map((p) => (
              <li key={p.safeTxHash} className="custody-proposal-row">
                <span className={`custody-status custody-status--${p.status}`}>{p.status}</span>
                <code className="custody-proposal-hash">{shortHash(p.safeTxHash)}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
