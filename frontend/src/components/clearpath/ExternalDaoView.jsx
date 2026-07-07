import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { getNetwork } from '../../config/networks'
import { useNotification } from '../../hooks/useUI'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { DAO_FRAMEWORK_LABEL, PROPOSAL_STATE_LABEL, VOTE_SUPPORT } from '../../abis/externalDAORegistry'
import { getConnector, detectFramework } from './connectors'
import { fetchDaoProposals } from './daoDataSource'
import ProposalBuilder from './ProposalBuilder'

// Spec 042 — resolve the per-framework connector (OZ Governor / GovernorBravo). A registry entry may carry a
// coarse framework; a device-local entry carries the detected one. Fall back to the OZ connector so the view
// never renders empty while detection resolves (reads degrade honestly regardless).
const SOURCE_LABEL = { subgraph: 'The Graph', onchain: 'On-chain scan' }

// Spec 030 (US3 + US5) — tracking + management view for a registered external DAO (e.g. Olympia). Reads the
// DAO's LIVE state via the standard IGovernor connector, its treasuries (timelock + known vaults) native+USDC,
// and its proposals via a bounded on-chain log scan (the subgraph-less fallback). Where the connected wallet is
// authorized by the DAO's own rules, the member can vote / queue / execute / propose — user-signed; ClearPath
// holds no authority. No mock data.

// Upper bound on awaiting a confirmation. A tx that broadcasts but is then silently dropped from the mempool
// (never mined, never replaced) would otherwise leave tx.wait() pending forever — orphaning the persistent
// in-flight toast AND the busy lock (the finally never runs). 120s is far longer than a normal confirmation on
// the live ClearPath networks (Mordor ~15s blocks), so it only ever trips on a genuinely stuck/dropped tx.
const CONFIRM_TIMEOUT_MS = 120000

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

const SUPPORT_LABEL = { 0: 'Against', 1: 'For', 2: 'Abstain' }
const SECONDS_PER_BLOCK = 15 // ETC/Mordor ~15s blocks; only used to humanize block deltas in the timeline.

function humanizeDelta(units, isTimestamp) {
  const secs = Math.max(0, Math.round(isTimestamp ? units : units * SECONDS_PER_BLOCK))
  if (secs < 60) return `~${secs}s`
  const m = Math.round(secs / 60)
  if (m < 60) return `~${m}m`
  const h = Math.floor(m / 60); const rm = m % 60
  if (h < 24) return rm ? `~${h}h ${rm}m` : `~${h}h`
  const d = Math.floor(h / 24); const rh = h % 24
  return rh ? `~${d}d ${rh}h` : `~${d}d`
}

// Proposal timeline relative to "now" (current block, or wall-clock for timestamp-clock Governors). Honest: if
// the voting window can't be parsed, say so rather than inventing a phase.
function describeProposalTiming(p, currentBlock, clockMode) {
  const isTs = /timestamp/.test(clockMode || '')
  const snapshot = Number(p.voteStart); const deadline = Number(p.voteEnd)
  const now = isTs ? Math.floor(Date.now() / 1000) : Number(currentBlock)
  if (![snapshot, deadline, now].every(Number.isFinite)) return { label: 'Voting window unavailable', phase: 'unknown' }
  if (now < snapshot) return { label: `Voting opens in ${humanizeDelta(snapshot - now, isTs)}${isTs ? '' : ` (${snapshot - now} blocks)`}`, phase: 'pending' }
  if (now <= deadline) return { label: `Voting ends in ${humanizeDelta(deadline - now, isTs)}${isTs ? '' : ` (${deadline - now} blocks)`}`, phase: 'open' }
  return { label: 'Voting closed', phase: 'closed' }
}

// The proposal id, click-to-copy (the full id) so a member can look it up on the explorer. Shows a brief
// "Copied" confirmation; degrades quietly where the clipboard API is unavailable.
function CopyableId({ id }) {
  const [copied, setCopied] = useState(false)
  const shortId = id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable / denied */ }
  }
  return (
    <button type="button" className="cp-copy-id" onClick={copy} title="Copy full proposal ID" aria-label={`Copy proposal ID ${id}`}>
      <span className="cp-mono">#{shortId}</span>
      {copied ? (
        <span className="cp-copied">Copied ✓</span>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  )
}

export default function ExternalDaoView({ record, reader, signer, account, chainId, usdcAddress, onBack }) {
  const { showNotification } = useNotification()
  const { screenOne } = useAddressScreening()
  // Spec 043 (US3, FR-022a): acting on a DAO while operating as a vault becomes a threshold-gated vault proposal.
  const { isVault: operatingAsVault, canActAsVault, submit: submitAsActive } = useActiveAccount()
  const net = getNetwork(chainId)
  const explorerBase = (net?.explorer?.baseUrl || '').replace(/\/$/, '')

  // Resolve the per-framework connector. A registry entry may carry a coarse framework and a device-local entry
  // the detected one; if it's absent/unknown, detect it live. Fall back to the OZ connector (framework 0) while
  // detection resolves — reads degrade honestly regardless of framework.
  const [fw, setFw] = useState(record.framework)
  useEffect(() => {
    if (fw != null && fw !== 'unknown') return undefined
    let cancelled = false
    detectFramework(reader, record.dao).then((f) => {
      if (!cancelled && f !== 'unknown') setFw(f)
    })
    return () => {
      cancelled = true
    }
  }, [reader, record.dao, fw])
  const connector = getConnector(fw) || getConnector(0)

  const [sum, setSum] = useState({ key: null, summary: null, error: null })
  const sumLoading = sum.key !== record.dao
  const [treasuries, setTreasuries] = useState([])
  const [props, setProps] = useState({ key: null, ok: true, proposals: [], scannedFrom: null, partial: false, error: null })
  const propsLoading = props.key !== record.dao
  const [busy, setBusy] = useState(false)
  const [voterStates, setVoterStates] = useState({}) // proposalId → { hasVoted, votingPower, support }
  const [etas, setEtas] = useState({}) // proposalId → timelock execution ETA (unix seconds) for queued proposals
  const [nowMs, setNowMs] = useState(() => Date.now()) // drives the "executable in …" countdown + auto-enable
  const s = sum.summary

  // Summary + treasuries (timelock + known extra vaults), native + USDC.
  useEffect(() => {
    let cancelled = false
    setTreasuries([])
    connector.readSummary(reader, record.dao)
      .then(async (summary) => {
        if (cancelled) return
        setSum({ key: record.dao, summary, error: null })
        const vaults = []
        if (summary?.timelock && ethers.isAddress(summary.timelock) && summary.timelock !== ethers.ZeroAddress) {
          vaults.push({ label: 'Timelock', address: summary.timelock })
        }
        vaults.push(...connector.extraTreasuries(chainId, record.dao))
        if (vaults.length) {
          try {
            const t = await connector.readTreasuries(reader, vaults, usdcAddress)
            // Detect the executor-gated funding pattern per vault (ECIP-1112/1113) so the UI can both label it
            // and offer the correct "Fund from treasury" proposal action. Plain timelock vaults stay funding=null.
            const enriched = await Promise.all(
              t.map(async (entry) => {
                const funding = await connector.detectTreasuryFunding(reader, entry.address, summary?.timelock)
                return funding ? { ...entry, funding } : entry
              })
            )
            if (!cancelled) setTreasuries(enriched)
          } catch { /* treasury balances are best-effort */ }
        }
      })
      .catch((e) => { if (!cancelled) setSum({ key: record.dao, summary: null, error: e?.message || 'Could not read the DAO.' }) })
    return () => { cancelled = true }
  }, [reader, record.dao, chainId, usdcAddress, fw, connector])

  // Proposals via the per-DAO data source: The Graph subgraph where indexed, else the bounded on-chain live
  // indexer (subgraph-less fallback) — with a truthful source/status (FR-008, SC-011).
  const loadProposals = useCallback(async () => {
    const res = await fetchDaoProposals({ chainId, address: record.dao, framework: fw, reader })
    setProps({ key: record.dao, ...res })
  }, [reader, record.dao, chainId, fw])
  useEffect(() => { loadProposals() }, [loadProposals])

  // Per-user voting state (have I voted, my power at the snapshot, how I voted) for each listed proposal, keyed
  // by proposal id. Only attempted with a connected wallet; missing Governor views degrade to null (honest).
  useEffect(() => {
    if (!reader || !account || !props.ok || props.key !== record.dao || !props.proposals.length) {
      setVoterStates({})
      return undefined
    }
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        props.proposals.map(async (p) => [p.id, await connector.readVoterState(reader, record.dao, p, account)])
      )
      if (!cancelled) setVoterStates(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [reader, account, record.dao, props.key, props.ok, props.proposals, fw, connector])

  // Execution ETA for queued proposals (no wallet needed). A queued proposal can only execute once the
  // timelock delay elapses; without this the Execute button reverts early with the timelock's custom error.
  useEffect(() => {
    if (!reader || !props.ok || props.key !== record.dao) { setEtas({}); return undefined }
    const queued = props.proposals.filter((p) => p.state === 5)
    if (!queued.length) { setEtas({}); return undefined }
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(queued.map(async (p) => [p.id, await connector.readProposalEta(reader, record.dao, p.id)]))
      if (!cancelled) setEtas(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [reader, record.dao, props.key, props.ok, props.proposals, fw, connector])

  // Tick once a second only while some queued proposal is still waiting on its ETA, so the countdown stays live
  // and the Execute button auto-enables the moment the delay passes. No timer otherwise.
  useEffect(() => {
    const pending = props.proposals.some((p) => p.state === 5 && etas[p.id] != null && etas[p.id] * 1000 > Date.now())
    if (!pending) return undefined
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [props.proposals, etas])

  // Surfaces the whole on-chain activity to the app notification system so the user stays aware end-to-end:
  // a persistent "confirm in your wallet" prompt during signing, a persistent "awaiting confirmation" toast
  // while the tx mines (block times on subgraph-less chains like Mordor exceed the 5s default auto-dismiss, so
  // a non-sticky toast would vanish mid-flight), then a terminal confirmed (with the tx hash for traceability)
  // or failed toast. Each REPLACES the previous in the single-slot toast. Returns true ONLY when the tx actually
  // confirmed, so callers can gate success-only UI (e.g. the proposal builder must not reset/close on a reverted
  // propose — that would imply a success the chain didn't give).
  async function run(label, makeTx) {
    if (!signer) {
      showNotification('Connect a wallet to act on this DAO.', 'warning')
      return false
    }
    // Sanctions posture (FR-013, spec 042): screen the connected signer where a platform sanctions source exists.
    // A confirmed `restricted` result (only possible where a SanctionsGuard is deployed) blocks the action,
    // fail-closed. `uncertain` (no source on this network, e.g. Ethereum mainnet, or an unreadable guard) does
    // NOT block — external-DAO governance proceeds under the DAO's own rules, since ClearPath is non-custodial
    // and must not fabricate a screening result it cannot produce.
    if (account && screenOne) {
      const status = await screenOne(account, chainId).catch(() => 'uncertain')
      if (status === 'restricted') {
        showNotification('This wallet is restricted by sanctions screening — it cannot act on this DAO.', 'error')
        return false
      }
    }
    setBusy(true)
    try {
      showNotification(`${label}: confirm in your wallet…`, 'info', 0)
      const tx = await makeTx()
      // Spec 043 (US3): in vault mode makeTx returns a pending proposal (no on-chain tx to await).
      if (tx?.kind === 'proposed' || tx?.proposed) {
        showNotification(`${label} proposed to your vault — awaiting co-owner approval.`, 'success')
        await loadProposals()
        return true
      }
      showNotification(`${label} submitted — awaiting confirmation…`, 'info', 0)
      await tx.wait(1, CONFIRM_TIMEOUT_MS)
      showNotification(`${label} confirmed${tx?.hash ? ` · tx ${short(tx.hash)}` : ''}.`, 'success')
      await loadProposals()
      return true
    } catch (e) {
      // A timeout is NOT a confirmed revert — the tx may still mine. Surface that honestly (and dismissably)
      // rather than claiming failure; busy is released by finally so the user can Refresh once it lands.
      if (e?.code === 'TIMEOUT') {
        showNotification(`${label} is taking longer than expected — it may still confirm. Check your wallet or the explorer, then Refresh.`, 'warning', 0)
      } else {
        showNotification(connector.explainTxError(e), 'error')
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  // Spec 043 (US3): build the tx factory for a management action — a normal signer call in personal mode, or
  // a threshold-gated vault proposal (via the connector's `encode`) when operating as a vault.
  const managedTx = (action, encodeArgs, personalFn) => async () => {
    if (operatingAsVault) {
      if (!canActAsVault) throw new Error("Switch to the vault's network to act as the vault.")
      if (typeof connector.encode !== 'function') {
        throw new Error('This DAO framework does not support acting as a vault yet.')
      }
      const { to, data } = connector.encode(record.dao, action, encodeArgs)
      return submitAsActive({ to, value: 0n, data })
    }
    return personalFn()
  }

  return (
    <div>
      <button type="button" className="cp-btn-link" onClick={onBack}>‹ Back</button>

      <div className="cp-card" style={{ marginTop: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <h2>{record.label || s?.name || 'External DAO'}</h2>
          <span className="cp-badge cp-badge-ext">External · {DAO_FRAMEWORK_LABEL[fw] || 'Unknown'}</span>
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
                <div className="cp-kv">
                  <span className="k">{t.label}{t.funding && <span className="cp-badge" style={{ marginLeft: '0.4rem' }} title="Spendable by proposal via its on-chain executor">Governable</span>}</span>
                  <code className="cp-mono">{short(t.address)}</code>
                </div>
                <div className="cp-kv"><span className="k">Native</span><span className="cp-mono">{t.native != null ? `${ethers.formatEther(t.native)} ${net?.nativeCurrency?.symbol || ''}` : '—'}</span></div>
                <div className="cp-kv"><span className="k">{t.usdcSymbol || 'USDC'}</span><span className="cp-mono">{fmtUsdc(t.usdc, t.usdcDecimals)}</span></div>
                {t.funding && <p className="cp-row-sub" style={{ marginTop: '0.2rem' }}>Fundable through a proposal (native {net?.nativeCurrency?.symbol || ''} only) — “Fund from treasury”.</p>}
                {explorerBase && <a className="cp-btn-link" href={`${explorerBase}/address/${t.address}`} target="_blank" rel="noreferrer">View ↗</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cp-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h4>Proposals</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!propsLoading && props.ok && props.kind && (
              <span className="cp-badge" title={props.partial ? 'Partial — some data beyond the scanned range may be missing' : `Source: ${SOURCE_LABEL[props.kind] || props.kind}`}>
                {SOURCE_LABEL[props.kind] || props.kind}{props.partial ? ' · partial' : ''}
              </span>
            )}
            <button type="button" className="cp-btn" onClick={loadProposals} disabled={propsLoading || busy}>Refresh</button>
          </div>
        </div>
        <p className="cp-intro" style={{ marginTop: '0.4rem' }}>
          {props.kind === 'subgraph'
            ? 'Indexed via The Graph. '
            : `Live on-chain scan (no subgraph on ${net?.name || 'this network'}). `}
          Actions are signed by your wallet and gated by the DAO's own rules.
        </p>

        <ProposalBuilder
          record={record}
          connector={connector}
          signer={signer}
          reader={reader}
          account={account}
          usdcAddress={usdcAddress}
          nativeSymbol={net?.nativeCurrency?.symbol}
          treasuries={treasuries}
          fundingSources={treasuries
            .filter((t) => t.funding)
            .map((t) => ({ executor: t.funding.executor, label: t.label, address: t.address, native: t.native }))}
          proposals={props.proposals}
          run={run}
          busy={busy}
          onSubmitted={loadProposals}
        />

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

        {props.proposals.map((p) => {
          const vs = voterStates[p.id]
          const timing = describeProposalTiming(p, props.scannedTo, s?.clockMode)
          const noPower = vs?.votingPower === '0'
          const canVote = p.state === 1 && !vs?.hasVoted && !noPower
          const eta = etas[p.id]
          const nowSec = Math.floor(nowMs / 1000)
          const executeWaitSecs = p.state === 5 && eta != null && nowSec < eta ? eta - nowSec : 0
          const executeReady = p.state === 5 && executeWaitSecs === 0
          return (
            <div key={p.id} className="cp-card" style={{ background: 'var(--cp-canvas)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="cp-row-name">{p.description ? p.description.slice(0, 80) : `Proposal ${short(p.id)}`}</span>
                <span className="cp-badge">{PROPOSAL_STATE_LABEL[p.state] ?? 'Unknown'}</span>
              </div>
              <div className="cp-row-sub" style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <CopyableId id={p.id} /> <span>· by {short(p.proposer)}</span>
              </div>

              {/* Timeline: proposed → voting window → outcome, with the live relative position. */}
              <div className="cp-timeline" aria-label="Proposal timeline">
                <span className="t is-done"><span className="dot" />Proposed</span>
                <span className={`t ${timing.phase === 'open' ? 'is-now' : timing.phase === 'closed' ? 'is-done' : ''}`}><span className="dot" />{timing.label}</span>
                <span className={`t ${p.state >= 2 && p.state !== 5 ? 'is-done' : ''}`}><span className="dot" />{PROPOSAL_STATE_LABEL[p.state] ?? '—'}</span>
              </div>

              {p.votes && (
                <div className="cp-row-sub" style={{ marginTop: '0.3rem' }}>
                  For {p.votes.for} · Against {p.votes.against} · Abstain {p.votes.abstain}
                </div>
              )}

              {/* Per-user voting state: receipt if voted, no-power note, or current voting power when eligible. */}
              {vs?.hasVoted && (
                <div style={{ marginTop: '0.5rem' }}>
                  <span className={`cp-voted ${vs.support === 1 ? 'is-for' : vs.support === 0 ? 'is-against' : ''}`}>
                    ✓ You voted{vs.support != null ? `: ${SUPPORT_LABEL[vs.support]}` : ''}
                  </span>
                </div>
              )}
              {p.state === 1 && !vs?.hasVoted && noPower && (
                <p className="cp-vote-note" style={{ marginTop: '0.5rem' }}>You had no voting power at the snapshot, so you can’t vote on this proposal.</p>
              )}
              {canVote && vs?.votingPower != null && vs.votingPower !== '0' && (
                <p className="cp-vote-note" style={{ marginTop: '0.5rem' }}>Your voting power: {vs.votingPower}</p>
              )}
              {executeWaitSecs > 0 && (
                <p className="cp-vote-note" style={{ marginTop: '0.5rem' }}>
                  Executable in {humanizeDelta(executeWaitSecs, true)} — the timelock delay must elapse before this proposal can run.
                </p>
              )}

              <div className="cp-row-actions" style={{ marginTop: '0.6rem' }}>
                {canVote && (
                  <>
                    <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => run('Vote For', managedTx('castVote', { proposalId: p.id, support: VOTE_SUPPORT.For }, () => connector.castVote(signer, record.dao, p.id, VOTE_SUPPORT.For)))}>Vote For</button>
                    <button type="button" className="cp-btn" disabled={busy} onClick={() => run('Vote Against', managedTx('castVote', { proposalId: p.id, support: VOTE_SUPPORT.Against }, () => connector.castVote(signer, record.dao, p.id, VOTE_SUPPORT.Against)))}>Against</button>
                    <button type="button" className="cp-btn" disabled={busy} onClick={() => run('Vote Abstain', managedTx('castVote', { proposalId: p.id, support: VOTE_SUPPORT.Abstain }, () => connector.castVote(signer, record.dao, p.id, VOTE_SUPPORT.Abstain)))}>Abstain</button>
                  </>
                )}
                {p.state === 4 && <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => run('Queue', managedTx('queue', { p }, () => connector.queue(signer, record.dao, p)))}>Queue</button>}
                {p.state === 5 && (
                  <button
                    type="button"
                    className="cp-btn cp-btn-primary"
                    disabled={busy || !executeReady}
                    aria-disabled={busy || !executeReady}
                    title={executeReady ? undefined : 'Waiting for the timelock delay to elapse'}
                    onClick={() => run('Execute', managedTx('execute', { p }, () => connector.execute(signer, record.dao, p)))}
                  >
                    Execute
                  </button>
                )}
                {explorerBase && <a className="cp-btn-link" href={`${explorerBase}/address/${record.dao}`} target="_blank" rel="noreferrer">Details ↗</a>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
