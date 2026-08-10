import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'
import { fetchHolders, SUBGRAPH_UNAVAILABLE } from './tokenSubgraph'

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
  const host = useMiniAppHost()
  // A chain DESCRIPTOR, not the host's NETWORKS entry: name, explorer and subgraph
  // endpoint only. Null for a chain the host does not recognise, which every consumer
  // below already treats as 'unknown network' rather than guessing another chain's.
  const net = host.network(chainId)
  const showNotification = (message, type) => host.toast.show(message, type)
  const reqKey = `${chainId}-${token.tokenAddress}`
  const [state, setState] = useState({ key: null, available: true, unavailable: null, holders: [], error: null })
  const decimals = caps?.decimals ?? 18
  const loading = state.key !== reqKey

  // Passive background load (fires on tab-open and on token/chain navigation). A failure is surfaced inline as a
  // role="alert" banner below — NOT as a toast, which would double-feedback and spam on navigation. Toasts here
  // are reserved for the user-initiated CSV export.
  useEffect(() => {
    let cancelled = false
    fetchHolders(net?.subgraphUrl ?? null, token.tokenAddress)
      .then((res) => {
        if (!cancelled) {
          setState({
            key: reqKey,
            available: res.available,
            unavailable: res.unavailable,
            holders: res.holders,
            error: null,
          })
        }
      })
      .catch((e) => {
        // `fetchHolders` no longer throws for a subgraph outcome — it reports one. Anything
        // reaching here is a genuine programming fault, so it stays an error banner.
        if (!cancelled) {
          setState({
            key: reqKey,
            available: true,
            unavailable: null,
            holders: [],
            error: e?.message || 'Could not load holders.',
          })
        }
      })
    return () => {
      cancelled = true
    }
    // `net?.subgraphUrl` and not just `chainId`: the endpoint is what the read actually
    // depends on, and the host resolves it (a member repointing one must take effect).
  }, [chainId, net?.subgraphUrl, token.tokenAddress, reqKey])

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
    try {
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
      showNotification(`Exported ${ranked.rows.length} holders to CSV.`, 'success')
    } catch (e) {
      showNotification(e?.message || 'CSV export failed.', 'error')
    }
  }

  if (!state.available) {
    const network = net?.name || 'This network'
    // Three different facts, three different sentences. In particular a transport failure is NOT
    // reported as "this network does not support it" — that would turn one bad fetch into a
    // permanent-sounding claim about the chain.
    const explanation = {
      [SUBGRAPH_UNAVAILABLE.NO_SUBGRAPH]: `${network} has no subgraph deployed, so the cap table is unavailable here.`,
      [SUBGRAPH_UNAVAILABLE.NOT_INDEXED]: `${network}'s subgraph does not index token transfers, so the cap table is unavailable here.`,
      [SUBGRAPH_UNAVAILABLE.UNREACHABLE]: `${network}'s subgraph could not be reached just now, so the cap table could not be loaded. This is a temporary problem, not a limitation of this network — try again shortly.`,
    }[state.unavailable] || `The cap table is unavailable on ${network}.`

    return (
      <div className="tm-card" role="tabpanel">
        <h4 style={{ marginBottom: '0.5rem' }}>Holder cap table</h4>
        <p className="tm-intro" style={{ margin: 0 }}>
          The holder cap table is built from indexed Transfer events, which require a subgraph.{' '}
          {explanation} Holder balances are still enforced on-chain — only the aggregated view is
          unavailable.
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
