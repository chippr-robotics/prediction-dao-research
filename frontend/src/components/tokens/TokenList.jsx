import { useCallback, useEffect, useState } from 'react'
import { TOKEN_STANDARD_LABEL } from '../../abis/tokenFactory'
import { useTokenFactory } from './useTokenFactory'

/**
 * Spec 028 — the issuer's token list (US1/US5). Reads the network-scoped factory registry for the connected
 * account and shows each token's standard, name, symbol, and address. Strictly network-scoped (data never
 * crosses networks — FR-023) and never lists a token before its creation tx confirms (FR-024). Selecting a
 * token raises `onSelect` so the page can open its admin surface.
 */
export default function TokenList({ onSelect, refreshKey = 0 }) {
  const { isSupported, isConnected, listMyTokens } = useTokenFactory()
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!isSupported || !isConnected) return
    setLoading(true)
    setError(null)
    try {
      setTokens(await listMyTokens())
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Could not load your tokens.')
    } finally {
      setLoading(false)
    }
  }, [isSupported, isConnected, listMyTokens])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (!isSupported) {
    return (
      <div className="token-feature-disabled" role="status">
        Token issuance isn’t deployed on this network.
      </div>
    )
  }
  if (!isConnected) {
    return (
      <div className="token-notice" role="status">
        Connect a wallet to see the tokens you’ve issued.
      </div>
    )
  }

  return (
    <div className="token-list">
      <div className="token-list-head">
        <h3>Your tokens</h3>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="token-error" role="alert">
          {error}
        </div>
      )}

      {!loading && tokens.length === 0 && !error && (
        <p className="token-empty">You haven’t issued any tokens on this network yet.</p>
      )}

      {tokens.length > 0 && (
        <ul className="token-list-items">
          {tokens.map((t) => (
            <li key={t.tokenAddress} className="token-list-item">
              <span className="token-standard-badge">{TOKEN_STANDARD_LABEL[t.standard] || 'Token'}</span>
              <span className="token-name">
                {t.name} <span className="token-symbol">({t.symbol})</span>
              </span>
              <code className="token-address">{t.tokenAddress}</code>
              <button type="button" className="btn btn-link" onClick={() => onSelect && onSelect(t)}>
                Administer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
