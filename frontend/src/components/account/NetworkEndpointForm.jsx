import { useState } from 'react'
import { AUTH_MODES } from '../../lib/network/endpointStore'

/**
 * Per-network endpoint editor (spec 069).
 *
 * The member owns the route their reads take: a primary RPC URL, a failover behind it, and
 * whatever credential their provider expects. Network name / chain id / symbol / explorer
 * are shown read-only — they are protocol facts from `config/networks.js`, not preferences,
 * and letting a member edit them would only produce a network that lies about itself.
 *
 * Honest-state rules this form enforces:
 *   - "Test" is the truth: it asks the endpoint for `eth_chainId` and reports what came back.
 *   - An endpoint serving a DIFFERENT chain cannot be saved (it would silently poison every
 *     read for this network). Validation blocks it; the message names both chains.
 *   - An unreachable endpoint saves with the failure shown — a member may be configuring
 *     ahead of a provider or CSP change — but nothing claims it works.
 *   - The API key is sent to the PRIMARY endpoint only, and the form says so, because a
 *     failover is usually a different provider.
 */
function NetworkEndpointForm({ network, entry, onSave, onReset, onProbe, onCancel }) {
  const [url, setUrl] = useState(entry?.url || '')
  const [failoverUrl, setFailoverUrl] = useState(entry?.failoverUrl || '')
  const [authMode, setAuthMode] = useState(entry?.authMode || AUTH_MODES.NONE)
  const [authHeaderName, setAuthHeaderName] = useState(entry?.authHeaderName || '')
  const [authToken, setAuthToken] = useState(entry?.authToken || '')
  const [showToken, setShowToken] = useState(false)
  const [errors, setErrors] = useState({})
  const [warnings, setWarnings] = useState([])
  const [probeState, setProbeState] = useState(null)
  const [probing, setProbing] = useState(false)
  const [saved, setSaved] = useState(false)

  const current = { url, failoverUrl, authMode, authHeaderName, authToken }
  const fieldId = (name) => `net-${network.chainId}-${name}`

  const handleProbe = async (target) => {
    setProbing(true)
    setSaved(false)
    try {
      const result = await onProbe({ ...current, url: target === 'failover' ? failoverUrl : url })
      setProbeState({ ...result, target })
    } finally {
      setProbing(false)
    }
  }

  const handleSave = (event) => {
    event.preventDefault()
    setSaved(false)
    // A tested chain mismatch is a hard stop: the endpoint would serve another network's
    // state into every read for this one.
    if (probeState?.code === 'chain-mismatch') {
      setErrors({ [probeState.target === 'failover' ? 'failoverUrl' : 'url']: probeState.message })
      return
    }
    const result = onSave(current)
    setErrors(result.errors || {})
    setWarnings(result.warnings || [])
    if (result.ok) setSaved(true)
  }

  const handleReset = () => {
    onReset()
    setUrl('')
    setFailoverUrl('')
    setAuthMode(AUTH_MODES.NONE)
    setAuthHeaderName('')
    setAuthToken('')
    setErrors({})
    setWarnings([])
    setProbeState(null)
    setSaved(false)
  }

  return (
    <form className="network-endpoint-form" onSubmit={handleSave}>
      <div className="network-endpoint-field">
        <label htmlFor={fieldId('name')}>Network name</label>
        <input id={fieldId('name')} type="text" value={network.name} readOnly disabled />
      </div>

      <div className="network-endpoint-field">
        <label htmlFor={fieldId('url')}>RPC URL</label>
        <input
          id={fieldId('url')}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck="false"
          placeholder={network.rpcUrl}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-describedby={errors.url ? fieldId('url-error') : fieldId('url-hint')}
          aria-invalid={errors.url ? 'true' : undefined}
        />
        <p className="network-endpoint-hint" id={fieldId('url-hint')}>
          Leave empty to use the app default ({network.rpcUrl}).
        </p>
        {errors.url && (
          <p className="network-endpoint-error" id={fieldId('url-error')} role="alert">
            {errors.url}
          </p>
        )}
      </div>

      <div className="network-endpoint-field">
        <label htmlFor={fieldId('failover')}>Failover RPC URL</label>
        <input
          id={fieldId('failover')}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck="false"
          placeholder="Optional — used when the primary endpoint fails"
          value={failoverUrl}
          onChange={(e) => setFailoverUrl(e.target.value)}
          aria-describedby={errors.failoverUrl ? fieldId('failover-error') : fieldId('failover-hint')}
          aria-invalid={errors.failoverUrl ? 'true' : undefined}
        />
        <p className="network-endpoint-hint" id={fieldId('failover-hint')}>
          Without one, the app default stands in when your endpoint fails.
        </p>
        {errors.failoverUrl && (
          <p className="network-endpoint-error" id={fieldId('failover-error')} role="alert">
            {errors.failoverUrl}
          </p>
        )}
      </div>

      <fieldset className="network-endpoint-auth">
        <legend>API key</legend>
        <p className="network-endpoint-hint">
          Only needed when your provider expects a header. Keys embedded in the URL (Alchemy,
          QuickNode) need nothing here. The key is sent to the primary endpoint only, stays on
          this device, and is never included in a backup.
        </p>

        <div className="network-endpoint-field">
          <label htmlFor={fieldId('authmode')}>Authentication</label>
          <select
            id={fieldId('authmode')}
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value)}
          >
            <option value={AUTH_MODES.NONE}>None or key in URL</option>
            <option value={AUTH_MODES.HEADER}>Custom header</option>
            <option value={AUTH_MODES.BEARER}>Bearer token</option>
          </select>
        </div>

        {authMode === AUTH_MODES.HEADER && (
          <div className="network-endpoint-field">
            <label htmlFor={fieldId('headername')}>Header name</label>
            <input
              id={fieldId('headername')}
              type="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="x-api-key"
              value={authHeaderName}
              onChange={(e) => setAuthHeaderName(e.target.value)}
              aria-invalid={errors.authHeaderName ? 'true' : undefined}
            />
            {errors.authHeaderName && (
              <p className="network-endpoint-error" role="alert">
                {errors.authHeaderName}
              </p>
            )}
          </div>
        )}

        {authMode !== AUTH_MODES.NONE && (
          <div className="network-endpoint-field">
            <label htmlFor={fieldId('token')}>Key</label>
            <div className="network-endpoint-secret">
              <input
                id={fieldId('token')}
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                spellCheck="false"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                aria-invalid={errors.authToken ? 'true' : undefined}
              />
              <button
                type="button"
                className="network-endpoint-reveal"
                onClick={() => setShowToken((v) => !v)}
                aria-pressed={showToken}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.authToken && (
              <p className="network-endpoint-error" role="alert">
                {errors.authToken}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <dl className="network-docs network-endpoint-facts">
        <div className="network-doc-row">
          <dt>Chain ID</dt>
          <dd>
            {network.chainId} (0x{Number(network.chainId).toString(16)})
          </dd>
        </div>
        <div className="network-doc-row">
          <dt>Symbol</dt>
          <dd>{network.nativeCurrency?.symbol || '—'}</dd>
        </div>
        {network.explorer?.baseUrl && (
          <div className="network-doc-row">
            <dt>Block explorer</dt>
            <dd>
              <a href={network.explorer.baseUrl} target="_blank" rel="noopener noreferrer">
                {network.explorer.baseUrl}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {warnings.map((warning) => (
        <p className="network-endpoint-warning" key={warning} role="status">
          {warning}
        </p>
      ))}

      {probeState && (
        <p
          className={`network-endpoint-probe ${probeState.ok ? 'ok' : 'failed'}`}
          role="status"
        >
          {probeState.message}
        </p>
      )}

      {saved && (
        <p className="network-endpoint-saved" role="status">
          Saved. Reads use this route immediately; reload the app so wallet transactions use it
          too.
        </p>
      )}

      <div className="network-endpoint-actions">
        <button
          type="button"
          className="network-endpoint-btn"
          onClick={() => handleProbe('primary')}
          disabled={probing || !url.trim()}
        >
          {probing ? 'Testing…' : 'Test'}
        </button>
        {failoverUrl.trim() && (
          <button
            type="button"
            className="network-endpoint-btn"
            onClick={() => handleProbe('failover')}
            disabled={probing}
          >
            Test failover
          </button>
        )}
        <button type="submit" className="network-endpoint-btn primary">
          Save
        </button>
        {entry?.url && (
          <button type="button" className="network-endpoint-btn" onClick={handleReset}>
            Reset to default
          </button>
        )}
        <button type="button" className="network-endpoint-btn subtle" onClick={onCancel}>
          Close
        </button>
      </div>
    </form>
  )
}

export default NetworkEndpointForm
