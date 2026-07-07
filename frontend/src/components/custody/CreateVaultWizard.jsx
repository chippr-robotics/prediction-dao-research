// Spec 043 (US1) — create a new Safe vault: choose owners + threshold, preview the deterministic address, and
// deploy. Validation mirrors validateVaultConfig (FR-005). Presentational; all chain work is delegated to the
// injected callbacks so the component is unit-testable.

import { useState, useMemo, useEffect } from 'react'
import { validateVaultConfig } from '../../lib/custody/safeVault'

export default function CreateVaultWizard({ connectedAddress, onCreate, onPreview, onDone }) {
  const [owners, setOwners] = useState([connectedAddress || ''])
  const [threshold, setThreshold] = useState(1)
  const [label, setLabel] = useState('')
  const [predicted, setPredicted] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const validationError = useMemo(() => {
    const cleaned = owners.map((o) => o.trim()).filter(Boolean)
    try {
      validateVaultConfig(cleaned, threshold)
      return null
    } catch (e) {
      return e.message
    }
  }, [owners, threshold])

  // A previewed address is only valid for the exact owners+threshold it was computed from; clear it whenever
  // the config changes so the user never sees a stale address that won't match what "Create vault" deploys.
  useEffect(() => {
    setPredicted(null)
  }, [owners, threshold])

  const cleanedOwners = () => owners.map((o) => o.trim()).filter(Boolean)
  const nextSaltNonce = () => Date.now()

  const updateOwner = (i, val) => setOwners((prev) => prev.map((o, idx) => (idx === i ? val : o)))
  const addOwner = () => setOwners((prev) => [...prev, ''])
  const removeOwner = (i) => setOwners((prev) => prev.filter((_, idx) => idx !== i))

  const handlePreview = async () => {
    setError(null)
    setBusy(true)
    try {
      const addr = await onPreview({ owners: cleanedOwners(), threshold, saltNonce: previewNonce })
      setPredicted(addr)
    } catch (e) {
      setError(e?.message || 'Could not preview the vault address')
    } finally {
      setBusy(false)
    }
  }

  // A stable salt for this wizard instance so preview and create resolve to the same address.
  const [previewNonce] = useState(() => nextSaltNonce())

  const handleCreate = async () => {
    setError(null)
    setBusy(true)
    try {
      await onCreate({ owners: cleanedOwners(), threshold, saltNonce: previewNonce, label })
      onDone?.()
    } catch (e) {
      setError(e?.message || 'Vault creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="custody-create" onSubmit={(e) => e.preventDefault()} aria-label="Create a vault">
      <fieldset>
        <legend>Owners</legend>
        {owners.map((owner, i) => (
          <div className="custody-owner-row" key={i}>
            <label className="sr-only" htmlFor={`owner-${i}`}>{`Owner ${i + 1} address`}</label>
            <input
              id={`owner-${i}`}
              type="text"
              inputMode="text"
              placeholder="0x…"
              value={owner}
              onChange={(e) => updateOwner(i, e.target.value)}
            />
            {owners.length > 1 && (
              <button type="button" onClick={() => removeOwner(i)} aria-label={`Remove owner ${i + 1}`}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addOwner}>
          Add owner
        </button>
      </fieldset>

      <div className="custody-field">
        <label htmlFor="vault-threshold">Approvals required (threshold)</label>
        <input
          id="vault-threshold"
          type="number"
          min={1}
          max={Math.max(1, cleanedOwners().length)}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
      </div>

      <div className="custody-field">
        <label htmlFor="vault-label">Label (private, on this device)</label>
        <input id="vault-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>

      {validationError && (
        <p className="custody-error" role="alert">
          {validationError}
        </p>
      )}
      {error && (
        <p className="custody-error" role="alert">
          {error}
        </p>
      )}
      {predicted && (
        <p className="custody-predicted" role="status">
          Vault address will be <code>{predicted}</code>
        </p>
      )}

      <div className="custody-actions">
        <button type="button" onClick={handlePreview} disabled={!!validationError || busy}>
          Preview address
        </button>
        <button type="button" onClick={handleCreate} disabled={!!validationError || busy}>
          {busy ? 'Working…' : 'Create vault'}
        </button>
      </div>
    </form>
  )
}
