// Spec 043 (US1) — the member's vaults, with selection (FR-007).
// Spec 049 (US2) — each row carries a PolicyBadge when the vault is policy-governed (or has a
// foreign guard); the status/summary are enriched by useCustodyVaults and absent on failure.
// Spec 068 (US1) — the list spans EVERY chain the member has vaults on, so each row states its
// chain (FR-002) and an unreachable chain degrades to an honest per-row notice rather than
// disappearing or blanking the list.

import PolicyBadge from './PolicyBadge'

export default function VaultList({ vaults, activeAddress, onSelect }) {
  if (!vaults?.length) {
    return (
      <p className="custody-hint" role="status">
        No vaults yet.
      </p>
    )
  }
  return (
    <ul className="custody-vault-list" aria-label="Your vaults">
      {vaults.map((v) => {
        const selected = v.address === activeAddress
        const label = v.label || 'Unnamed vault'
        return (
          <li key={`${v.chainId}:${v.address}`}>
            <button
              type="button"
              className={`custody-vault-item${selected ? ' is-selected' : ''}`}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(v.address)}
            >
              <span className="custody-vault-label">{label}</span>
              <span className="custody-vault-addr">{shorten(v.address)}</span>
              {/* Chain identity is never optional on a custody surface (FR-002): approving on the
                  wrong network is the mistake this whole feature exists to prevent. */}
              <span className={`custody-chain-badge${v.isTestnet ? ' is-testnet' : ''}`}>
                {v.chainName || `Chain ${v.chainId}`}
                {v.isTestnet ? ' · testnet' : ''}
              </span>
              {v.isSafe && (
                <span className="custody-vault-meta">
                  {v.threshold}-of-{v.owners.length}
                  {v.owner ? ' · owner' : ' · view-only'}
                </span>
              )}
              {v.reachable === false && (
                <span className="custody-vault-meta custody-error">
                  {v.chainName || `chain ${v.chainId}`} unreachable
                </span>
              )}
              {v.reachable !== false && v.isSafe === false && (
                <span className="custody-vault-meta custody-error">unreadable</span>
              )}
              <PolicyBadge status={v.policyStatus} summary={v.policySummary} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function shorten(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}
