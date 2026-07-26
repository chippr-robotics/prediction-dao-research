// Spec 043 (US1) — a single vault's live on-chain state: address, network, owners, threshold, balance.
// Honest state: everything shown here is read from chain (owners/threshold/nonce) or is a local label.
// Spec 049 (US2/US3) — carries the Policy section (PolicyPanel). `onProposePolicy` is the spec 043
// proposal-queue submit (useVaultProposals.propose); when absent (view-only member, wrong network)
// the section is read-only.
// Spec 068 (US1) — the network row names the chain (not a bare id), and a vault on a chain other
// than the connected one renders READ-ONLY with a switch prompt: no state-changing action may be
// offered for a vault the wallet cannot act on (FR-004).

import PolicyPanel from './PolicyPanel'

export default function VaultDetail({
  vault,
  onForget,
  onOperateAs,
  isActiveIdentity,
  onProposePolicy,
  onSwitchNetwork,
}) {
  if (!vault) return null
  const chainLabel = vault.chainName ? `${vault.chainName} (${vault.chainId})` : String(vault.chainId)
  // Default to "on chain" when the flag is absent so legacy call sites keep their behavior.
  const onVaultChain = vault.onVaultChain !== false

  if (vault.reachable === false) {
    return (
      <div className="custody-vault-detail" role="region" aria-label="Vault detail">
        <h4>{vault.label || 'Vault'}</h4>
        <p className="custody-error" role="alert">
          Could not reach {chainLabel} to read this vault. Its details will appear when the network
          responds; nothing about the vault has changed.
        </p>
        {onForget && (
          <button type="button" onClick={() => onForget(vault.address, vault.chainId)}>
            Remove from list
          </button>
        )}
      </div>
    )
  }

  if (vault.isSafe === false) {
    return (
      <div className="custody-vault-detail" role="region" aria-label="Vault detail">
        <h4>{vault.label || 'Vault'}</h4>
        <p className="custody-error" role="alert">
          Could not read a Safe at <code>{vault.address}</code> on {chainLabel}.
        </p>
        {onForget && (
          <button type="button" onClick={() => onForget(vault.address, vault.chainId)}>
            Remove from list
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="custody-vault-detail" role="region" aria-label="Vault detail">
      <h4>{vault.label || 'Vault'}</h4>
      {!onVaultChain && (
        <div className="custody-warning" role="status">
          <p>
            This vault lives on {chainLabel}. You are connected to a different network, so it is
            shown read-only.
          </p>
          {onSwitchNetwork && (
            <button type="button" onClick={() => onSwitchNetwork(vault.chainId)}>
              Switch to {vault.chainName || `chain ${vault.chainId}`}
            </button>
          )}
        </div>
      )}
      <dl className="custody-vault-facts">
        <div>
          <dt>Address</dt>
          <dd>
            <code>{vault.address}</code>
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>
            {chainLabel}
            {vault.isTestnet ? ' · testnet' : ''}
          </dd>
        </div>
        <div>
          <dt>Threshold</dt>
          <dd>
            {vault.threshold} of {vault.owners?.length} owners
          </dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>{vault.owner ? 'Owner (can propose & approve)' : 'View-only'}</dd>
        </div>
        {vault.version && (
          <div>
            <dt>Safe version</dt>
            <dd>{vault.version}</dd>
          </div>
        )}
      </dl>
      <h5>Owners</h5>
      <ul className="custody-owner-addresses">
        {(vault.owners || []).map((o) => (
          <li key={o}>
            <code>{o}</code>
            {vault.ownerNames?.[o] && <span className="custody-owner-name"> · {vault.ownerNames[o]}</span>}
          </li>
        ))}
      </ul>
      {/* Policy changes are state-changing, so they are only proposable on the vault's own chain. */}
      <PolicyPanel vault={vault} onPropose={onVaultChain ? onProposePolicy : undefined} />
      <div className="custody-actions">
        {vault.owner && onOperateAs && onVaultChain && (
          <button type="button" onClick={() => onOperateAs(vault)} disabled={isActiveIdentity}>
            {isActiveIdentity ? 'Operating as this vault' : 'Operate as this vault'}
          </button>
        )}
        {onForget && (
          <button type="button" className="custody-link" onClick={() => onForget(vault.address, vault.chainId)}>
            Remove from list
          </button>
        )}
      </div>
    </div>
  )
}
