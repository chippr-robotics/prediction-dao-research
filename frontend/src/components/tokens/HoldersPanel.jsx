import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { getNetwork } from '../../config/networks'
import { fetchHolders } from './tokenSubgraph'

// Spec 028 expansion (US10, FR-039/FR-043) — the per-token holder cap table. Sourced from the subgraph
// (Transfer indexing); on subgraph-less networks (Mordor/ETC) it disables truthfully rather than fabricate
// rows. Real on-chain data only (Constitution III). Rank / address / balance / % of supply / holding-since,
// a distribution bar, and CSV export.

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
}

function fmtDate(unixSeconds) {
  const n = Number(unixSeconds)
  if (!n) return '—'
  return new Date(n * 1000).toISOString().slice(0, 10)
}

export default function HoldersPanel({ token, caps, chainId }) {
  const reqKey = `${chainId}-${token.tokenAddress}`
  const [state, setState] = useState({ key: null, available: true, holders: [], error: null })
  const decimals = caps?.decimals ?? 18
  const loading = state.key !== reqKey

  useEffect(() => {
    let cancelled = false
    fetchHolders(chainId, token.tokenAddress)
      .then((res) => {
        if (!cancelled) setState({ key: reqKey, available: res.available, holders: res.holders, error: null })
      })
      .catch((e) => {
        if (!cancelled)
          setState({ key: reqKey, available: true, holders: [], error: e?.message || 'Could not load holders.' })
      })
    return () => {
      cancelled = true
    }
  }, [chainId, token.tokenAddress, reqKey])

  // Rank holders + compute each one's share of total indexed supply (BigInt math → no float drift).
  const ranked = useMemo(() => {
    const total = state.holders.reduce((acc, h) => acc + BigInt(h.balance), 0n)
    return {
      total,
      rows: state.holders.map((h, i) => {
        const bal = BigInt(h.balance)
        const bps = total > 0n ? Number((bal * 10000n) / total) : 0
        return {
          rank: i + 1,
          account: h.account,
          balance: bal,
          balanceDisplay: ethers.formatUnits(bal, decimals),
          pct: bps / 100,
          since: fmtDate(h.firstHeldAt),
        }
      }),
    }
  }, [state.holders, decimals])

  function exportCsv() {
    const header = 'rank,address,balance,percent,holding_since\n'
    const body = ranked.rows
      .map((r) => `${r.rank},${r.account},${r.balanceDisplay},${r.pct},${r.since}`)
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${token.symbol || 'token'}-holders.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!state.available) {
    const net = getNetwork(chainId)
    return (
      <div className="tm-card" role="tabpanel">
        <h4 style={{ marginBottom: '0.5rem' }}>Holder cap table</h4>
        <p className="tm-intro" style={{ margin: 0 }}>
          The holder cap table is built from indexed Transfer events, which require a subgraph.{' '}
          {net?.name || 'This network'} has no subgraph deployed, so the cap table is unavailable here. Holder
          balances are still enforced on-chain — only the aggregated view is unavailable.
        </p>
      </div>
    )
  }

  return (
    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="tm-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
          <h4 style={{ margin: 0 }}>Holders ({loading ? '…' : ranked.rows.length})</h4>
          <button type="button" className="tm-btn" disabled={loading || ranked.rows.length === 0} onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        {ranked.rows.length > 0 && (
          <div className="tm-distribution" style={{ marginTop: '0.8rem' }} aria-hidden="true">
            {ranked.rows.slice(0, 12).map((r) => (
              <span key={r.account} className="tm-distribution-seg" style={{ width: `${Math.max(r.pct, 0.5)}%` }} title={`${short(r.account)} · ${r.pct}%`} />
            ))}
          </div>
        )}

        {loading ? (
          <p className="tm-row-sub" style={{ marginTop: '0.8rem' }}>Loading holders…</p>
        ) : state.error ? (
          <div className="tm-error" role="alert" style={{ marginTop: '0.8rem' }}>{state.error}</div>
        ) : ranked.rows.length === 0 ? (
          <p className="tm-row-sub" style={{ marginTop: '0.8rem' }}>No holders indexed yet. Mint or transfer to populate the cap table.</p>
        ) : (
          <div className="tm-table-wrap" style={{ marginTop: '0.8rem' }}>
            <table className="tm-data-table">
              <thead>
                <tr>
                  <th style={{ width: '3rem' }}>#</th>
                  <th>Address</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th style={{ textAlign: 'right' }}>% supply</th>
                  <th style={{ textAlign: 'right' }}>Since</th>
                </tr>
              </thead>
              <tbody>
                {ranked.rows.map((r) => (
                  <tr key={r.account}>
                    <td className="tm-row-sub">{r.rank}</td>
                    <td><code className="tm-mono">{short(r.account)}</code></td>
                    <td className="tm-mono" style={{ textAlign: 'right' }}>{r.balanceDisplay}</td>
                    <td className="tm-mono" style={{ textAlign: 'right' }}>{r.pct}%</td>
                    <td className="tm-row-sub" style={{ textAlign: 'right' }}>{r.since}</td>
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
