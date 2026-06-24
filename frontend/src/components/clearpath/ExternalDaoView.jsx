import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { getNetwork } from '../../config/networks'
import { DAO_FRAMEWORK_LABEL } from '../../abis/externalDAORegistry'
import { readGovernorSummary } from './governorConnector'

// Spec 030 (US3) — tracking view for a registered external DAO (e.g. Olympia). Reads the DAO's LIVE state via
// the standard IGovernor connector (real on-chain, no mock data). Proposal enumeration needs indexing; on
// subgraph-less networks (Mordor) that section disables truthfully with a block-explorer deep link (FR-020).

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
}

// Humanize the standard IGovernor COUNTING_MODE() string, e.g.
// "support=bravo&quorum=for,abstain" → "For / Against / Abstain · quorum counts For + Abstain".
function humanizeCounting(mode) {
  if (!mode) return '—'
  const support = /support=([^&]+)/.exec(mode)?.[1]
  const quorum = /quorum=([^&]+)/.exec(mode)?.[1]
  const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
  const options = support === 'bravo' ? 'For / Against / Abstain' : support === 'basic' ? 'For / Against' : support || 'custom'
  const q = quorum ? ` · quorum counts ${quorum.split(',').map(cap).join(' + ')}` : ''
  return options + q
}

// Humanize the EIP-6372 CLOCK_MODE() string → a plain clock label + the unit for delays/periods.
function humanizeClock(mode) {
  if (!mode || /blocknumber/.test(mode)) return 'Block number'
  if (/timestamp/.test(mode)) return 'Timestamp'
  return mode
}
function clockUnit(mode) {
  if (!mode || /blocknumber/.test(mode)) return 'blocks'
  if (/timestamp/.test(mode)) return 'seconds'
  return ''
}

export default function ExternalDaoView({ record, reader, chainId, onBack }) {
  const [state, setState] = useState({ key: null, summary: null, error: null })
  const net = getNetwork(chainId)
  const explorerBase = (net?.explorer?.baseUrl || '').replace(/\/$/, '')
  const loading = state.key !== record.dao

  useEffect(() => {
    let cancelled = false
    readGovernorSummary(reader, record.dao)
      .then((summary) => {
        if (!cancelled) setState({ key: record.dao, summary, error: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ key: record.dao, summary: null, error: e?.message || 'Could not read the DAO.' })
      })
    return () => {
      cancelled = true
    }
  }, [reader, record.dao])

  const s = state.summary

  return (
    <div>
      <button type="button" className="cp-btn-link" onClick={onBack}>‹ Back</button>

      <div className="cp-card" style={{ marginTop: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <h2>{record.label || s?.name || 'External DAO'}</h2>
          <span className="cp-badge cp-badge-ext">External · {DAO_FRAMEWORK_LABEL[record.framework] || 'Unknown'}</span>
        </div>
        <div className="cp-row-sub" style={{ marginTop: '0.3rem' }}>{record.dao}</div>
        <p className="cp-intro" style={{ marginTop: '0.6rem' }}>
          Tracked on {net?.name || 'this network'}. ClearPath holds no authority over this DAO — it reads its
          on-chain state and (where your wallet is authorized by the DAO's own rules) lets you act on it.
        </p>
      </div>

      {loading && <div className="cp-notice" role="status">Reading live DAO state…</div>}
      {state.error && <div className="cp-error" role="alert">{state.error}</div>}

      {s && (
        <div className="cp-grid-2">
          <div className="cp-card">
            <h4 style={{ marginBottom: '0.5rem' }}>Governance</h4>
            <div className="cp-kv"><span className="k">On-chain name</span><span>{s.name || '—'}</span></div>
            <div className="cp-kv"><span className="k">Voting token</span><span>{s.tokenName ? `${s.tokenName}${s.tokenSymbol ? ` (${s.tokenSymbol})` : ''}` : short(s.tokenAddr)}</span></div>
            <div className="cp-kv"><span className="k">Voting delay</span><span className="cp-mono">{s.votingDelay != null ? `${s.votingDelay} ${clockUnit(s.clockMode)}`.trim() : '—'}</span></div>
            <div className="cp-kv"><span className="k">Voting period</span><span className="cp-mono">{s.votingPeriod != null ? `${s.votingPeriod} ${clockUnit(s.clockMode)}`.trim() : '—'}</span></div>
            <div className="cp-kv"><span className="k">Proposal threshold</span><span className="cp-mono">{s.proposalThreshold ?? '—'}</span></div>
            <div className="cp-kv"><span className="k">Voting</span><span title={s.countingMode || ''}>{humanizeCounting(s.countingMode)}</span></div>
            <div className="cp-kv"><span className="k">Clock</span><span title={s.clockMode || ''}>{humanizeClock(s.clockMode)}</span></div>
          </div>

          <div className="cp-card">
            <h4 style={{ marginBottom: '0.5rem' }}>Treasury</h4>
            <div className="cp-kv"><span className="k">Timelock / treasury</span><code className="cp-mono">{short(s.timelock)}</code></div>
            <div className="cp-kv"><span className="k">Native balance</span><span className="cp-mono">{s.treasuryNative != null ? `${ethers.formatEther(s.treasuryNative)} ${net?.nativeCurrency?.symbol || ''}` : '—'}</span></div>
            {explorerBase && (
              <div className="cp-row-actions" style={{ marginTop: '0.6rem' }}>
                <a className="cp-btn" href={`${explorerBase}/address/${record.dao}`} target="_blank" rel="noreferrer">Governor on explorer ↗</a>
                {s.timelock && <a className="cp-btn" href={`${explorerBase}/address/${s.timelock}`} target="_blank" rel="noreferrer">Treasury ↗</a>}
              </div>
            )}
          </div>

          <div className="cp-card">
            <h4 style={{ marginBottom: '0.5rem' }}>Proposals</h4>
            <p className="cp-intro" style={{ margin: 0 }}>
              Proposal history requires event indexing, which is not available on {net?.name || 'this network'}.
              View this DAO's proposals on {net?.explorer?.name || 'the block explorer'} or its own app.
            </p>
            {explorerBase && (
              <div className="cp-row-actions" style={{ marginTop: '0.6rem' }}>
                <a className="cp-btn" href={`${explorerBase}/address/${record.dao}`} target="_blank" rel="noreferrer">View on {net?.explorer?.name || 'explorer'} ↗</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
