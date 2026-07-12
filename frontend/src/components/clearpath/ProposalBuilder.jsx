import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { ERC20_BALANCE_ABI } from '../../abis/externalDAORegistry'
import { ACTION_TYPE, newAction, assemble, predictProposalId } from './proposalEncoding'
import CpAddressField from './CpAddressField'
import CpBottomSheet from './CpBottomSheet'

// Spec 030 (US5, FR-023/024/025) — rich Governor proposal builder. Compose a proposal from named action types
// (send native / send token / custom call), multiple actions, asset-aware human amounts — no hand-written
// calldata for the common cases. Live preview of each encoded call + the exact arrays submitted. Pre-sign
// guards: non-blocking over-treasury warning; duplicate-proposal detection; the DAO's own revert surfaced.

const ERC20_TRANSFER_IFACE = new ethers.Interface(['function transfer(address to, uint256 amount)'])
const EXECUTE_TREASURY_IFACE = new ethers.Interface(['function executeTreasury(address recipient, uint256 amount)'])
const EXECUTE_TREASURY_SELECTOR = EXECUTE_TREASURY_IFACE.getFunction('executeTreasury').selector
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

export default function ProposalBuilder({ record, connector, signer, reader, account, usdcAddress, nativeSymbol, treasuries = [], fundingSources = [], proposals = [], run, busy, onSubmitted }) {
  // Spec 041/050: a passkey smart-account session has no ethers signer — propose goes through `sendCalls`
  // (one sponsored ERC-4337 UserOp) instead of `connector.propose(signer, ...)`. `loginMethod` picks the rail.
  const { sendCalls, loginMethod } = useWallet()
  const isPasskey = loginMethod === 'passkey'
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [actions, setActions] = useState([newAction(ACTION_TYPE.TOKEN)])
  const [tokenMeta, setTokenMeta] = useState({}) // addr(lc) → { decimals, symbol } | { unreadable:true }
  const [showPayload, setShowPayload] = useState(false)

  // Resolve token decimals/symbol: USDC from the treasury read (no extra RPC); other ERC-20s read live.
  const metaFn = useCallback(
    (addr) => {
      const lc = String(addr).toLowerCase()
      if (tokenMeta[lc]) return tokenMeta[lc] // { decimals, symbol } OR { unreadable:true } → encoder shows a real error
      if (usdcAddress && lc === usdcAddress.toLowerCase()) {
        const u = treasuries.find((t) => t.usdcDecimals != null) // any vault carries the USDC meta (stamped identically)
        if (u) return { decimals: u.usdcDecimals, symbol: u.usdcSymbol || 'USDC' }
      }
      return null
    },
    [tokenMeta, usdcAddress, treasuries]
  )

  useEffect(() => {
    if (!reader) return undefined
    let cancelled = false
    const needed = [
      ...new Set(
        actions
          .filter((a) => a.type === ACTION_TYPE.TOKEN)
          .map((a) => (a.tokenAddress.trim() || usdcAddress || '').toLowerCase())
          .filter(
            (addr) =>
              ethers.isAddress(addr) &&
              !tokenMeta[addr] &&
              !(usdcAddress && addr === usdcAddress.toLowerCase() && treasuries[0])
          )
      ),
    ]
    if (!needed.length) return undefined
    ;(async () => {
      const updates = {}
      for (const addr of needed) {
        try {
          const c = new ethers.Contract(addr, ERC20_BALANCE_ABI, reader)
          const [dec, sym] = await Promise.all([c.decimals(), c.symbol().catch(() => 'TOKEN')])
          updates[addr] = { decimals: Number(dec), symbol: sym }
        } catch {
          updates[addr] = { unreadable: true }
        }
      }
      if (!cancelled) setTokenMeta((m) => ({ ...m, ...updates }))
    })()
    return () => { cancelled = true }
  }, [actions, usdcAddress, reader, tokenMeta, treasuries])

  const A = useMemo(
    () => assemble({ title, body, actions, usdcAddress, meta: metaFn }),
    [title, body, actions, usdcAddress, metaFn]
  )
  const anyPending = A.perAction.some((p) => p.pending)
  const valid = A.ok && !anyPending

  // Pre-sign guards: over-treasury (warn, allow) + duplicate proposal (block submit — it would revert).
  // Measure the spend against the DAO's TOTAL holdings across ALL known treasuries (timelock + vaults), not
  // just the timelock. A Governor's funds commonly live in a separate vault while its timelock holds ~0, so a
  // timelock-only check false-warns on every spend (it reads 0 and flags any positive amount). USDC meta is
  // stamped identically across vaults, so summing `usdc` is apples-to-apples.
  const nativeHeld = treasuries.reduce((sum, t) => sum + (t.native ?? 0n), 0n)
  const usdcHeld = treasuries.reduce((sum, t) => sum + (t.usdc ?? 0n), 0n)
  const anyNativeKnown = treasuries.some((t) => t.native != null)
  const anyUsdcKnown = treasuries.some((t) => t.usdc != null)
  const usdcSymbol = treasuries.find((t) => t.usdcSymbol)?.usdcSymbol || 'USDC'
  // "Fund from treasury" actions draw native from the governable vault(s), not the timelock — checked against
  // the funding sources' own balance.
  const treasuryHeld = fundingSources.reduce((sum, f) => sum + (f.native ?? 0n), 0n)
  let nativeTotal = 0n
  let usdcTotal = 0n
  let treasuryTotal = 0n
  for (const p of A.perAction) {
    if (!p.encoded) continue
    if (p.encoded.calldata.startsWith(EXECUTE_TREASURY_SELECTOR)) {
      try { const [, amt] = EXECUTE_TREASURY_IFACE.decodeFunctionData('executeTreasury', p.encoded.calldata); treasuryTotal += amt } catch { /* not a treasury fund */ }
      continue
    }
    nativeTotal += p.encoded.value
    if (usdcAddress && p.encoded.target.toLowerCase() === usdcAddress.toLowerCase()) {
      try { const [, amt] = ERC20_TRANSFER_IFACE.decodeFunctionData('transfer', p.encoded.calldata); usdcTotal += amt } catch { /* not a transfer */ }
    }
  }
  // Only warn once balances are known, and only when the spend truly exceeds total DAO holdings.
  const overNative = valid && anyNativeKnown && nativeTotal > nativeHeld
  const overUsdc = valid && anyUsdcKnown && usdcTotal > usdcHeld
  const overTreasury = valid && fundingSources.length > 0 && treasuryTotal > treasuryHeld
  // FR-025 duplicate pre-check: an identical action set + description hashes to the same id as a live proposal.
  // This id derivation is OpenZeppelin-Governor-specific (keccak of targets/values/calldatas/descriptionHash).
  // GovernorBravo assigns SEQUENTIAL ids, so the payload can't predict them — skip the pre-check for Bravo (it
  // never fabricates; the DAO's own propose() still guards against a live duplicate from the same proposer).
  const supportsIdPrediction = (connector?.framework ?? record?.framework) === 0
  const dupId = valid && supportsIdPrediction ? predictProposalId(A.targets, A.values, A.calldatas, A.descriptionHash) : null
  const isDuplicate = !!dupId && proposals.some((p) => p.id === dupId)

  function setAction(id, patch) {
    setActions((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }
  function addAction() {
    setActions((arr) => [...arr, newAction(ACTION_TYPE.TOKEN)])
  }
  function removeAction(id) {
    setActions((arr) => (arr.length <= 1 ? arr : arr.filter((a) => a.id !== id)))
  }
  function reset() {
    setTitle(''); setBody(''); setActions([newAction(ACTION_TYPE.TOKEN)]); setShowPayload(false)
  }
  function submit() {
    // Route through the DAO's own connector so the framework-correct propose() is used (OZ:
    // targets/values/calldatas/description; Bravo: adds the parallel `signatures` array). Only reset/close/reload
    // on a CONFIRMED tx — a reverted propose must not look like success (US5 #9).
    const proposal = { targets: A.targets, values: A.values, calldatas: A.calldatas, description: A.description }
    // Spec 041/050 passkey rail: `connector.encode` yields the SAME framework-correct propose calldata as the
    // signer path (the connector owns the OZ vs Bravo signature), sent as one sponsored UserOp via `sendCalls`.
    // `sendCalls` already awaits inclusion, so the returned `wait` is a no-op that keeps `run()`'s wait happy.
    const makeTx = isPasskey
      ? async () => {
          if (typeof connector.encode !== 'function') throw new Error('This DAO framework does not support passkey accounts yet.')
          if (typeof sendCalls !== 'function') throw new Error('This wallet cannot act on the current transaction rail.')
          const { to, data } = connector.encode(record.dao, 'propose', proposal)
          const sent = await sendCalls([{ target: to, data, value: 0n }])
          return { hash: sent?.txHash ?? sent?.userOpHash ?? sent?.intentId, wait: async () => {} }
        }
      : () => connector.propose(signer, record.dao, proposal)
    run('Propose', makeTx).then((ok) => { if (ok) { reset(); setOpen(false); onSubmitted?.() } })
  }

  // "Fund from treasury" is offered FIRST when the DAO has a governable (executor-gated) vault; the generic
  // actions stay available for the common pattern.
  const typeOptions = fundingSources.length
    ? [{ v: ACTION_TYPE.TREASURY, label: 'Fund from treasury' }, ...TYPE_OPTIONS]
    : TYPE_OPTIONS

  // On open, for a DAO with a governable treasury, pre-select "Fund from treasury" if the single action is still
  // the pristine default — non-destructive, and steers the member to the workflow that actually funds.
  function openBuilder() {
    if (fundingSources.length && actions.length === 1) {
      const a0 = actions[0]
      if (a0.type === ACTION_TYPE.TOKEN && !a0.tokenTo && !a0.tokenAmount && !a0.treasuryTo && !a0.treasuryAmount) {
        setActions([{ ...a0, type: ACTION_TYPE.TREASURY, treasuryExecutor: fundingSources[0].executor }])
      }
    }
    setOpen(true)
  }

  return (
    <>
      <div style={{ marginBottom: '0.8rem' }}>
        <button type="button" className="cp-btn cp-btn-primary" onClick={openBuilder}>+ New proposal</button>
      </div>

      <CpBottomSheet open={open} onClose={() => { reset(); setOpen(false) }} title="New proposal">
      <div className="cp-field">
        <label className="cp-label" htmlFor="cp-prop-title">Title</label>
        <input id="cp-prop-title" className="cp-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fund core development" />
      </div>
      <div className="cp-field">
        <label className="cp-label" htmlFor="cp-prop-body">Description (Markdown)</label>
        <textarea id="cp-prop-body" className="cp-input cp-textarea" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What this proposal does and why." />
      </div>

      {fundingSources.length > 0 && (
        <p className="cp-row-sub" style={{ marginBottom: '0.6rem' }}>
          This DAO spends from its treasury via an on-chain executor — use <strong>Fund from treasury</strong> to
          disburse native {nativeSymbol}. Generic sends draw from the timelock.
        </p>
      )}

      <div className="cp-action-head">
        <h4 style={{ margin: 0 }}>Actions</h4>
        <span className="cp-badge">{actions.length} action{actions.length === 1 ? '' : 's'}</span>
        <button type="button" className="cp-btn" onClick={addAction}>+ Add action</button>
      </div>

      {actions.map((a, i) => (
        <ActionCard
          key={a.id}
          index={i}
          action={a}
          diag={A.perAction[i]}
          meta={metaFn}
          usdcAddress={usdcAddress}
          nativeSymbol={nativeSymbol}
          canRemove={actions.length > 1}
          account={account}
          typeOptions={typeOptions}
          fundingSources={fundingSources}
          onChange={(patch) => setAction(a.id, patch)}
          onRemove={() => removeAction(a.id)}
        />
      ))}

      {/* Summary + guards */}
      <div className="cp-card" role="region" aria-label="Proposal summary" style={{ marginTop: '0.6rem' }}>
        <div className="cp-kv"><span className="k">Actions</span><span>{actions.length}</span></div>
        <div className="cp-kv"><span className="k">Total native value</span><span className="cp-mono">{ethers.formatEther(nativeTotal)} {nativeSymbol || ''}</span></div>
        {overNative && <div className="cp-warn" role="status">Sends more {nativeSymbol} than the treasury holds. The proposal can still be created; execution will revert if not funded by then.</div>}
        {overUsdc && <div className="cp-warn" role="status">Sends more {usdcSymbol} than the treasury holds. The proposal can still be created; execution will revert if not funded.</div>}
        {overTreasury && <div className="cp-warn" role="status">Funds more {nativeSymbol} than the treasury vault holds. The proposal can still be created; execution will revert if not funded.</div>}
        {isDuplicate && <div className="cp-error" role="alert">This exact proposal already exists (id {dupId.length > 14 ? `${dupId.slice(0, 8)}…${dupId.slice(-4)}` : dupId}). Submitting it would revert — change an action or the description.</div>}
        {!valid && <p className="cp-row-sub">{anyPending ? 'Reading token details…' : 'Add a title/description and at least one valid action to submit.'}</p>}

        <details className="cp-section" open={showPayload} onToggle={(e) => setShowPayload(e.target.open)}>
          <summary className="cp-btn-link" style={{ cursor: 'pointer' }}>Exact payload to submit</summary>
          <div className="cp-preview cp-mono" style={{ marginTop: '0.4rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {`targets:   ${JSON.stringify(A.targets)}
values:    ${JSON.stringify(A.values.map((v) => v.toString()))}
calldatas: ${JSON.stringify(A.calldatas)}
descriptionHash: ${A.descriptionHash}
${dupId ? `proposalId: ${dupId}` : ''}`}
          </div>
        </details>

        <div className="cp-row-actions" style={{ marginTop: '0.6rem' }}>
          {(signer || isPasskey) ? (
            <button type="button" className="cp-btn cp-btn-primary" disabled={!valid || busy || isDuplicate} aria-disabled={!valid || busy || isDuplicate} onClick={submit}>Submit proposal</button>
          ) : (
            <span className="cp-notice">Connect a wallet to propose.</span>
          )}
          <button type="button" className="cp-btn" onClick={() => { reset(); setOpen(false) }}>Cancel</button>
        </div>
      </div>
      </CpBottomSheet>
    </>
  )
}

const TYPE_OPTIONS = [
  { v: ACTION_TYPE.TOKEN, label: 'Send USDC / token' },
  { v: ACTION_TYPE.NATIVE, label: 'Send native coin' },
  { v: ACTION_TYPE.CUSTOM, label: 'Custom call (advanced)' },
]

function ActionCard({ index, action, diag, meta, usdcAddress, nativeSymbol, canRemove, account, typeOptions = TYPE_OPTIONS, fundingSources = [], onChange, onRemove }) {
  const a = action
  const useDefaultUsdc = a.tokenMode !== 'other'
  const tokenAddr = useDefaultUsdc ? (usdcAddress || '') : a.tokenAddress.trim()
  const tokenMeta = a.type === ACTION_TYPE.TOKEN && tokenAddr ? meta(tokenAddr) : null
  const tokenSym = tokenMeta?.symbol || (useDefaultUsdc ? 'USDC' : 'token')
  // Switching to "Fund from treasury" auto-selects the (only / first) governable source's executor.
  const onType = (v) =>
    onChange(v === ACTION_TYPE.TREASURY ? { type: ACTION_TYPE.TREASURY, treasuryExecutor: a.treasuryExecutor || fundingSources[0]?.executor || '' } : { type: v })

  return (
    <div className="cp-card" style={{ background: 'var(--cp-surface)' }}>
      <div className="cp-action-head">
        <span className="cp-badge">#{index + 1}</span>
        <label className="sr-only" htmlFor={`cp-act-type-${a.id}`}>Action {index + 1} type</label>
        <select id={`cp-act-type-${a.id}`} className="cp-input cp-select" value={a.type} onChange={(e) => onType(e.target.value)} style={{ maxWidth: '14rem' }}>
          {typeOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        {canRemove && <button type="button" className="cp-btn" aria-label={`Remove action ${index + 1}`} onClick={onRemove}>✕</button>}
      </div>

      {a.type === ACTION_TYPE.TREASURY && (
        <>
          {fundingSources.length > 1 ? (
            <div className="cp-field">
              <label className="cp-label" htmlFor={`f-${a.id}-tsrc`}>Treasury</label>
              <select id={`f-${a.id}-tsrc`} className="cp-input cp-select" value={a.treasuryExecutor} onChange={(e) => onChange({ treasuryExecutor: e.target.value })}>
                {fundingSources.map((f) => <option key={f.executor} value={f.executor}>{f.label}</option>)}
              </select>
            </div>
          ) : (
            <p className="cp-row-sub">From {fundingSources[0]?.label || 'the treasury'} · native {nativeSymbol} via its on-chain executor.</p>
          )}
          <CpAddressField id={`f-${a.id}-trto`} label="Recipient" value={a.treasuryTo} onChange={(v) => onChange({ treasuryTo: v })} selfAddress={account} />
          <div className="cp-field"><label className="cp-label" htmlFor={`f-${a.id}-tramt`}>Amount<span className="cp-suffix">{nativeSymbol}</span></label><input id={`f-${a.id}-tramt`} className="cp-input cp-mono" value={a.treasuryAmount} onChange={(e) => onChange({ treasuryAmount: e.target.value })} placeholder="0.0" /></div>
        </>
      )}

      {a.type === ACTION_TYPE.NATIVE && (
        <>
          <CpAddressField id={`f-${a.id}-nto`} label="Recipient" value={a.nativeTo} onChange={(v) => onChange({ nativeTo: v })} selfAddress={account} />
          <div className="cp-field"><label className="cp-label" htmlFor={`f-${a.id}-namt`}>Amount<span className="cp-suffix">{nativeSymbol}</span></label><input id={`f-${a.id}-namt`} className="cp-input cp-mono" value={a.nativeAmount} onChange={(e) => onChange({ nativeAmount: e.target.value })} placeholder="0.0" /></div>
        </>
      )}

      {a.type === ACTION_TYPE.TOKEN && (
        <>
          <div className="cp-field">
            <label className="cp-label" htmlFor={`f-${a.id}-tsel`}>Token</label>
            <select id={`f-${a.id}-tsel`} className="cp-input cp-select" value={useDefaultUsdc ? 'usdc' : 'other'} onChange={(e) => onChange(e.target.value === 'usdc' ? { tokenMode: 'usdc', tokenAddress: '' } : { tokenMode: 'other' })}>
              <option value="usdc">USDC (treasury default)</option>
              <option value="other">Other ERC-20…</option>
            </select>
          </div>
          {!useDefaultUsdc && <CpAddressField id={`f-${a.id}-taddr`} label="Token address" value={a.tokenAddress} onChange={(v) => onChange({ tokenAddress: v })} hint="The ERC-20 contract to transfer (not the recipient)." />}
          <CpAddressField id={`f-${a.id}-tto`} label="Recipient" value={a.tokenTo} onChange={(v) => onChange({ tokenTo: v })} selfAddress={account} />
          <div className="cp-field"><label className="cp-label" htmlFor={`f-${a.id}-tamt`}>Amount<span className="cp-suffix">{tokenSym}</span></label><input id={`f-${a.id}-tamt`} className="cp-input cp-mono" value={a.tokenAmount} onChange={(e) => onChange({ tokenAmount: e.target.value })} placeholder="0.0" /></div>
        </>
      )}

      {a.type === ACTION_TYPE.CUSTOM && (
        <>
          <p className="cp-row-sub">Advanced — encode the call yourself.</p>
          <CpAddressField id={`f-${a.id}-ctgt`} label="Target contract" value={a.customTarget} onChange={(v) => onChange({ customTarget: v })} />
          <div className="cp-field"><label className="cp-label" htmlFor={`f-${a.id}-cval`}>Value<span className="cp-suffix">{nativeSymbol}</span></label><input id={`f-${a.id}-cval`} className="cp-input cp-mono" value={a.customValue} onChange={(e) => onChange({ customValue: e.target.value })} placeholder="0" /></div>
          <div className="cp-field"><label className="cp-label" htmlFor={`f-${a.id}-ccd`}>Calldata</label><input id={`f-${a.id}-ccd`} className="cp-input cp-mono" value={a.customCalldata} onChange={(e) => onChange({ customCalldata: e.target.value })} placeholder="0x" /></div>
        </>
      )}

      <div className="cp-preview" aria-live="polite">
        {diag?.error && <span className="cp-error" role="alert">{diag.error}</span>}
        {diag?.pending && <span>{diag.message}</span>}
        {diag?.encoded && <ActionPreview type={a.type} enc={diag.encoded} nativeSymbol={nativeSymbol} tokenSym={tokenSym} />}
      </div>
    </div>
  )
}

function ActionPreview({ type, enc, nativeSymbol, tokenSym }) {
  if (type === ACTION_TYPE.TREASURY) {
    let to = '—'
    let amt = '0'
    try {
      const [t, a] = EXECUTE_TREASURY_IFACE.decodeFunctionData('executeTreasury', enc.calldata)
      to = short(t)
      amt = ethers.formatEther(a)
    } catch { /* */ }
    return <span>Fund {amt} {nativeSymbol} → {to} · from treasury via {short(enc.target)}</span>
  }
  if (type === ACTION_TYPE.NATIVE) {
    return <span>Send {ethers.formatEther(enc.value)} {nativeSymbol} → {short(enc.target)}</span>
  }
  if (type === ACTION_TYPE.TOKEN) {
    let to = '—'
    let amt = ''
    try {
      const [t, a] = ERC20_TRANSFER_IFACE.decodeFunctionData('transfer', enc.calldata)
      to = short(t)
      amt = a.toString()
    } catch { /* */ }
    return <span>Transfer {tokenSym} (raw {amt}) → {to} · via {short(enc.target)}</span>
  }
  return <span>Call {short(enc.target)} · value {ethers.formatEther(enc.value)} {nativeSymbol} · calldata {enc.calldata.length > 12 ? `${enc.calldata.slice(0, 12)}…` : enc.calldata}</span>
}
