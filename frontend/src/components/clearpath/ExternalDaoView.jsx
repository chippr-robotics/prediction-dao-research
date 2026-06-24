import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { getNetwork } from '../../config/networks'
import { useNotification } from '../../hooks/useUI'
import { DAO_FRAMEWORK_LABEL, PROPOSAL_STATE_LABEL, VOTE_SUPPORT } from '../../abis/externalDAORegistry'
import {
  readGovernorSummary,
  readTreasuries,
  extraTreasuries,
  fetchGovernorProposals,
  castVote,
  queueProposal,
  executeProposal,
  proposeAction,
} from './governorConnector'

// Spec 030 (US3 + US5) — tracking + management view for a registered external DAO (e.g. Olympia). Reads the
// DAO's LIVE state via the standard IGovernor connector, its treasuries (timelock + known vaults) native+USDC,
// and its proposals via a bounded on-chain log scan (the subgraph-less fallback). Where the connected wallet is
// authorized by the DAO's own rules, the member can vote / queue / execute / propose — user-signed; ClearPath
// holds no authority. No mock data.

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
}
function humanizeCounting(mode) {
  if (!mode) return '—'
  const support = /support=([^&]+)/.exec(mode)?.[1]
  const quorum = /quorum=([^&]+)/.exec(mode)?.[1]
  const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)
  const options = support === 'bravo' ? 'For / Against / Abstain' : support === 'basic' ? 'For / Against' : support || 'custom'
  const q = quorum ? ` · quorum counts ${quorum.split(',').map(cap).join(' + ')}` : ''
  return options + q
}
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
function fmtUsdc(bal, decimals) {
  if (bal == null) return '—'
  try { return ethers.formatUnits(bal, decimals) } catch { return '—' }
}

export default function ExternalDaoView({ record, reader, signer, chainId, usdcAddress, onBack }) {
  const { showNotification } = useNotification()
  const net = getNetwork(chainId)
  const explorerBase = (net?.explorer?.baseUrl || '').replace(/\/$/, '')

  const [sum, setSum] = useState({ key: null, summary: null, error: null })
  const sumLoading = sum.key !== record.dao
  const [treasuries, setTreasuries] = useState([])
  const [props, setProps] = useState({ key: null, ok: true, proposals: [], scannedFrom: null, partial: false, error: null })
  const propsLoading = props.key !== record.dao
  const [busy, setBusy] = useState(false)
  const s = sum.summary

  // Summary + treasuries (timelock + known extra vaults), native + USDC.
  useEffect(() => {
    let cancelled = false
    setTreasuries([])
    readGovernorSummary(reader, record.dao)
      .then(async (summary) => {
        if (cancelled) return
        setSum({ key: record.dao, summary, error: null })
        const vaults = []
        if (summary?.timelock && ethers.isAddress(summary.timelock) && summary.timelock !== ethers.ZeroAddress) {
          vaults.push({ label: 'Timelock', address: summary.timelock })
        }
        vaults.push(...extraTreasuries(chainId, record.dao))
        if (vaults.length) {
          try {
            const t = await readTreasuries(reader, vaults, usdcAddress)
            if (!cancelled) setTreasuries(t)
          } catch { /* treasury balances are best-effort */ }
        }
      })
      .catch((e) => { if (!cancelled) setSum({ key: record.dao, summary: null, error: e?.message || 'Could not read the DAO.' }) })
    return () => { cancelled = true }
  }, [reader, record.dao, chainId, usdcAddress])

  // Proposals via the bounded live indexer (subgraph-less fallback).
  const loadProposals = useCallback(async () => {
    const res = await fetchGovernorProposals(reader, record.dao)
    setProps({ key: record.dao, ...res })
  }, [reader, record.dao])
  useEffect(() => { loadProposals() }, [loadProposals])

  async function run(label, makeTx) {
    if (!signer) return showNotification('Connect a wallet to act on this DAO.', 'warning')
    setBusy(true)
    try {
      const tx = await makeTx()
      showNotification(`${label} submitted — awaiting confirmation…`, 'info')
      await tx.wait()
      showNotification(`${label} confirmed.`, 'success')
      await loadProposals()
    } catch (e) {
      showNotification(e?.shortMessage || e?.reason || e?.message || `${label} failed.`, 'error')
    } finally {
      setBusy(false)
    }
  }

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
          on-chain state and (where your wallet is authorized by the DAO's own rules) lets you act on it, signed by you.
        </p>
      </div>

      {sumLoading && <div className="cp-notice" role="status">Reading live DAO state…</div>}
      {sum.error && <div className="cp-error" role="alert">{sum.error}</div>}

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
            {treasuries.length === 0 && <p className="cp-row-sub">Reading balances…</p>}
            {treasuries.map((t) => (
              <div key={t.address} className="cp-section" style={{ marginBottom: '0.5rem' }}>
                <div className="cp-kv"><span className="k">{t.label}</span><code className="cp-mono">{short(t.address)}</code></div>
                <div className="cp-kv"><span className="k">Native</span><span className="cp-mono">{t.native != null ? `${ethers.formatEther(t.native)} ${net?.nativeCurrency?.symbol || ''}` : '—'}</span></div>
                <div className="cp-kv"><span className="k">{t.usdcSymbol || 'USDC'}</span><span className="cp-mono">{fmtUsdc(t.usdc, t.usdcDecimals)}</span></div>
                {explorerBase && <a className="cp-btn-link" href={`${explorerBase}/address/${t.address}`} target="_blank" rel="noreferrer">View ↗</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cp-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h4>Proposals</h4>
          <button type="button" className="cp-btn" onClick={loadProposals} disabled={propsLoading || busy}>Refresh</button>
        </div>
        <p className="cp-intro" style={{ marginTop: '0.4rem' }}>
          Live on-chain scan (no subgraph on {net?.name || 'this network'}). Actions are signed by your wallet and
          gated by the DAO's own rules.
        </p>

        {propsLoading && <div className="cp-notice" role="status">Indexing proposals on-chain…</div>}
        {!propsLoading && !props.ok && (
          <div className="cp-error" role="alert">Couldn’t load proposals from this RPC: {props.error}</div>
        )}
        {!propsLoading && props.ok && props.proposals.length === 0 && (
          <p className="cp-empty">No proposals found in the scanned range (from block {props.scannedFrom}).</p>
        )}
        {!propsLoading && props.ok && props.partial && props.proposals.length > 0 && (
          <p className="cp-row-sub">Showing the most recent proposals; older ones may exist beyond the scanned range.</p>
        )}

        {props.proposals.map((p) => (
          <div key={p.id} className="cp-card" style={{ background: 'var(--cp-canvas)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="cp-row-name">{p.description ? p.description.slice(0, 80) : `Proposal ${short(p.id)}`}</span>
              <span className="cp-badge">{PROPOSAL_STATE_LABEL[p.state] ?? 'Unknown'}</span>
            </div>
            <div className="cp-row-sub" style={{ marginTop: '0.3rem' }}>#{p.id.length > 12 ? short(p.id) : p.id} · by {short(p.proposer)}</div>
            {p.votes && (
              <div className="cp-row-sub" style={{ marginTop: '0.3rem' }}>
                For {p.votes.for} · Against {p.votes.against} · Abstain {p.votes.abstain}
              </div>
            )}
            <div className="cp-row-actions" style={{ marginTop: '0.6rem' }}>
              {p.state === 1 && (
                <>
                  <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => run('Vote For', () => castVote(signer, record.dao, p.id, VOTE_SUPPORT.For))}>Vote For</button>
                  <button type="button" className="cp-btn" disabled={busy} onClick={() => run('Vote Against', () => castVote(signer, record.dao, p.id, VOTE_SUPPORT.Against))}>Against</button>
                  <button type="button" className="cp-btn" disabled={busy} onClick={() => run('Vote Abstain', () => castVote(signer, record.dao, p.id, VOTE_SUPPORT.Abstain))}>Abstain</button>
                </>
              )}
              {p.state === 4 && <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => run('Queue', () => queueProposal(signer, record.dao, p))}>Queue</button>}
              {p.state === 5 && <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => run('Execute', () => executeProposal(signer, record.dao, p))}>Execute</button>}
              {explorerBase && <a className="cp-btn-link" href={`${explorerBase}/address/${record.dao}`} target="_blank" rel="noreferrer">Details ↗</a>}
            </div>
          </div>
        ))}

        <ProposeForm record={record} signer={signer} run={run} busy={busy} />
      </div>
    </div>
  )
}

// Minimal "new proposal" form (US5) — a single treasury/parameter action the member signs. Advanced; the DAO's
// own rules (e.g. proposal threshold / membership) gate acceptance on-chain.
function ProposeForm({ record, signer, run, busy }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [value, setValue] = useState('0')
  const [calldata, setCalldata] = useState('0x')
  const [description, setDescription] = useState('')

  if (!open) {
    return (
      <div style={{ marginTop: '0.8rem' }}>
        <button type="button" className="cp-btn-link" onClick={() => setOpen(true)}>+ New proposal</button>
      </div>
    )
  }

  const valid =
    ethers.isAddress(target.trim()) && description.trim().length > 0 && /^0x([0-9a-fA-F]{2})*$/.test(calldata.trim())

  function submit() {
    run('Propose', () =>
      proposeAction(signer, record.dao, {
        targets: [target.trim()],
        values: [ethers.parseEther(String(value || '0'))],
        calldatas: [calldata.trim()],
        description: description.trim(),
      })
    ).then(() => { setOpen(false); setTarget(''); setValue('0'); setCalldata('0x'); setDescription('') })
  }

  return (
    <div className="cp-card" style={{ marginTop: '0.8rem', background: 'var(--cp-canvas)' }}>
      <h4 style={{ marginBottom: '0.5rem' }}>New proposal</h4>
      <div className="cp-field"><label className="cp-label">Target contract</label><input className="cp-input cp-mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0x…" /></div>
      <div className="cp-field"><label className="cp-label">Value (native)</label><input className="cp-input cp-mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" /></div>
      <div className="cp-field"><label className="cp-label">Calldata</label><input className="cp-input cp-mono" value={calldata} onChange={(e) => setCalldata(e.target.value)} placeholder="0x" /></div>
      <div className="cp-field"><label className="cp-label">Description</label><input className="cp-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this proposal does" /></div>
      <div className="cp-row-actions">
        <button type="button" className="cp-btn cp-btn-primary" disabled={!valid || busy} onClick={submit}>Submit proposal</button>
        <button type="button" className="cp-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}
