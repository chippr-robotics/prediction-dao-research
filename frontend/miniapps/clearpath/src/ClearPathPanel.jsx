import { useCallback, useEffect, useState } from 'react'
import './clearpath.css'
import { getNetwork } from '../../config/networks'
import { getContractAddressForChain } from '../../config/contracts'
import { DAO_FRAMEWORK_LABEL } from '../../abis/externalDAORegistry'
import { useClearPath } from './useClearPath'
import RegisterExternalDao from './RegisterExternalDao'
import ExternalDaoView from './ExternalDaoView'
import ReadRouteToggle from './ReadRouteToggle'

// Spec 030/042 + network-agnostic follow-up — ClearPath module (external-DAO pillar), embedded as the My
// Account "ClearPath" tab. Lists DAOs across EVERY clearpath-capable network at once (mirroring the Portfolio
// tab's cross-chain pattern) — registered in an on-chain ExternalDAORegistry where deployed, else tracked
// device-local, plus the curated known-DAO seed list. Each row is tagged with its network; opening one reads
// live over that network's own RPC regardless of which chain the wallet is connected to. Real on-chain only —
// acting on a DAO (register/vote/queue/execute) still requires the wallet to switch to that DAO's own network.

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export default function ClearPathPanel() {
  const {
    isSupported,
    chainId,
    chainIds,
    hasRegistryFor,
    reader,
    readerFor,
    signer,
    account,
    readRoute,
    setReadRoute,
    listExternalDAOs,
    trackDAO,
    untrackDAO,
  } = useClearPath()
  const [tab, setTab] = useState('daos')
  const [loading, setLoading] = useState(true)
  const [daos, setDaos] = useState([])
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const net = getNetwork(chainId)

  // Loads every clearpath network's DAOs in parallel (network-agnostic). Does NOT setState synchronously (the
  // first statement is the async read) so it is safe to call from the effect; the Refresh button flips
  // `loading` itself.
  const load = useCallback(async () => {
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
  }, [listExternalDAOs])

  useEffect(() => {
    load()
  }, [load])

  const refresh = () => {
    setLoading(true)
    load()
  }

  const openDao = (d) => setSelected(d)

  return (
    <div className="clearpath">
      {selected ? (
        <ExternalDaoView
          record={selected}
          reader={readerFor(selected.chainId)}
          signer={signer}
          account={account}
          chainId={selected.chainId}
          usdcAddress={getContractAddressForChain('paymentToken', selected.chainId)}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          <p className="cp-intro">
            ClearPath — track and manage DAOs across every supported network: an OpenZeppelin Governor (e.g. ENS,
            Olympia) or a Governor Bravo DAO (e.g. Uniswap). Every DAO is listed regardless of which network your
            wallet is currently on — you'll be asked to switch networks only when you act (register, vote, queue,
            execute).
          </p>
          {!isSupported && (
            <div className="cp-notice" role="status">
              Your wallet is on {net?.name || 'a network'}, which doesn't run ClearPath — you can still browse the
              DAOs below; switch to a supported network to register, track, or act on one.
            </div>
          )}

          <div className="cp-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'daos'} className={`cp-tab ${tab === 'daos' ? 'active' : ''}`} onClick={() => setTab('daos')}>
              DAOs
            </button>
            <button type="button" role="tab" aria-selected={tab === 'register'} className={`cp-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>
              Register / Track
            </button>
          </div>

          {tab === 'daos' && (
            <div role="tabpanel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span className="cp-row-sub">DAOs across every supported network</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ReadRouteToggle value={readRoute} onChange={setReadRoute} />
                  <button type="button" className="cp-btn" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
                </div>
              </div>
              {error && <div className="cp-error" role="alert">{error}</div>}
              {!loading && daos.length === 0 && !error && (
                <p className="cp-empty">No DAOs tracked yet. Use “Register / Track” to add one.</p>
              )}
              {daos.map((d) => (
                <div key={`${d.chainId}:${d.id}`} className="cp-row" role="button" tabIndex={0}
                  onClick={() => openDao(d)} onKeyDown={(e) => { if (e.key === 'Enter') openDao(d) }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="cp-row-name">{d.label || 'External DAO'}</div>
                    <div className="cp-row-sub">{short(d.dao)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span className="cp-badge" title={`Network: ${d.networkName}`}>{d.networkName}</span>
                    <span className="cp-badge cp-badge-ext">{DAO_FRAMEWORK_LABEL[d.framework] || 'Unknown'}</span>
                    {d.source === 'local' && (
                      <button
                        type="button"
                        className="cp-btn-link"
                        aria-label={`Untrack ${d.label || short(d.dao)}`}
                        onClick={(e) => { e.stopPropagation(); untrackDAO(d.dao, d.chainId); load() }}
                      >
                        Untrack
                      </button>
                    )}
                    <span aria-hidden="true" style={{ color: 'var(--cp-text-3)' }}>›</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'register' && (
            <div role="tabpanel">
              <RegisterExternalDao
                connectedChainId={chainId}
                connectedReader={reader}
                chainIds={chainIds}
                hasRegistryFor={hasRegistryFor}
                readerFor={readerFor}
                track={trackDAO}
                onRegistered={() => { setTab('daos'); load() }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
