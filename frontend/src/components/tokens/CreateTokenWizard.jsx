import { useState } from 'react'
import { ethers } from 'ethers'
import { useTokenFactory } from './useTokenFactory'

// Spec 028 (US1 + US6 + FR-045) — create flow for role-based v2 tokens: pick a standard, configure it, optionally
// cap supply, review a deployment summary, and submit a REAL on-chain transaction with honest pending/confirmed/
// failed state. Only controls valid for the chosen standard are shown.

const STANDARDS = [
  { value: 'erc20', label: 'Fungible (ERC-20)', tag: 'ERC-20', tagClass: 'tm-badge-erc20', desc: 'Standard fungible token with roles (mint, pause, burn), optional supply cap, and batch distribution.' },
  { value: 'erc721', label: 'Non-fungible (ERC-721)', tag: 'ERC-721', tagClass: 'tm-badge-erc721', desc: 'NFT collection with per-token metadata, role-based minting, pause, and freeze.' },
  { value: 'restricted', label: 'Restricted (ERC-1404)', tag: 'ERC-1404', tagClass: 'tm-badge-erc1404', desc: 'Compliance token: eligibility allowlist, human-readable restriction reasons, freeze, optional cap.' },
]
const MAX_DECIMALS = 36

export default function CreateTokenWizard({ onCreated, onViewMine }) {
  const { isSupported, canIssue, createOpenERC20V2, createOpenERC721V2, createRestrictedERC20V2, status, error, lastTxHash } =
    useTokenFactory()

  const [created, setCreated] = useState(null)
  const [standard, setStandard] = useState('erc20')
  const [form, setForm] = useState({
    name: '', symbol: '', decimals: '18', initialSupply: '', cap: '', baseURI: '', metadataURI: '', initialEligible: '',
  })
  const [formError, setFormError] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isFungible = standard === 'erc20' || standard === 'restricted'
  const selStd = STANDARDS.find((s) => s.value === standard)
  const parseList = (raw) => raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)

  function validate() {
    if (!form.name.trim()) return 'Name is required.'
    if (!form.symbol.trim()) return 'Symbol is required.'
    if (isFungible) {
      const d = Number(form.decimals)
      if (!Number.isInteger(d) || d < 0 || d > MAX_DECIMALS) return `Decimals must be 0–${MAX_DECIMALS}.`
      if (form.initialSupply !== '' && Number(form.initialSupply) < 0) return 'Initial supply cannot be negative.'
      if (form.cap !== '' && Number(form.cap) < 0) return 'Cap cannot be negative.'
      if (form.cap !== '' && form.initialSupply !== '' && Number(form.cap) > 0 && Number(form.initialSupply) > Number(form.cap))
        return 'Initial supply exceeds the cap.'
    }
    if (standard === 'restricted' && parseList(form.initialEligible).some((a) => !ethers.isAddress(a)))
      return 'Initial eligible list contains an invalid address.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    setCreated(null)
    const v = validate()
    if (v) return setFormError(v)
    try {
      const common = { name: form.name.trim(), symbol: form.symbol.trim() }
      let result
      if (standard === 'erc20') {
        result = await createOpenERC20V2({ ...common, decimals: form.decimals, initialSupply: form.initialSupply || '0', cap: form.cap || '0', metadataURI: form.metadataURI.trim() })
      } else if (standard === 'erc721') {
        result = await createOpenERC721V2({ ...common, baseURI: form.baseURI.trim() })
      } else {
        result = await createRestrictedERC20V2({ ...common, decimals: form.decimals, initialSupply: form.initialSupply || '0', cap: form.cap || '0', metadataURI: form.metadataURI.trim(), initialEligible: parseList(form.initialEligible) })
      }
      setCreated(result)
      if (onCreated) onCreated(result)
    } catch {
      /* surfaced via hook error/status */
    }
  }

  if (!isSupported) {
    return <div className="tm-feature-disabled" role="status">Token issuance isn’t deployed on this network yet.</div>
  }

  const busy = status === 'creating'

  return (
    <form className="tm-create-layout" onSubmit={handleSubmit} aria-busy={busy} noValidate>
      <div>
        <h3>Choose a token standard</h3>
        {!canIssue && (
          <div className="tm-notice" role="status">
            Your connected wallet isn’t authorized to issue tokens (needs the issuer role). Creation is blocked
            until an admin grants you access.
          </div>
        )}
        <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          <legend className="sr-only">Standard</legend>
          {STANDARDS.map((s) => (
            <button
              type="button"
              key={s.value}
              className={`tm-std-card ${standard === s.value ? 'selected' : ''}`}
              aria-pressed={standard === s.value}
              onClick={() => setStandard(s.value)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tm-std-name">{s.label}</span>
                <span className={`tm-badge ${s.tagClass}`}>{s.tag}</span>
              </div>
              <span className="tm-std-desc">{s.desc}</span>
            </button>
          ))}
        </fieldset>

        <h4 style={{ margin: '1.25rem 0 0.75rem' }}>Token parameters</h4>
        <div className="tm-field">
          <label className="tm-label" htmlFor="tk-name">Name</label>
          <input id="tk-name" className="tm-input" value={form.name} onChange={set('name')} aria-required="true" />
        </div>
        <div className="tm-field">
          <label className="tm-label" htmlFor="tk-symbol">Symbol</label>
          <input id="tk-symbol" className="tm-input tm-mono" value={form.symbol} onChange={set('symbol')} aria-required="true" />
        </div>
        {isFungible && (
          <>
            <div className="tm-field">
              <label className="tm-label" htmlFor="tk-decimals">Decimals</label>
              <input id="tk-decimals" className="tm-input tm-mono" type="number" min="0" max={MAX_DECIMALS} value={form.decimals} onChange={set('decimals')} />
            </div>
            <div className="tm-field">
              <label className="tm-label" htmlFor="tk-supply">Initial supply</label>
              <input id="tk-supply" className="tm-input tm-mono" type="number" min="0" value={form.initialSupply} onChange={set('initialSupply')} placeholder="0" />
            </div>
            <div className="tm-field">
              <label className="tm-label" htmlFor="tk-cap">Max supply cap (optional — 0 = uncapped)</label>
              <input id="tk-cap" className="tm-input tm-mono" type="number" min="0" value={form.cap} onChange={set('cap')} placeholder="0" />
            </div>
          </>
        )}
        {standard === 'erc721' && (
          <div className="tm-field">
            <label className="tm-label" htmlFor="tk-baseuri">Collection base URI (optional)</label>
            <input id="tk-baseuri" className="tm-input tm-mono" value={form.baseURI} onChange={set('baseURI')} placeholder="ipfs://…" />
          </div>
        )}
        {standard === 'restricted' && (
          <div className="tm-field">
            <label className="tm-label" htmlFor="tk-eligible">Initial eligible addresses (optional)</label>
            <textarea id="tk-eligible" className="tm-textarea tm-mono" rows={3} value={form.initialEligible} onChange={set('initialEligible')} placeholder="0x… one per line or comma-separated" />
          </div>
        )}

        {formError && <div className="tm-error" role="alert">{formError}</div>}
        {error && <div className="tm-error" role="alert">{error}</div>}
      </div>

      {/* Deployment summary rail */}
      <div className="tm-rail">
        <div className="tm-card">
          <h4 style={{ marginBottom: '0.75rem' }}>Deployment summary</h4>
          <div className="tm-kv"><span className="k">Standard</span><span className={`tm-badge ${selStd.tagClass}`}>{selStd.tag}</span></div>
          <div className="tm-kv"><span className="k">Name</span><span>{form.name || '—'}</span></div>
          <div className="tm-kv"><span className="k">Symbol</span><span className="tm-mono">{form.symbol || '—'}</span></div>
          {isFungible && <div className="tm-kv"><span className="k">Supply cap</span><span className="tm-mono">{form.cap && Number(form.cap) > 0 ? form.cap : 'Uncapped'}</span></div>}
          <div className="tm-kv"><span className="k">Admin model</span><span>Role-based (you = owner)</span></div>

          {busy && <div className="tm-pending" role="status">Submitting… {lastTxHash ? `(${lastTxHash.slice(0, 10)}…)` : ''} awaiting confirmation.</div>}
          {status === 'success' && created && (
            <div className="tm-success" role="status">
              <strong>Token created and confirmed on-chain.</strong>
              {created.tokenAddress && (
                <div className="tm-mono" style={{ marginTop: '0.35rem', wordBreak: 'break-all' }}>{created.tokenAddress}</div>
              )}
              {onViewMine && (
                <button type="button" className="tm-btn-link" style={{ marginTop: '0.4rem' }} onClick={onViewMine}>
                  View in My Tokens →
                </button>
              )}
            </div>
          )}

          <button type="submit" className="tm-btn tm-btn-primary" style={{ width: '100%', marginTop: '0.9rem' }} disabled={busy || !canIssue}>
            {busy ? 'Creating…' : 'Review & deploy'}
          </button>
          <p className="tm-std-desc" style={{ textAlign: 'center', marginTop: '0.6rem' }}>You’ll sign the deployment in your connected wallet.</p>
        </div>
      </div>
    </form>
  )
}
