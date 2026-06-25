/**
 * AddTokenDialog (Spec 034, US1 browse / US2 custom).
 *
 * Two modes:
 *   - Browse: search the per-network registry (useTokenRegistry) and add tokens.
 *     Already-watched rows show "Added". Honest notices when the catalog is
 *     custom-only (FR-017) or temporarily unavailable (FR-016) — custom-add stays
 *     enabled in both cases.
 *   - Custom: paste a contract address → validate + resolve on-chain
 *     (resolveCustomToken) → add as an 'unverified' entry (FR-003/004/011/025).
 *     Invalid/unresolvable addresses are rejected honestly with nothing added.
 */

import { useEffect, useMemo, useState } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import { useTokenRegistry } from '../../hooks/useTokenRegistry'
import { resolveCustomToken } from '../../lib/tokens/resolveCustomToken'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export default function AddTokenDialog({ chainId, onAdd, isWatched, onClose }) {
  const { provider } = useWeb3()
  const { status, isCustomOnly, search } = useTokenRegistry(chainId)
  const [mode, setMode] = useState('browse')
  const [query, setQuery] = useState('')
  const [customAddr, setCustomAddr] = useState('')
  const [customErr, setCustomErr] = useState(null)
  const [busy, setBusy] = useState(false)

  // Custom-only / unavailable networks have nothing to browse — start on Custom.
  useEffect(() => {
    if (isCustomOnly || status === 'unavailable') setMode('custom')
  }, [isCustomOnly, status])

  const results = useMemo(() => search(query), [search, query])

  async function addCustom() {
    setCustomErr(null)
    setBusy(true)
    try {
      const entry = await resolveCustomToken(customAddr, chainId, provider)
      if (isWatched(entry.address, entry.chainId)) {
        setCustomErr('That token is already in your watchlist.')
        return
      }
      onAdd(entry)
      setCustomAddr('')
    } catch (e) {
      setCustomErr(e?.message || 'Could not add this token.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-add-token" role="group" aria-label="Add a token">
      <div className="tm-tabs" role="tablist" aria-label="Add token mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'browse'}
          className={`tm-tab ${mode === 'browse' ? 'active' : ''}`}
          onClick={() => setMode('browse')}
        >
          Browse registry
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'custom'}
          className={`tm-tab ${mode === 'custom' ? 'active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Custom address
        </button>
        {onClose && (
          <button type="button" className="tm-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Done
          </button>
        )}
      </div>

      {mode === 'browse' && (
        <div className="tm-add-browse">
          {isCustomOnly ? (
            <p className="tm-notice" role="status">
              No curated token catalog exists for this network. Add a token by its contract
              address instead.
            </p>
          ) : status === 'unavailable' ? (
            <p className="tm-notice" role="status">
              The token catalog couldn’t be loaded right now. You can still add a token by its
              contract address.
            </p>
          ) : (
            <>
              <input
                className="tm-input"
                type="search"
                placeholder="Search by symbol, name, or address"
                aria-label="Search the token registry"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {status === 'loading' && <p className="tm-row-sub" role="status">Loading catalog…</p>}
              <div className="tm-add-results">
                {results.map((t) => {
                  const added = isWatched(t.address, t.chainId)
                  return (
                    <div key={`${t.chainId}:${t.address}`} className="tm-row tm-add-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="tm-row-name">{t.symbol}</div>
                        <div className="tm-row-sub">{t.name || short(t.address)}</div>
                      </div>
                      <button
                        type="button"
                        className="tm-btn-primary"
                        disabled={added}
                        onClick={() => onAdd({ ...t, source: 'registry' })}
                      >
                        {added ? 'Added' : 'Add'}
                      </button>
                    </div>
                  )
                })}
                {results.length === 0 && status === 'ready' && (
                  <p className="tm-empty">No tokens match “{query}”.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <div className="tm-add-custom">
          <label className="tm-label" htmlFor="tm-custom-addr">
            Token contract address
          </label>
          <input
            id="tm-custom-addr"
            className="tm-input"
            type="text"
            placeholder="0x…"
            value={customAddr}
            onChange={(e) => {
              setCustomAddr(e.target.value)
              setCustomErr(null)
            }}
          />
          <p className="tm-row-sub">
            Custom tokens aren’t in the registry — they’ll be marked “unverified”. Double-check
            the address.
          </p>
          {customErr && (
            <div className="tm-error" role="alert">
              {customErr}
            </div>
          )}
          <button type="button" className="tm-btn-primary" onClick={addCustom} disabled={busy}>
            {busy ? 'Checking…' : 'Add token'}
          </button>
        </div>
      )}
    </div>
  )
}
