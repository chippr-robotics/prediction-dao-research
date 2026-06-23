import { useState } from 'react'
import { ethers } from 'ethers'
import { useTokenFactory } from './useTokenFactory'
import { TOKEN_STANDARD } from '../../abis/tokenFactory'

const STANDARDS = [
  { value: 'erc20', label: 'Fungible (ERC-20)' },
  { value: 'erc721', label: 'Non-fungible (ERC-721)' },
  { value: 'restricted', label: 'Restricted (ERC-1404)' },
]

const MAX_DECIMALS = 36

/**
 * Spec 028 — token creation wizard (US1 + US3). Pick a standard, configure it, and submit a REAL on-chain
 * transaction. State is honest: nothing is presented as finalized before the chain confirms (FR-006/FR-024).
 * Only controls valid for the chosen standard are shown (FR-018). `onCreated` fires after confirmation so the
 * caller can refresh the token list.
 */
export default function CreateTokenWizard({ onCreated }) {
  const { isSupported, canIssue, createOpenERC20, createOpenERC721, createRestrictedERC20, status, error, lastTxHash } =
    useTokenFactory()

  const [standard, setStandard] = useState('erc20')
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    decimals: '18',
    initialSupply: '',
    baseURI: '',
    metadataURI: '',
    burnable: false,
    pausable: false,
    initialEligible: '',
  })
  const [formError, setFormError] = useState(null)

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  const isFungible = standard === 'erc20' || standard === 'restricted'

  function validate() {
    if (!form.name.trim()) return 'Name is required.'
    if (!form.symbol.trim()) return 'Symbol is required.'
    if (isFungible) {
      const d = Number(form.decimals)
      if (!Number.isInteger(d) || d < 0 || d > MAX_DECIMALS) return `Decimals must be 0–${MAX_DECIMALS}.`
      if (form.initialSupply !== '' && Number(form.initialSupply) < 0) return 'Initial supply cannot be negative.'
    }
    if (standard === 'restricted') {
      const bad = parseEligible(form.initialEligible).some((a) => !ethers.isAddress(a))
      if (bad) return 'Initial eligible list contains an invalid address.'
    }
    return null
  }

  function parseEligible(raw) {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    const v = validate()
    if (v) {
      setFormError(v)
      return
    }
    try {
      let result
      if (standard === 'erc20') {
        result = await createOpenERC20({
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          decimals: form.decimals,
          initialSupply: form.initialSupply || '0',
          metadataURI: form.metadataURI.trim(),
          burnable: form.burnable,
          pausable: form.pausable,
        })
      } else if (standard === 'erc721') {
        result = await createOpenERC721({
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          baseURI: form.baseURI.trim(),
          burnable: form.burnable,
        })
      } else {
        result = await createRestrictedERC20({
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          decimals: form.decimals,
          initialSupply: form.initialSupply || '0',
          metadataURI: form.metadataURI.trim(),
          initialEligible: parseEligible(form.initialEligible),
        })
      }
      if (onCreated) onCreated(result)
    } catch {
      /* error surfaced via hook `error`/`status` */
    }
  }

  if (!isSupported) {
    return (
      <div className="token-wizard token-feature-disabled" role="status">
        Token issuance isn’t deployed on this network yet. Switch to a supported network to create tokens.
      </div>
    )
  }

  const busy = status === 'creating'

  return (
    <form className="token-wizard" onSubmit={handleSubmit} aria-busy={busy} noValidate>
      <h3>Create a token</h3>

      {!canIssue && (
        <div className="token-notice" role="status">
          Your connected wallet isn’t authorized to issue tokens (needs the issuer role). You can review the form,
          but creation will be blocked until an admin grants you issuance access.
        </div>
      )}

      <fieldset>
        <legend>Standard</legend>
        {STANDARDS.map((s) => (
          <label key={s.value} className="token-radio">
            <input
              type="radio"
              name="token-standard"
              value={s.value}
              checked={standard === s.value}
              onChange={() => setStandard(s.value)}
            />
            {s.label}
          </label>
        ))}
      </fieldset>

      <div className="token-field">
        <label htmlFor="tk-name">Name</label>
        <input id="tk-name" value={form.name} onChange={set('name')} required aria-required="true" />
      </div>

      <div className="token-field">
        <label htmlFor="tk-symbol">Symbol</label>
        <input id="tk-symbol" value={form.symbol} onChange={set('symbol')} required aria-required="true" />
      </div>

      {isFungible && (
        <>
          <div className="token-field">
            <label htmlFor="tk-decimals">Decimals</label>
            <input
              id="tk-decimals"
              type="number"
              min="0"
              max={MAX_DECIMALS}
              value={form.decimals}
              onChange={set('decimals')}
            />
          </div>
          <div className="token-field">
            <label htmlFor="tk-supply">Initial supply</label>
            <input
              id="tk-supply"
              type="number"
              min="0"
              value={form.initialSupply}
              onChange={set('initialSupply')}
              placeholder="0"
            />
          </div>
        </>
      )}

      {standard === 'erc721' && (
        <div className="token-field">
          <label htmlFor="tk-baseuri">Collection base URI (optional)</label>
          <input id="tk-baseuri" value={form.baseURI} onChange={set('baseURI')} placeholder="ipfs://…" />
        </div>
      )}

      {standard === 'restricted' && (
        <div className="token-field">
          <label htmlFor="tk-eligible">Initial eligible addresses (optional)</label>
          <textarea
            id="tk-eligible"
            value={form.initialEligible}
            onChange={set('initialEligible')}
            placeholder="0x… one per line or comma-separated"
            rows={3}
          />
        </div>
      )}

      {standard !== 'restricted' && (
        <fieldset>
          <legend>Options</legend>
          <label className="token-checkbox">
            <input type="checkbox" checked={form.burnable} onChange={set('burnable')} /> Burnable
          </label>
          {standard === 'erc20' && (
            <label className="token-checkbox">
              <input type="checkbox" checked={form.pausable} onChange={set('pausable')} /> Pausable
            </label>
          )}
        </fieldset>
      )}

      {formError && (
        <div className="token-error" role="alert">
          {formError}
        </div>
      )}
      {error && (
        <div className="token-error" role="alert">
          {error}
        </div>
      )}

      {busy && (
        <div className="token-pending" role="status">
          Submitting transaction… {lastTxHash ? `(${lastTxHash.slice(0, 10)}…)` : ''} Awaiting confirmation.
        </div>
      )}
      {status === 'success' && (
        <div className="token-success" role="status">
          Token created and confirmed on-chain.
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={busy || !canIssue}>
        {busy ? 'Creating…' : 'Create token'}
      </button>
    </form>
  )
}

export { TOKEN_STANDARD }
