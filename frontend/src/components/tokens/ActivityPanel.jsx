import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { getNetwork } from '../../config/networks'
import { fetchActivity } from './tokenSubgraph'

// Spec 028 expansion (US12, FR-041/FR-043) — the per-token on-chain event history. Sourced from the subgraph
// (Transfer + admin events); disables truthfully on subgraph-less networks (Mordor/ETC). Real indexed data
// only (Constitution III). Event type / detail / actor / amount / tx link / time, with a category filter.

const TYPE_META = {
  mint: { label: 'Mint', cat: 'supply' },
  burn: { label: 'Burn', cat: 'supply' },
  transfer: { label: 'Transfer', cat: 'transfer' },
  pause: { label: 'Paused', cat: 'admin' },
  unpause: { label: 'Unpaused', cat: 'admin' },
  freeze: { label: 'Froze address', cat: 'admin' },
  unfreeze: { label: 'Unfroze address', cat: 'admin' },
  role_granted: { label: 'Role granted', cat: 'admin' },
  role_revoked: { label: 'Role revoked', cat: 'admin' },
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'supply', label: 'Supply' },
  { id: 'transfer', label: 'Transfers' },
  { id: 'admin', label: 'Admin' },
]

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
}

function fmtTime(unixSeconds) {
  const n = Number(unixSeconds)
  if (!n) return '—'
  return new Date(n * 1000).toISOString().replace('T', ' ').slice(0, 16)
}

export default function ActivityPanel({ token, caps, chainId }) {
  const reqKey = `${chainId}-${token.tokenAddress}`
  const [state, setState] = useState({ key: null, available: true, activity: [], error: null })
  const [filter, setFilter] = useState('all')
  const decimals = caps?.decimals ?? 18
  const explorer = getNetwork(chainId)?.explorer?.baseUrl || ''
  const loading = state.key !== reqKey

  // Passive background load (fires on tab-open and on token/chain navigation). A failure is surfaced inline as a
  // role="alert" banner below — NOT as a toast, which would double-feedback and spam on navigation.
  useEffect(() => {
    let cancelled = false
    fetchActivity(chainId, token.tokenAddress)
      .then((res) => {
        if (!cancelled) setState({ key: reqKey, available: res.available, activity: res.activity, error: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ key: reqKey, available: true, activity: [], error: e?.message || 'Could not load activity.' })
      })
    return () => {
      cancelled = true
    }
  }, [chainId, token.tokenAddress, reqKey])

  const rows = useMemo(() => {
    return state.activity
      .map((a) => {
        const meta = TYPE_META[a.type] || { label: a.type, cat: 'admin' }
        let detail = ''
        if (a.type === 'mint') detail = `to ${short(a.to)}`
        else if (a.type === 'burn') detail = `from ${short(a.from)}`
        else if (a.type === 'transfer') detail = `${short(a.from)} → ${short(a.to)}`
        else if (a.type === 'freeze' || a.type === 'unfreeze') detail = short(a.detail)
        else if (a.type === 'role_granted' || a.type === 'role_revoked') detail = `→ ${short(a.to)}`
        const amount = a.amount != null && ['mint', 'burn', 'transfer'].includes(a.type)
          ? ethers.formatUnits(BigInt(a.amount), decimals)
          : ''
        return { ...a, meta, detail, amount }
      })
      .filter((r) => filter === 'all' || r.meta.cat === filter)
  }, [state.activity, filter, decimals])

  if (!state.available) {
    const net = getNetwork(chainId)
    return (
      <div className="tm-card" role="tabpanel">
        <h4 style={{ marginBottom: '0.5rem' }}>Activity</h4>
        <p className="tm-intro" style={{ margin: 0 }}>
          The activity feed is built from indexed contract events, which require a subgraph.{' '}
          {net?.name || 'This network'} has no subgraph deployed, so the event history is unavailable here.
          Events are still emitted on-chain and visible in a block explorer.
        </p>
      </div>
    )
  }

  return (
    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="tm-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
          <h4 style={{ margin: 0 }}>Activity</h4>
          <div className="tm-filter-row" role="radiogroup" aria-label="Filter activity">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={`tm-chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="tm-row-sub" style={{ marginTop: '0.8rem' }}>Loading activity…</p>
        ) : state.error ? (
          <div className="tm-error" role="alert" style={{ marginTop: '0.8rem' }}>{state.error}</div>
        ) : rows.length === 0 ? (
          <p className="tm-row-sub" style={{ marginTop: '0.8rem' }}>No {filter === 'all' ? '' : `${filter} `}activity indexed yet.</p>
        ) : (
          <div className="tm-table-wrap" style={{ marginTop: '0.8rem' }}>
            <table className="tm-data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Detail</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Actor</th>
                  <th style={{ textAlign: 'right' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {explorer ? (
                        <a className="tm-btn-link" href={`${explorer}/tx/${r.txHash}`} target="_blank" rel="noreferrer">{r.meta.label}</a>
                      ) : (
                        r.meta.label
                      )}
                    </td>
                    <td className="tm-row-sub tm-mono">{r.detail}</td>
                    <td className="tm-mono" style={{ textAlign: 'right' }}>{r.amount}</td>
                    <td><code className="tm-mono">{short(r.actor)}</code></td>
                    <td className="tm-row-sub" style={{ textAlign: 'right' }}>{fmtTime(r.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
