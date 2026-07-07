// Spec 043 (US1) — a single vault's live on-chain state: address, network, owners, threshold, balance.
// Honest state: everything shown here is read from chain (owners/threshold/nonce) or is a local label.

export default function VaultDetail({ vault, onForget, onOperateAs, isActiveIdentity }) {
  if (!vault) return null
  if (vault.isSafe === false) {
    return (
      <div className="custody-vault-detail" role="region" aria-label="Vault detail">
        <h4>{vault.label || 'Vault'}</h4>
        <p className="custody-error" role="alert">
          Could not read a Safe at <code>{vault.address}</code> on this network.
        </p>
        {onForget && (
          <button type="button" onClick={() => onForget(vault.address)}>
            Remove from list
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="custody-vault-detail" role="region" aria-label="Vault detail">
      <h4>{vault.label || 'Vault'}</h4>
      <dl className="custody-vault-facts">
        <div>
          <dt>Address</dt>
          <dd>
            <code>{vault.address}</code>
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{vault.chainId}</dd>
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
          </li>
        ))}
      </ul>
      <div className="custody-actions">
        {vault.owner && onOperateAs && (
          <button type="button" onClick={() => onOperateAs(vault)} disabled={isActiveIdentity}>
            {isActiveIdentity ? 'Operating as this vault' : 'Operate as this vault'}
          </button>
        )}
        {onForget && (
          <button type="button" className="custody-link" onClick={() => onForget(vault.address)}>
            Remove from list
          </button>
        )}
      </div>
    </div>
  )
}
