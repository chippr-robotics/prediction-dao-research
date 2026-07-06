// Spec 043 (US1) — the member's vaults on the active network, with selection (FR-007).

export default function VaultList({ vaults, activeAddress, onSelect }) {
  if (!vaults?.length) {
    return (
      <p className="custody-hint" role="status">
        No vaults yet on this network.
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
              {v.isSafe && (
                <span className="custody-vault-meta">
                  {v.threshold}-of-{v.owners.length}
                  {v.owner ? ' · owner' : ' · view-only'}
                </span>
              )}
              {v.isSafe === false && <span className="custody-vault-meta custody-error">unreadable</span>}
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
