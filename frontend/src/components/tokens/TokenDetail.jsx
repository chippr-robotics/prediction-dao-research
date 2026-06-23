import { useEffect, useState } from 'react'
import { TOKEN_STANDARD_LABEL } from '../../abis/tokenFactory'
import { useTokenFactory, tokenRuleSummary } from './useTokenFactory'

/**
 * Spec 028 — public token profile (US5). Shows a token's standard, metadata, live on-chain supply, and a
 * truthful governing-rule summary (FR-025). All data is real on-chain state — the registry record plus a live
 * read; no mock values. Network-scoped via the hook (the feature self-disables on unsupported networks, FR-023).
 */
export default function TokenDetail({ token }) {
  const { isSupported, readTokenLive } = useTokenFactory()
  const [live, setLive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token || !isSupported) return
      setLoading(true)
      setError(null)
      try {
        const data = await readTokenLive(token)
        if (!cancelled) setLive(data)
      } catch (e) {
        if (!cancelled) setError(e?.shortMessage || e?.message || 'Could not read live token state.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, isSupported, readTokenLive])

  if (!token) return null

  return (
    <section className="token-detail" aria-labelledby="token-detail-heading">
      <h3 id="token-detail-heading">
        {token.name} <span className="token-symbol">({token.symbol})</span>
      </h3>

      <dl className="token-detail-grid">
        <dt>Standard</dt>
        <dd>
          <span className="token-standard-badge">{TOKEN_STANDARD_LABEL[token.standard] || 'Token'}</span>
        </dd>

        <dt>Address</dt>
        <dd>
          <code className="token-address">{token.tokenAddress}</code>
        </dd>

        <dt>Issuer</dt>
        <dd>
          <code className="token-address">{token.issuer}</code>
        </dd>

        {token.metadataURI ? (
          <>
            <dt>Metadata</dt>
            <dd>{token.metadataURI}</dd>
          </>
        ) : null}

        <dt>Live supply</dt>
        <dd>
          {loading && <span role="status">Reading on-chain…</span>}
          {!loading && error && (
            <span className="token-error" role="alert">
              {error}
            </span>
          )}
          {!loading && !error && live && (
            <>
              {live.supplyDisplay}
              {live.paused ? ' · Paused' : ''}
            </>
          )}
        </dd>

        {live?.owner ? (
          <>
            <dt>Owner</dt>
            <dd>
              <code className="token-address">{live.owner}</code>
            </dd>
          </>
        ) : null}
      </dl>

      <p className="token-rule-summary">{tokenRuleSummary(token)}</p>
    </section>
  )
}
