// Spec 043 (US1) — create a new Safe vault: choose owners + threshold, preview the deterministic address, and
// deploy. Validation mirrors validateVaultConfig (FR-005). Presentational; all chain work is delegated to the
// injected callbacks so the component is unit-testable.
// Spec 049 (US1) — an optional Policy step sits between configuration and review: when rules are configured
// they become a `policySetup` ({setupTo, setupData}) threaded into vault creation; when skipped the payload
// carries no policySetup, keeping the initializer byte-identical to spec 043 (FR-010).

import { useState, useMemo, useEffect } from 'react'
import { validateVaultConfig } from '../../lib/custody/safeVault'
import { buildEnablePolicySetup } from '../../lib/custody/policy'
import PolicyStep from './PolicyStep'

export default function CreateVaultWizard({ connectedAddress, chainId, onCreate, onPreview, onDone }) {
  const [owners, setOwners] = useState([connectedAddress || ''])
  const [threshold, setThreshold] = useState(1)
  const [label, setLabel] = useState('')
  const [policy, setPolicy] = useState(null)
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

  // A previewed address is only valid for the exact owners+threshold+policy it was computed from (the policy
  // setup is part of the initializer, which is hashed into the CREATE2 salt); clear it whenever the config
  // changes so the user never sees a stale address that won't match what "Create vault" deploys.
  useEffect(() => {
    setPredicted(null)
  }, [owners, threshold, policy])

  const cleanedOwners = () => owners.map((o) => o.trim()).filter(Boolean)
  const nextSaltNonce = () => Date.now()

  // Spec 049: a policy still being edited (invalid) blocks create; a skipped policy is null.
  const policyBlocked = Boolean(policy?.invalid)
  const buildPolicySetup = () => (policy && !policy.invalid ? buildEnablePolicySetup(chainId, policy) : undefined)

  const updateOwner = (i, val) => setOwners((prev) => prev.map((o, idx) => (idx === i ? val : o)))
  const addOwner = () => setOwners((prev) => [...prev, ''])
  const removeOwner = (i) => setOwners((prev) => prev.filter((_, idx) => idx !== i))

  const handlePreview = async () => {
    setError(null)
    setBusy(true)
    try {
      const addr = await onPreview({
        owners: cleanedOwners(),
        threshold,
        saltNonce: previewNonce,
        policySetup: buildPolicySetup(),
      })
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
      await onCreate({
        owners: cleanedOwners(),
        threshold,
        saltNonce: previewNonce,
        label,
        policySetup: buildPolicySetup(),
      })
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

      <PolicyStep chainId={chainId} value={policy} onChange={setPolicy} />

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

      <p className="custody-policy-review">
        {policy && !policy.invalid
          ? `Policy: ${(policy.summary || []).join('; ')}`
          : 'No policy — the vault will have no spending rules.'}
      </p>

      <div className="custody-actions">
        <button type="button" onClick={handlePreview} disabled={!!validationError || policyBlocked || busy}>
          Preview address
        </button>
        <button type="button" onClick={handleCreate} disabled={!!validationError || policyBlocked || busy}>
          {busy ? 'Working…' : 'Create vault'}
        </button>
      </div>
    </form>
  )
}
