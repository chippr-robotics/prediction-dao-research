// Spec 043 (US1) — create a new Safe vault: choose owners + threshold, preview the deterministic address, and
// deploy. Validation mirrors validateVaultConfig (FR-005). Presentational; all chain work is delegated to the
// injected callbacks so the component is unit-testable.
// Spec 049 (US1) — an optional Policy step sits between configuration and review: when rules are configured
// they become a `policySetup` ({setupTo, setupData}) threaded into vault creation; when skipped the payload
// carries no policySetup, keeping the initializer byte-identical to spec 043 (FR-010).
// Spec 068 (US1/US5) — the flow states the deployment chain up front (FR-001) and owner rows use the
// platform's shared address entry with QR + address book (FR-006).

import { useState, useMemo, useEffect } from 'react'
import { suggestedThreshold, validateVaultConfig } from '../../lib/custody/safeVault'
import { buildEnablePolicySetup } from '../../lib/custody/policy'
import { buildEnablePolicyV2Setup } from '../../lib/custody/policyV2'
import {
  STARTER_COOLDOWN_CHOICES,
  STARTER_DEFAULT_COOLDOWN_SECONDS,
  STARTER_DEFAULT_STABLE_WINDOW,
  isStarterPolicyAvailable,
  starterPolicyV2,
} from '../../lib/custody/policyTemplates'
import { NETWORKS } from '../../config/networks'
import PolicyStep from './PolicyStep'
import CustodyAddressField from './CustodyAddressField'

export default function CreateVaultWizard({ connectedAddress, chainId, onCreate, onPreview, onDone }) {
  // Strict lookup: never let an unknown chain silently borrow the default network's name.
  const network = NETWORKS[Number(chainId)]
  const chainName = network?.name || `chain ${chainId}`
  const isTestnet = Boolean(network?.isTestnet)
  const starterAvailable = isStarterPolicyAvailable(chainId)
  const [owners, setOwners] = useState([connectedAddress || ''])
  // The threshold is DERIVED from the owner list until the member states a number of their own;
  // after that it is theirs and never moves under them again. Derived rather than synced in an
  // effect, so there is no render where the field shows a number the form is not using.
  const [chosenThreshold, setChosenThreshold] = useState(null)
  const [label, setLabel] = useState('')
  // Release 1.14.0 — a new vault is offered a starter policy BY DEFAULT where the ordered engine
  // exists. 'custom' hands over to the spec-049 composer; 'none' is the pre-1.14 behaviour and is
  // refused for a 1-of-1 (see soloNoPolicy below).
  const [policyMode, setPolicyMode] = useState(starterAvailable ? 'starter' : 'none')
  const [starterCap, setStarterCap] = useState(STARTER_DEFAULT_STABLE_WINDOW)
  const [starterDelay, setStarterDelay] = useState(STARTER_DEFAULT_COOLDOWN_SECONDS)
  const [customPolicy, setCustomPolicy] = useState(null)
  const [predicted, setPredicted] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const ownerCount = owners.map((o) => o.trim()).filter(Boolean).length
  const thresholdTouched = chosenThreshold !== null
  const threshold = thresholdTouched ? chosenThreshold : suggestedThreshold(ownerCount)

  // The starter rules, rebuilt from the member's two knobs. A parse failure is reported and blocks
  // creation exactly as an invalid hand-composed policy does — never silently downgraded to none.
  const starter = useMemo(() => {
    if (!starterAvailable) return { policy: null, error: null }
    try {
      const built = starterPolicyV2({
        chainId,
        stableWindowAmount: starterCap,
        cooldownSeconds: Number(starterDelay),
      })
      return {
        policy: { orderedRules: built.rules, cooldown: built.cooldown, summary: built.summary },
        stable: built.stable,
        error: null,
      }
    } catch (e) {
      return { policy: null, error: e.message }
    }
  }, [starterAvailable, chainId, starterCap, starterDelay])

  // One resolved policy for the whole form, whichever way the member got there.
  const policy = useMemo(() => {
    if (policyMode === 'none') return null
    if (policyMode === 'starter') {
      return starter.error ? { invalid: true, error: starter.error } : starter.policy
    }
    return customPolicy
  }, [policyMode, starter, customPolicy])

  const hasPolicy = Boolean(policy && !policy.invalid)

  const validationError = useMemo(() => {
    const cleaned = owners.map((o) => o.trim()).filter(Boolean)
    try {
      validateVaultConfig(cleaned, threshold)
      return null
    } catch (e) {
      return e.message
    }
  }, [owners, threshold])

  /*
   * Release 1.14.0 — the 1-of-1-with-no-policy refusal.
   *
   * A vault with one owner, a threshold of one and no guard is a Safe that any single signature
   * moves — the same authority a plain account has, wrapped in a surface that reads as protection.
   * It is the one configuration this flow will not produce. The way out is a second owner (so a
   * stolen key is not enough) or a policy (so the chain itself limits what one key can do).
   */
  const soloNoPolicy = ownerCount === 1 && Number(threshold) === 1 && !hasPolicy

  // A previewed address is only valid for the exact owners+threshold+policy it was computed from (the policy
  // setup is part of the initializer, which is hashed into the CREATE2 salt); clear it whenever the config
  // changes so the user never sees a stale address that won't match what "Create vault" deploys.
  useEffect(() => {
    setPredicted(null)
  }, [owners, threshold, policy])

  const blocked = Boolean(validationError) || soloNoPolicy

  const cleanedOwners = () => owners.map((o) => o.trim()).filter(Boolean)
  const nextSaltNonce = () => Date.now()

  // Spec 049: a policy still being edited (invalid) blocks create; a skipped policy is null.
  const policyBlocked = Boolean(policy?.invalid)
  // Spec 068 (T026) — new vaults attach the ORDERED engine wherever it is deployed; the v1 setup
  // path remains only for chains that still have v1 alone, and v1 policies are never created fresh
  // (existing v1 vaults keep working and upgrade through PolicyPanelV2 — FR-020).
  const buildPolicySetup = () => {
    if (!policy || policy.invalid) return undefined
    if (policy.orderedRules) {
      return buildEnablePolicyV2Setup(chainId, policy.orderedRules, policy.cooldown || 0)
    }
    return buildEnablePolicySetup(chainId, policy)
  }

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
      {/* FR-001 — the member must know which chain their funds will live on BEFORE they deploy. */}
      <p className="custody-hint" role="status">
        This vault will be deployed on <strong>{chainName}</strong>
        {isTestnet ? ' (a test network — funds here are not real)' : ''}. To create it somewhere
        else, switch networks first.
      </p>

      <fieldset>
        <legend>Owners</legend>
        {owners.map((owner, i) => (
          <div className="custody-owner-row" key={i}>
            <CustodyAddressField
              id={`owner-${i}`}
              label={`Owner ${i + 1} address`}
              srOnlyLabel
              value={owner}
              onChange={(next) => updateOwner(i, next)}
              chainId={chainId}
              selfAddress={i === 0 ? connectedAddress : null}
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
          onChange={(e) => setChosenThreshold(Number(e.target.value))}
        />
        {!thresholdTouched && ownerCount > 1 && (
          <p className="custody-hint" role="status">
            Suggested: {suggestedThreshold(ownerCount)} of {ownerCount} owners. Change it if this
            vault needs more.
          </p>
        )}
      </div>

      <div className="custody-field">
        <label htmlFor="vault-label">Label (private, on this device)</label>
        <input id="vault-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>

      {starterAvailable && (
        <fieldset className="custody-policy-template">
          <legend>Protection</legend>
          <label htmlFor="vault-policy-starter">
            <input
              id="vault-policy-starter"
              type="radio"
              name="policy-template"
              checked={policyMode === 'starter'}
              onChange={() => setPolicyMode('starter')}
            />
            Starter policy (recommended)
          </label>
          <label htmlFor="vault-policy-custom">
            <input
              id="vault-policy-custom"
              type="radio"
              name="policy-template"
              checked={policyMode === 'custom'}
              onChange={() => setPolicyMode('custom')}
            />
            Custom rules
          </label>
          <label htmlFor="vault-policy-none">
            <input
              id="vault-policy-none"
              type="radio"
              name="policy-template"
              checked={policyMode === 'none'}
              onChange={() => setPolicyMode('none')}
            />
            No policy
          </label>
        </fieldset>
      )}

      {starterAvailable && policyMode === 'starter' && (
        <div className="custody-starter-policy">
          {starter.stable && (
            <div className="custody-field">
              <label htmlFor="starter-cap">
                24-hour limit ({starter.stable.symbol}) — leave empty for no limit
              </label>
              <input
                id="starter-cap"
                type="text"
                inputMode="decimal"
                value={starterCap}
                onChange={(e) => setStarterCap(e.target.value)}
              />
            </div>
          )}
          <div className="custody-field">
            <label htmlFor="starter-delay">Minimum delay between outgoing transactions</label>
            <select
              id="starter-delay"
              value={starterDelay}
              onChange={(e) => setStarterDelay(Number(e.target.value))}
            >
              {STARTER_COOLDOWN_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {starter.error ? (
            <p className="custody-error" role="alert">
              {starter.error}
            </p>
          ) : (
            <div className="custody-policy-summary" role="status">
              <h5 className="custody-policy-summary-title">
                These rules will be active from the first transaction
              </h5>
              <ul>
                {(starter.policy?.summary || []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(!starterAvailable || policyMode === 'custom') && (
        <PolicyStep chainId={chainId} value={customPolicy} onChange={setCustomPolicy} />
      )}

      {soloNoPolicy && (
        <p className="custody-error" role="alert">
          A vault with one owner and no policy is not safer than an ordinary account — a single key
          can move everything in it, and nothing on chain would stop that. Add a second owner, or
          keep a policy on this vault.
        </p>
      )}

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
        {hasPolicy
          ? `Policy: ${(policy.summary || []).join('; ')}`
          : 'No policy — the vault will have no spending rules.'}
      </p>

      <div className="custody-actions">
        <button type="button" onClick={handlePreview} disabled={blocked || policyBlocked || busy}>
          Preview address
        </button>
        <button className="btn btn-primary" type="button" onClick={handleCreate} disabled={blocked || policyBlocked || busy}>
          {busy ? 'Working…' : 'Create vault'}
        </button>
      </div>
    </form>
  )
}
