// Spec 043 (US1) — load an existing vault by address. Distinguishes "not a contract", "not a Safe", and a
// real Safe (owned vs view-only is derived after load). Delegates the chain read to onLoad.

import { useState } from 'react'

export default function LoadVaultForm({ onLoad, onDone }) {
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const handleLoad = async () => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const vault = await onLoad(address.trim(), label)
      setResult(vault)
      onDone?.(vault)
    } catch (e) {
      setError(e?.message || 'Could not load that address')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="custody-load" onSubmit={(e) => e.preventDefault()} aria-label="Load a vault by address">
      <div className="custody-field">
        <label htmlFor="load-address">Vault address</label>
        <input
          id="load-address"
          type="text"
          placeholder="0x…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="custody-field">
        <label htmlFor="load-label">Label (private, on this device)</label>
        <input id="load-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>

      {error && (
        <p className="custody-error" role="alert">
          {error}
        </p>
      )}
      {result?.isSafe && (
        <p className="custody-predicted" role="status">
          Loaded {result.owner ? 'a vault you co-own' : 'a view-only vault'} with {result.owners.length}{' '}
          owners and a {result.threshold}-of-{result.owners.length} threshold.
        </p>
      )}

      <div className="custody-actions">
        <button type="button" onClick={handleLoad} disabled={!address.trim() || busy}>
          {busy ? 'Loading…' : 'Load vault'}
        </button>
      </div>
    </form>
  )
}
