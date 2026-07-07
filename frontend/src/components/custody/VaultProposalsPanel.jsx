// Spec 043 (US2) — container wiring useVaultProposals to the propose form + queue for the active vault.
// Handles the owner/view-only split (FR-016) and the network-mismatch prompt (edge case).

import { useState } from 'react'
import { useWallet } from '../../hooks'
import { useVaultProposals } from '../../hooks/useVaultProposals'
import ProposeTransactionForm from './ProposeTransactionForm'
import ProposalQueue from './ProposalQueue'
import OwnersThresholdPanel from './OwnersThresholdPanel'

export default function VaultProposalsPanel({ vault }) {
  const { address, chainId, switchNetwork } = useWallet()
  const { queue, history, loading, error, propose, approve, execute, cancel } = useVaultProposals(vault)
  const [showPropose, setShowPropose] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  if (!vault?.isSafe) return null

  // Acting on a vault requires being on its network (approvals/execution are chain-scoped).
  if (Number(chainId) !== Number(vault.chainId)) {
    return (
      <div className="custody-proposals" role="region" aria-label="Vault proposals">
        <p className="custody-error" role="alert">
          This vault is on network {vault.chainId}. Switch networks to view and act on its transactions.
        </p>
        {switchNetwork && (
          <button type="button" onClick={() => switchNetwork(vault.chainId)}>
            Switch to network {vault.chainId}
          </button>
        )}
      </div>
    )
  }

  const run = (fn) => async (...args) => {
    setActionError(null)
    setBusy(true)
    try {
      await fn(...args)
    } catch (e) {
      setActionError(e?.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="custody-vault-proposals">
      {vault.owner && (
        <div className="custody-actions">
          <button type="button" onClick={() => setShowPropose((s) => !s)}>
            {showPropose ? 'Close' : 'New transfer'}
          </button>
        </div>
      )}
      {vault.owner && showPropose && (
        <ProposeTransactionForm onPropose={run(propose)} onDone={() => setShowPropose(false)} />
      )}

      <OwnersThresholdPanel vault={vault} onPropose={run(propose)} busy={busy} />

      {loading && <p className="custody-hint">Loading transactions…</p>}
      {(error || actionError) && (
        <p className="custody-error" role="alert">
          {error || actionError}
        </p>
      )}

      <ProposalQueue
        queue={queue}
        history={history}
        isOwner={!!vault.owner}
        connectedAddress={address}
        onApprove={run(approve)}
        onExecute={run(execute)}
        onCancel={run(cancel)}
        busy={busy}
      />
    </div>
  )
}
