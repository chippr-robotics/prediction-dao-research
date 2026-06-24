import { useCallback, useEffect, useState } from 'react'
import './tokens.css'
import { TOKEN_STANDARD, TOKEN_STANDARD_LABEL } from '../../abis/tokenFactory'
import { useTokenFactory } from './useTokenFactory'
import CreateTokenWizard from './CreateTokenWizard'
import TokenDetailView from './TokenDetailView'

// Spec 028 (US1/US5/US9, FR-027/028/029) — Token Mint portal, embedded as the My Account "Tokens" tab.
// Information architecture from the imported design: My Tokens / Create / Explorer + a per-token detail view.
// Theme-aware (tokens.css maps the design onto the app theme variables). Real Web3 only; self-disables on
// networks without a deployed factory (FR-023).

const TABS = [
  { id: 'mine', label: 'My Tokens' },
  { id: 'create', label: 'Create' },
  { id: 'explorer', label: 'Explorer' },
]

function badgeClass(std) {
  if (std === TOKEN_STANDARD.OPEN_ERC721) return 'tm-badge-erc721'
  if (std === TOKEN_STANDARD.RESTRICTED_ERC1404) return 'tm-badge-erc1404'
  return 'tm-badge-erc20'
}
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

function TokenTable({ mode, onOpen, refreshKey }) {
  const { isSupported, isConnected, listMyTokens, listAllTokens, readTokenLive } = useTokenFactory()
  const [rows, setRows] = useState([])
  const [supply, setSupply] = useState({})
  const [meta, setMeta] = useState({ total: 0, truncated: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!isSupported) return
    if (mode === 'mine' && !isConnected) return
    setLoading(true)
    setError(null)
    setSupply({})
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
      setRows(records)
      const entries = await Promise.all(records.map(async (t) => {
        try { return [t.tokenAddress, (await readTokenLive(t))?.supplyDisplay || '—'] } catch { return [t.tokenAddress, '—'] }
      }))
      setSupply(Object.fromEntries(entries))
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Could not load tokens.')
    } finally {
      setLoading(false)
    }
  }, [isSupported, isConnected, mode, listMyTokens, listAllTokens, readTokenLive])

  useEffect(() => { load() }, [load, refreshKey])

  if (mode === 'mine' && !isConnected) {
    return <div className="tm-notice" role="status">Connect a wallet to see the tokens you administer.</div>
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span className="tm-stat-label">{mode === 'mine' ? 'Tokens you administer' : `Tokens on this network`}</span>
        <button type="button" className="tm-btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {error && <div className="tm-error" role="alert">{error}</div>}
      {!loading && rows.length === 0 && !error && (
        <p className="tm-empty">{mode === 'mine' ? 'You haven’t issued any tokens on this network yet.' : 'No tokens have been issued on this network yet.'}</p>
      )}
      {rows.length > 0 && (
        <>
          {mode === 'explorer' && meta.truncated && <p className="tm-row-sub" role="status">Showing the latest {rows.length} of {meta.total} tokens.</p>}
          <div className="tm-table">
            <div className="tm-thead"><div>Token</div><div>Standard</div><div>Supply</div><div>Address</div><div /></div>
            {rows.map((t) => (
              <div key={t.tokenAddress} className="tm-row" role="button" tabIndex={0}
                onClick={() => onOpen(t)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                  <span className="tm-monogram">{t.symbol.slice(0, 2).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tm-row-name">{t.name}</div>
                    <div className="tm-row-sub">{t.symbol}</div>
                  </div>
                </div>
                <div><span className={`tm-badge ${badgeClass(t.standard)}`}>{TOKEN_STANDARD_LABEL[t.standard]}</span></div>
                <div className="tm-mono">{supply[t.tokenAddress] ?? '…'}</div>
                <div><code>{short(t.tokenAddress)}</code></div>
                <div aria-hidden="true" style={{ color: 'var(--tm-text-3)' }}>›</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function TokensPanel() {
  const { isSupported, listMyTokens, isConnected } = useTokenFactory()
  const [tab, setTab] = useState('mine')
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [mineCount, setMineCount] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function count() {
      if (!isSupported || !isConnected) return
      try { const t = await listMyTokens(); if (!cancelled) setMineCount(t.length) } catch { /* ignore */ }
    }
    count()
    return () => { cancelled = true }
  }, [isSupported, isConnected, listMyTokens, refreshKey])

  if (!isSupported) {
    return (
      <div className="token-mint">
        <div className="tm-feature-disabled" role="status">Token Mint isn’t deployed on this network. Switch to a supported network to issue and administer tokens.</div>
      </div>
    )
  }

  return (
    <div className="token-mint">
      <p className="tm-intro">Issue and administer your own tokens — open ERC-20 / ERC-721 and restricted ERC-1404 — directly on-chain.</p>

      {selected ? (
        <TokenDetailView token={selected} onBack={() => { setSelected(null); setRefreshKey((k) => k + 1) }} />
      ) : (
        <>
          <div className="tm-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tm-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {tab === 'mine' && (
            <>
              <div className="tm-summary">
                <div className="tm-stat"><div className="tm-stat-label">Tokens administered</div><div className="tm-stat-value">{mineCount ?? '—'}</div></div>
              </div>
              <TokenTable mode="mine" refreshKey={refreshKey} onOpen={setSelected} />
            </>
          )}
          {tab === 'create' && (
            <CreateTokenWizard
              onCreated={() => setRefreshKey((k) => k + 1)}
              onViewMine={() => { setRefreshKey((k) => k + 1); setTab('mine') }}
            />
          )}
          {tab === 'explorer' && <TokenTable mode="explorer" refreshKey={refreshKey} onOpen={setSelected} />}
        </>
      )}
    </div>
  )
}
