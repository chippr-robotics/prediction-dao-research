import { useCallback, useEffect, useState } from 'react'
import './clearpath.css'
import { getNetwork } from '../../config/networks'
import { DAO_FRAMEWORK_LABEL } from '../../abis/externalDAORegistry'
import { useClearPath } from './useClearPath'
import RegisterExternalDao from './RegisterExternalDao'
import ExternalDaoView from './ExternalDaoView'

// Spec 030 — ClearPath module (external-DAO pillar), embedded as the My Account "ClearPath" tab. Lists DAOs
// deployed by other platforms registered in the on-chain ExternalDAORegistry (read live over RPC — works on
// subgraph-less Mordor, where Olympia lives), lets a member register a new one, and opens a per-DAO tracking
// view. Network-scoped; self-disables truthfully where ClearPath isn't deployed (FR-016). Real on-chain only.

const TABS = [
  { id: 'daos', label: 'External DAOs' },
  { id: 'register', label: 'Register' },
]

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export default function ClearPathPanel() {
  const { isSupported, chainId, reader, signer, account, usdcAddress, listExternalDAOs, registerExternalDAO } = useClearPath()
  const [tab, setTab] = useState('daos')
  const [loading, setLoading] = useState(true)
  const [daos, setDaos] = useState([])
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const net = getNetwork(chainId)

  // Loads the registry over RPC. Does NOT setState synchronously (the first statement when supported is the
  // async read) so it is safe to call from the effect; the Refresh button flips `loading` itself.
  const load = useCallback(async () => {
    if (!isSupported) return
    try {
      const list = await listExternalDAOs()
      setDaos(list)
      setError(null)
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Could not load DAOs.')
      setDaos([])
    } finally {
      setLoading(false)
    }
  }, [isSupported, listExternalDAOs])

  useEffect(() => {
    load()
  }, [load])

  const refresh = () => {
    setLoading(true)
    load()
  }

  if (!isSupported) {
    return (
      <div className="clearpath">
        <div className="cp-disabled" role="status">
          ClearPath isn’t available on {net?.name || 'this network'}. Switch to a network that supports DAO
          governance (e.g. Ethereum for ENS/Uniswap, or Ethereum Classic Mordor for Olympia) to track and
          manage DAOs.
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="clearpath">
        <ExternalDaoView record={selected} reader={reader} signer={signer} account={account} chainId={chainId} usdcAddress={usdcAddress} onBack={() => setSelected(null)} />
      </div>
    )
  }

  return (
    <div className="clearpath">
      <p className="cp-intro">
        ClearPath — track and manage DAOs across platforms on {net?.name || 'this network'}. Add an existing DAO
        (e.g. an OpenZeppelin Governor like Olympia) and inspect its live governance + treasury. Native ClearPath
        DAOs are coming next.
      </p>

      <div className="cp-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`cp-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daos' && (
        <div role="tabpanel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span className="cp-row-sub">DAOs registered on {net?.name || 'this network'}</span>
            <button type="button" className="cp-btn" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
          {error && <div className="cp-error" role="alert">{error}</div>}
          {!loading && daos.length === 0 && !error && (
            <p className="cp-empty">No external DAOs registered yet. Use “Register” to add one.</p>
          )}
          {daos.map((d) => (
            <div key={d.id} className="cp-row" role="button" tabIndex={0}
              onClick={() => setSelected(d)} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(d) }}>
              <div style={{ minWidth: 0 }}>
                <div className="cp-row-name">{d.label || 'External DAO'}</div>
                <div className="cp-row-sub">{short(d.dao)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className="cp-badge cp-badge-ext">{DAO_FRAMEWORK_LABEL[d.framework] || 'Unknown'}</span>
                <span aria-hidden="true" style={{ color: 'var(--cp-text-3)' }}>›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'register' && (
        <div role="tabpanel">
          <RegisterExternalDao
            reader={reader}
            register={registerExternalDAO}
            onRegistered={() => { setTab('daos'); load() }}
          />
        </div>
      )}
    </div>
  )
}
