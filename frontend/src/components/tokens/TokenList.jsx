import { useCallback, useEffect, useState } from 'react'
import { TOKEN_STANDARD_LABEL } from '../../abis/tokenFactory'
import { useTokenFactory } from './useTokenFactory'

/**
 * Spec 028 — token discovery list (US1 + US5). Two modes:
 *   - `mine`  : the connected issuer's network-scoped registry (→ admin surface).
 *   - `all`   : public browse of the latest tokens on the active network (→ detail view).
 * Each row shows the standard badge, name, symbol, and live on-chain supply. Strictly network-scoped — data
 * never crosses networks (FR-023) — and never lists a token before its creation tx confirms (FR-024). Selecting
 * a token raises `onSelect`.
 */
export default function TokenList({ mode = 'mine', onSelect, refreshKey = 0, selectLabel = 'Administer', title }) {
  const { isSupported, isConnected, listMyTokens, listAllTokens, readTokenLive } = useTokenFactory()
  const [tokens, setTokens] = useState([])
  const [supplyByAddr, setSupplyByAddr] = useState({})
  const [meta, setMeta] = useState({ total: 0, truncated: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const needsConnection = mode === 'mine'
  const heading = title || (mode === 'mine' ? 'Your tokens' : 'Browse tokens on this network')

  const load = useCallback(async () => {
    if (!isSupported) return
    if (needsConnection && !isConnected) return
    setLoading(true)
    setError(null)
    setSupplyByAddr({})
    try {
      let records
      if (mode === 'mine') {
        records = await listMyTokens()
        setMeta({ total: records.length, truncated: false })
      } else {
        const res = await listAllTokens()
        records = res.records
        setMeta({ total: res.total, truncated: res.truncated })
      }
      setTokens(records)

      // Fill in live supply per row asynchronously so the list renders immediately.
      const entries = await Promise.all(
        records.map(async (t) => {
          try {
            const live = await readTokenLive(t)
            return [t.tokenAddress, live?.supplyDisplay || '—']
          } catch {
            return [t.tokenAddress, '—']
          }
        })
      )
      setSupplyByAddr(Object.fromEntries(entries))
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Could not load tokens.')
    } finally {
      setLoading(false)
    }
  }, [isSupported, isConnected, needsConnection, mode, listMyTokens, listAllTokens, readTokenLive])

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
  if (needsConnection && !isConnected) {
    return (
      <div className="token-notice" role="status">
        Connect a wallet to see the tokens you’ve issued.
      </div>
    )
  }

  return (
    <div className="token-list">
      <div className="token-list-head">
        <h3>{heading}</h3>
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
        <p className="token-empty">
          {mode === 'mine'
            ? 'You haven’t issued any tokens on this network yet.'
            : 'No tokens have been issued on this network yet.'}
        </p>
      )}

      {tokens.length > 0 && (
        <>
          {mode === 'all' && meta.truncated && (
            <p className="token-list-note" role="status">
              Showing the latest {tokens.length} of {meta.total} tokens.
            </p>
          )}
          <ul className="token-list-items">
            {tokens.map((t) => (
              <li key={t.tokenAddress} className="token-list-item">
                <span className="token-standard-badge">{TOKEN_STANDARD_LABEL[t.standard] || 'Token'}</span>
                <span className="token-name">
                  {t.name} <span className="token-symbol">({t.symbol})</span>
                </span>
                <span className="token-supply">{supplyByAddr[t.tokenAddress] ?? '…'}</span>
                <code className="token-address">{t.tokenAddress}</code>
                <button type="button" className="btn btn-link" onClick={() => onSelect && onSelect(t)}>
                  {selectLabel}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
