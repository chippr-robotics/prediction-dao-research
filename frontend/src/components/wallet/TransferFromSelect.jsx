import { useCallback, useEffect, useRef, useState } from 'react'
import BlockiesAvatar from '../ui/BlockiesAvatar'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * "From" account picker for the Transfer form — the connected personal wallet plus any custody vaults from
 * the Protect section (spec: "the from should be a dropdown with any accounts from the protect section").
 * Selecting a vault switches the active sending identity, which turns a send into a threshold-gated
 * proposal (useActiveAccount). Presentational only; identity state lives in the caller.
 */
export default function TransferFromSelect({ accounts = [], value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const selected = accounts.find((a) => a.id === value) || accounts[0] || null
  // A lone personal account with no vaults doesn't need a dropdown — render it as a static row.
  const collapsible = accounts.length > 1

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSelect = useCallback(
    (account) => {
      onChange?.(account)
      setOpen(false)
    },
    [onChange],
  )

  const row = (account) => (
    <>
      <BlockiesAvatar address={account.address} size={20} />
      <span className="pt-from-label">
        {account.label || short(account.address)}
        {account.kind === 'vault' && <span className="pt-from-tag">Vault</span>}
      </span>
      <span className="pt-from-addr">{short(account.address)}</span>
    </>
  )

  if (!selected) {
    return (
      <div className="pt-from">
        <span className="pt-from-addr">No account</span>
      </div>
    )
  }

  if (!collapsible) {
    return (
      <div className="pt-from" aria-label="Sending account">
        {row(selected)}
      </div>
    )
  }

  return (
    <div className="pt-select" ref={wrapRef}>
      <button
        type="button"
        className="pt-select-trigger pt-from-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sending account"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pt-from-current">{row(selected)}</span>
        <span className="pt-select-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="pt-select-list" role="listbox" aria-label="Sending accounts">
          {accounts.map((account) => (
            <li key={account.id} className="pt-select-li">
              <button
                type="button"
                role="option"
                aria-selected={account.id === selected.id}
                className={`pt-select-option pt-from-option ${account.id === selected.id ? 'active' : ''}`}
                onClick={() => handleSelect(account)}
              >
                {row(account)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
