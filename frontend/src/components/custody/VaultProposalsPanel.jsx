// Spec 043 (US2) — container wiring useVaultProposals to the propose form + queue for the active vault.
// Handles the owner/view-only split (FR-016) and the network-mismatch prompt (edge case).

import { useState } from 'react'
import { useWallet } from '../../hooks'
import { useVaultProposals } from '../../hooks/useVaultProposals'
import ProposalQueue from './ProposalQueue'
import OwnersThresholdPanel from './OwnersThresholdPanel'

export default function VaultProposalsPanel({ vault, proposals }) {
  const { address, chainId, switchNetwork } = useWallet()
  // Spec 049 — the queue instance may be lifted (shared with the Policy section); the internal
  // hook is only live when no instance is passed, so nothing is fetched twice.
  const internal = useVaultProposals(proposals ? null : vault)
  const { queue, history, loading, error, partial, propose, approve, execute, cancel } = proposals || internal
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  if (!vault?.isSafe) return null

  // Acting on a vault requires being on its network (approvals/execution are chain-scoped).
  const vaultChainLabel = vault.chainName ? `${vault.chainName} (${vault.chainId})` : `network ${vault.chainId}`
  if (Number(chainId) !== Number(vault.chainId)) {
    return (
      <div className="custody-proposals" role="region" aria-label="Vault proposals">
        <p className="custody-error" role="alert">
          This vault is on {vaultChainLabel}. Switch networks to view and act on its transactions.
        </p>
        {switchNetwork && (
          <button type="button" onClick={() => { Promise.resolve(switchNetwork(vault.chainId)).catch(() => {}) }}>
            Switch to {vault.chainName || `network ${vault.chainId}`}
          </button>
        )}
      </div>
    )
  }

  const run = (fn) => async (...args) => {
    setActionError(null)
    setBusy(true)
    try {
      // Spec 068 (FR-004) — re-check at SUBMIT time, not just at render: the wallet may have
      // switched networks while this panel was open, and a custody action must never be submitted
      // to a chain other than the vault's own.
      if (Number(chainId) !== Number(vault.chainId)) {
        throw new Error(
          `This vault is on ${vaultChainLabel} but your wallet is on network ${chainId}. Switch networks and try again.`,
        )
      }
      await fn(...args)
    } catch (e) {
      setActionError(e?.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="custody-vault-proposals">
      {/* No vault-only "New transfer" form. Spending from a vault is a normal transfer made while
          the vault is your acting account — pick it in the account menu and use Home or Transfer.
          A second, custody-shaped send form here would be a parallel path to maintain, and would
          quietly diverge from the one members actually use (asset picker, address book, screening,
          fee disclosure). Governance below stays: changing owners has no equivalent elsewhere. */}
      {vault.owner && (
        <p className="custody-hint" role="note">
          To move funds, pick this vault in the account menu next to your avatar and use Transfer as
          usual. Anything you submit lands here for the other owners to approve.
        </p>
      )}

      <OwnersThresholdPanel vault={vault} onPropose={run(propose)} busy={busy} />

      {loading && <p className="custody-hint">Loading transactions…</p>}
      {/* A vault's history can span millions of blocks and the RPC caps each read, so it arrives in
          passes. Until the last one lands this list is real but not yet known to be all of it —
          which the member has to be told, because an empty queue here would otherwise read as
          "nothing needs you". */}
      {!loading && partial && (
        <p className="custody-hint" role="status">
          Still reading this vault’s history — anything older may not be listed yet.
        </p>
      )}
      {(error || actionError) && (
        <p className="custody-error" role="alert">
          {error || actionError}
        </p>
      )}

      <ProposalQueue
        queue={queue}
        history={history}
        isOwner={!!vault.owner}
        chainId={vault.chainId}
        vaultAddress={vault.address}
        connectedAddress={address}
        onApprove={run(approve)}
        onExecute={run(execute)}
        onCancel={run(cancel)}
        busy={busy}
      />
    </div>
  )
}
