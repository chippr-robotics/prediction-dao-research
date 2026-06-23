import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { TOKEN_STANDARD_LABEL } from '../../abis/tokenFactory'
import {
  useTokenFactory,
  tokenRuleSummary,
  v2AbiForStandard,
  v1AbiForStandard,
  TOKEN_STANDARD,
} from './useTokenFactory'

// Spec 028 (US2/US6–US9, FR-028/SC-014) — per-token detail + administration. Detects the token's model (v2
// role-based vs v1 Ownable) + the caller's authority, and renders ONLY valid, authorized controls across
// sub-tabs. Every action is a real on-chain tx with honest pending/confirmed/failed state. No mock data.

const ROLE_LABELS = [
  { id: ethers.ZeroHash, name: 'Owner (admin)' },
  { id: ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE')), name: 'Minter' },
  { id: ethers.keccak256(ethers.toUtf8Bytes('PAUSER_ROLE')), name: 'Pauser' },
  { id: ethers.keccak256(ethers.toUtf8Bytes('BURNER_ROLE')), name: 'Burner' },
  { id: ethers.keccak256(ethers.toUtf8Bytes('COMPLIANCE_ROLE')), name: 'Compliance' },
]

export default function TokenDetailView({ token, onBack }) {
  const { signer } = useWallet()
  const { detectCapabilities, readTokenLive, reader } = useTokenFactory()

  const [caps, setCaps] = useState(null)
  const [live, setLive] = useState(null)
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [refresh, setRefresh] = useState(0)

  const std = token?.standard
  const isErc721 = std === TOKEN_STANDARD.OPEN_ERC721
  const isRestricted = std === TOKEN_STANDARD.RESTRICTED_ERC1404

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) return
      try {
        const [c, l] = await Promise.all([detectCapabilities(token), readTokenLive(token)])
        if (!cancelled) {
          setCaps(c)
          setLive(l)
        }
      } catch (e) {
        if (!cancelled) setError(e?.shortMessage || e?.message || 'Could not read token state.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, detectCapabilities, readTokenLive, refresh])

  const contractFor = useCallback(
    (withSigner) => {
      const abi = caps?.model === 'v2' ? v2AbiForStandard(std) : v1AbiForStandard(std)
      return new ethers.Contract(token.tokenAddress, abi, withSigner ? signer : reader)
    },
    [caps, std, token, signer, reader]
  )

  const run = useCallback(
    async (label, fn) => {
      if (!signer) return setError('Connect a wallet to administer this token.')
      setStatus('working')
      setError(null)
      setNotice(null)
      try {
        const tx = await fn(contractFor(true))
        await tx.wait()
        setStatus('idle')
        setNotice(`${label} confirmed.`)
        setRefresh((n) => n + 1)
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.reason || e?.message || `${label} failed.`)
      }
    },
    [signer, contractFor]
  )

  const tabs = useMemo(() => {
    const t = [{ id: 'overview', label: 'Overview' }]
    if (!isErc721) t.push({ id: 'supply', label: 'Supply' })
    t.push({ id: 'controls', label: 'Transfer controls' })
    if (isRestricted) t.push({ id: 'compliance', label: 'Compliance' })
    t.push({ id: 'roles', label: 'Roles & ownership' })
    t.push({ id: 'contract', label: 'Contract' })
    return t
  }, [isErc721, isRestricted])

  if (!token) return null
  const busy = status === 'working'
  const isAdmin = caps?.isAdmin
  const roles = caps?.roles || {}

  return (
    <div className="token-detail-view">
      <button type="button" className="tm-btn-link" onClick={onBack}>‹ Back</button>

      {/* Identity header */}
      <div className="tm-detail-head" style={{ marginTop: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', minWidth: 0 }}>
          <span className="tm-monogram" style={{ width: 48, height: 48, fontSize: '1rem' }}>{token.symbol.slice(0, 2).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h2>{token.name}</h2>
              <span className={`tm-badge ${badgeClass(std)}`}>{TOKEN_STANDARD_LABEL[std]}</span>
              {caps && <span className="tm-badge" style={{ background: 'var(--tm-canvas)', color: 'var(--tm-text-3)' }}>{caps.model === 'v2' ? 'Role-based' : 'Owner-managed'}</span>}
            </div>
            <div className="tm-row-sub" style={{ marginTop: '0.4rem' }}>{token.symbol} · {short(token.tokenAddress)}</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="tm-summary" style={{ marginTop: '0.9rem' }}>
        <div className="tm-stat"><div className="tm-stat-label">Supply</div><div className="tm-stat-value" style={{ fontSize: '1.1rem' }}>{live?.supplyDisplay ?? '…'}</div></div>
        <div className="tm-stat"><div className="tm-stat-label">Your role</div><div className="tm-stat-value" style={{ fontSize: '1.1rem' }}>{isAdmin ? 'Admin' : caps ? 'Viewer' : '…'}</div></div>
        <div className="tm-stat"><div className="tm-stat-label">Status</div><div className="tm-stat-value" style={{ fontSize: '1.1rem' }}>{live?.paused ? 'Paused' : 'Active'}</div></div>
        <div className="tm-stat"><div className="tm-stat-label">Supply cap</div><div className="tm-stat-value" style={{ fontSize: '1.1rem' }}>{caps ? (caps.capped ? ethers.formatUnits(caps.cap, caps.decimals) : 'Uncapped') : '…'}</div></div>
      </div>

      {!isAdmin && caps && (
        <div className="tm-notice" role="status">You’re viewing this token read-only — administrative actions require the appropriate role and are rejected on-chain otherwise.</div>
      )}
      {error && <div className="tm-error" role="alert">{error}</div>}
      {notice && <div className="tm-success" role="status">{notice}</div>}

      {/* Sub-tabs */}
      <div className="tm-detail-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tm-detail-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="tm-grid-2" role="tabpanel">
          <div className="tm-card">
            <h4 style={{ marginBottom: '0.6rem' }}>Governing rules</h4>
            <p className="tm-intro" style={{ margin: 0 }}>{tokenRuleSummary(token)}</p>
            {caps?.capped && (
              <div className="tm-section">
                <div className="tm-stat-label">Supply vs. cap</div>
                <CapBar live={live} caps={caps} />
              </div>
            )}
          </div>
          <div className="tm-card">
            <h4 style={{ marginBottom: '0.6rem' }}>Contract details</h4>
            <div className="tm-kv"><span className="k">Standard</span><span>{TOKEN_STANDARD_LABEL[std]}</span></div>
            <div className="tm-kv"><span className="k">Address</span><code>{short(token.tokenAddress)}</code></div>
            <div className="tm-kv"><span className="k">Issuer</span><code>{short(token.issuer)}</code></div>
            <div className="tm-kv"><span className="k">Model</span><span>{caps?.model === 'v2' ? 'Role-based (AccessControl)' : 'Owner-managed (Ownable)'}</span></div>
          </div>
        </div>
      )}

      {tab === 'supply' && !isErc721 && (
        <SupplyPanel caps={caps} live={live} run={run} busy={busy} canMint={caps?.model === 'v2' ? roles.minter : isAdmin} canBurn={caps?.model === 'v2' ? roles.burner : isAdmin} />
      )}

      {tab === 'controls' && (
        <ControlsPanel token={token} caps={caps} live={live} contractFor={contractFor} run={run} busy={busy} isErc721={isErc721} isRestricted={isRestricted}
          canPause={caps?.model === 'v2' ? roles.pauser : isAdmin} canFreeze={caps?.model === 'v2' ? (isRestricted ? roles.compliance : roles.admin) : isAdmin} />
      )}

      {tab === 'compliance' && isRestricted && (
        <CompliancePanel token={token} caps={caps} contractFor={contractFor} run={run} busy={busy} canManage={caps?.model === 'v2' ? roles.compliance : isAdmin} />
      )}

      {tab === 'roles' && (
        <RolesPanel token={token} caps={caps} contractFor={contractFor} run={run} busy={busy} isAdmin={isAdmin} />
      )}

      {tab === 'contract' && (
        <ContractPanel token={token} caps={caps} />
      )}
    </div>
  )
}

// ---- helpers ----
function short(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '' }
function badgeClass(std) {
  if (std === TOKEN_STANDARD.OPEN_ERC721) return 'tm-badge-erc721'
  if (std === TOKEN_STANDARD.RESTRICTED_ERC1404) return 'tm-badge-erc1404'
  return 'tm-badge-erc20'
}

function CapBar({ live, caps }) {
  let pct = 0
  try {
    const supply = parseFloat((live?.supplyDisplay || '0').split(' ')[0]) || 0
    const cap = parseFloat(ethers.formatUnits(caps.cap, caps.decimals)) || 0
    pct = cap > 0 ? Math.min(100, Math.round((supply / cap) * 100)) : 0
  } catch { pct = 0 }
  return (
    <>
      <div className="tm-progress" style={{ marginTop: '0.4rem' }}><span style={{ width: `${pct}%` }} /></div>
      <div className="tm-row-sub" style={{ marginTop: '0.4rem' }}>{pct}% of cap used</div>
    </>
  )
}

function SupplyPanel({ caps, live, run, busy, canMint, canBurn }) {
  const [to, setTo] = useState('')
  const [amt, setAmt] = useState('')
  const [burnFrom, setBurnFrom] = useState('')
  const [burnAmt, setBurnAmt] = useState('')
  const d = caps?.decimals ?? 18
  return (
    <div className="tm-grid-2" role="tabpanel">
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Mint</h4>
        <div className="tm-field"><label className="tm-label">Recipient</label><input className="tm-input tm-mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" /></div>
        <div className="tm-field"><label className="tm-label">Amount</label><input className="tm-input tm-mono" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.0" /></div>
        <button type="button" className="tm-btn tm-btn-primary" disabled={busy || !canMint} onClick={() => run('Mint', (c) => c.mint(to, ethers.parseUnits(String(amt || '0'), d)))}>Mint</button>
        {caps?.capped && <p className="tm-std-desc" style={{ marginTop: '0.6rem' }}>Cap: {ethers.formatUnits(caps.cap, d)} · current {live?.supplyDisplay}</p>}
      </div>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Burn</h4>
        {caps?.model === 'v2' ? (
          <>
            <div className="tm-field"><label className="tm-label">From (admin clawback)</label><input className="tm-input tm-mono" value={burnFrom} onChange={(e) => setBurnFrom(e.target.value)} placeholder="0x…" /></div>
            <div className="tm-field"><label className="tm-label">Amount</label><input className="tm-input tm-mono" value={burnAmt} onChange={(e) => setBurnAmt(e.target.value)} placeholder="0.0" /></div>
            <button type="button" className="tm-btn tm-btn-danger" disabled={busy || !canBurn} onClick={() => run('Burn', (c) => c.adminBurn(burnFrom, ethers.parseUnits(String(burnAmt || '0'), d)))}>Burn</button>
            <p className="tm-std-desc" style={{ marginTop: '0.6rem' }}>Holders can also burn their own balance.</p>
          </>
        ) : (
          <p className="tm-intro" style={{ margin: 0 }}>Holders burn their own balance (no admin clawback on this token).</p>
        )}
      </div>
    </div>
  )
}

function ControlsPanel({ caps, contractFor, run, busy, isErc721, isRestricted, canPause, canFreeze }) {
  const [addr, setAddr] = useState('')
  const [frozen, setFrozen] = useState([])
  const [elig, setElig] = useState(true)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const c = contractFor(false)
        const count = caps?.model === 'v2' || isRestricted ? Number(await c.frozenCount().catch(() => 0)) : 0
        const list = []
        for (let i = 0; i < count; i++) list.push(await c.frozenAt(i))
        if (caps?.model === 'v2' && isRestricted) {
          try { setElig(await c.eligibilityEnforced()) } catch { /* ignore */ }
        }
        if (!cancelled) setFrozen(list)
      } catch { if (!cancelled) setFrozen([]) }
    }
    load()
    return () => { cancelled = true }
  }, [caps, contractFor, isRestricted, busy])

  return (
    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Pause</h4>
        <p className="tm-intro" style={{ margin: '0 0 0.6rem' }}>When paused, all transfers, mints and burns are blocked at the contract level.</p>
        <div className="tm-row-actions">
          <button type="button" className="tm-btn" disabled={busy || !canPause} onClick={() => run('Pause', (c) => c.pause())}>Pause</button>
          <button type="button" className="tm-btn" disabled={busy || !canPause} onClick={() => run('Unpause', (c) => c.unpause())}>Unpause</button>
        </div>
      </div>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Freeze addresses</h4>
        <div className="tm-field"><label className="tm-label">Address</label><input className="tm-input tm-mono" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" /></div>
        <div className="tm-row-actions">
          <button type="button" className="tm-btn" disabled={busy || !canFreeze} onClick={() => run('Freeze', (c) => c.setFrozen(addr, true))}>Freeze</button>
          <button type="button" className="tm-btn" disabled={busy || !canFreeze} onClick={() => run('Unfreeze', (c) => c.setFrozen(addr, false))}>Unfreeze</button>
        </div>
        {frozen.length > 0 && (
          <div className="tm-section">
            <div className="tm-stat-label">Currently frozen</div>
            {frozen.map((f) => <div key={f} className="tm-mono" style={{ fontSize: '0.78rem', padding: '0.25rem 0' }}>{f}</div>)}
          </div>
        )}
      </div>
      {isRestricted && caps?.model === 'v2' && (
        <div className="tm-card">
          <h4 style={{ marginBottom: '0.5rem' }}>Allowlist enforcement</h4>
          <p className="tm-intro" style={{ margin: '0 0 0.6rem' }}>Eligibility allowlist is currently {elig ? 'ENFORCED' : 'NOT enforced'}. Sanctions, pause and freeze always apply.</p>
          <button type="button" className="tm-btn" disabled={busy || !canFreeze} onClick={() => run('Toggle eligibility', (c) => c.setEligibilityEnforced(!elig))}>{elig ? 'Disable allowlist' : 'Enable allowlist'}</button>
        </div>
      )}
      {isErc721 && <p className="tm-std-desc">NFT collections support pause + freeze (no fungible supply controls).</p>}
    </div>
  )
}

function CompliancePanel({ contractFor, run, busy, canManage }) {
  const [addr, setAddr] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [check, setCheck] = useState(null)
  const [msg, setMsg] = useState('')
  async function doCheck() {
    try {
      const c = contractFor(false)
      const code = Number(await c.detectTransferRestriction(from, to, 1))
      const m = await c.messageForTransferRestriction(code)
      setCheck({ code, m })
    } catch (e) { setCheck({ code: -1, m: e?.shortMessage || 'check failed' }) }
  }
  return (
    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Eligibility allowlist</h4>
        <div className="tm-field"><label className="tm-label">Address</label><input className="tm-input tm-mono" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" /></div>
        <div className="tm-row-actions">
          <button type="button" className="tm-btn tm-btn-primary" disabled={busy || !canManage} onClick={() => run('Add to allowlist', (c) => c.setEligible(addr, true))}>Mark eligible</button>
          <button type="button" className="tm-btn tm-btn-danger" disabled={busy || !canManage} onClick={() => run('Revoke', (c) => c.setEligible(addr, false))}>Revoke</button>
        </div>
      </div>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Eligibility pre-check</h4>
        <div className="tm-field"><label className="tm-label">From</label><input className="tm-input tm-mono" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="0x…" /></div>
        <div className="tm-field"><label className="tm-label">To</label><input className="tm-input tm-mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" /></div>
        <button type="button" className="tm-btn" onClick={doCheck}>Check</button>
        {check && <p className="tm-row-sub" role="status" style={{ marginTop: '0.6rem' }}>Code {check.code}: {check.m}</p>}
      </div>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Default restriction message</h4>
        <div className="tm-field"><input className="tm-input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Transfer not permitted…" /></div>
        <button type="button" className="tm-btn" disabled={busy || !canManage} onClick={() => run('Update message', (c) => c.setDefaultRestrictionMessage(msg))}>Update message</button>
      </div>
    </div>
  )
}

function RolesPanel({ caps, contractFor, run, busy, isAdmin }) {
  const [members, setMembers] = useState([])
  const [roleSel, setRoleSel] = useState(ROLE_LABELS[1].id)
  const [grantAddr, setGrantAddr] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const isV2 = caps?.model === 'v2'

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isV2) return
      try {
        const c = contractFor(false)
        const out = []
        for (const r of ROLE_LABELS) {
          // COMPLIANCE only on restricted; skip if call reverts
          let count = 0
          try { count = Number(await c.getRoleMemberCount(r.id)) } catch { count = 0 }
          for (let i = 0; i < count; i++) out.push({ role: r.name, addr: await c.getRoleMember(r.id, i) })
        }
        if (!cancelled) setMembers(out)
      } catch { if (!cancelled) setMembers([]) }
    }
    load()
    return () => { cancelled = true }
  }, [isV2, contractFor, busy])

  return (
    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {isV2 ? (
        <div className="tm-card">
          <h4 style={{ marginBottom: '0.6rem' }}>Administrative roles</h4>
          {members.map((m, i) => (
            <div key={i} className="tm-kv"><span>{m.role}</span><code>{short(m.addr)}</code></div>
          ))}
          <div className="tm-section">
            <div className="tm-row-actions" style={{ alignItems: 'flex-end' }}>
              <div className="tm-field" style={{ marginBottom: 0 }}>
                <label className="tm-label">Role</label>
                <select className="tm-input" value={roleSel} onChange={(e) => setRoleSel(e.target.value)}>
                  {ROLE_LABELS.slice(1).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <input className="tm-input tm-mono" value={grantAddr} onChange={(e) => setGrantAddr(e.target.value)} placeholder="0x… address" style={{ flex: 1 }} />
              <button type="button" className="tm-btn tm-btn-primary" disabled={busy || !isAdmin} onClick={() => run('Grant role', (c) => c.grantRole(roleSel, grantAddr))}>Grant</button>
              <button type="button" className="tm-btn tm-btn-danger" disabled={busy || !isAdmin} onClick={() => run('Revoke role', (c) => c.revokeRole(roleSel, grantAddr))}>Revoke</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="tm-card"><p className="tm-intro" style={{ margin: 0 }}>This token is owner-managed (single owner) — it has no scoped roles.</p></div>
      )}

      <div className="tm-grid-2">
        <div className="tm-card">
          <h4 style={{ marginBottom: '0.5rem' }}>Transfer ownership</h4>
          <div className="tm-field"><input className="tm-input tm-mono" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x… new owner" /></div>
          <button type="button" className="tm-btn" disabled={busy || !isAdmin} onClick={() => run('Ownership transfer', (c) => c.transferOwnership(newOwner))}>Transfer ownership</button>
        </div>
        {isV2 && (
          <div className="tm-card" style={{ borderColor: 'color-mix(in srgb, var(--semantic-loss, #c0492f) 40%, var(--tm-border))' }}>
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--semantic-loss, #c0492f)' }}>Renounce ownership</h4>
            <p className="tm-intro" style={{ margin: '0 0 0.6rem' }}>Permanently give up control. No one will ever administer this token again. Irreversible.</p>
            <button type="button" className="tm-btn tm-btn-danger" disabled={busy || !isAdmin}
              onClick={() => { if (window.confirm('Permanently renounce ownership? This cannot be undone.')) run('Renounce ownership', (c) => c.renounceOwnership()) }}>
              Renounce ownership
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ContractPanel({ token, caps }) {
  const [copied, setCopied] = useState('')
  function copy(text, what) {
    try { navigator.clipboard?.writeText(text); setCopied(what) } catch { /* ignore */ }
  }
  return (
    <div className="tm-grid-2" role="tabpanel">
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.6rem' }}>Contract metadata</h4>
        <div className="tm-kv"><span className="k">Standard</span><span>{TOKEN_STANDARD_LABEL[token.standard]}</span></div>
        <div className="tm-kv"><span className="k">Address</span><code>{token.tokenAddress}</code></div>
        <div className="tm-kv"><span className="k">Model</span><span>{caps?.model === 'v2' ? 'Role-based (AccessControl)' : 'Owner-managed (Ownable)'}</span></div>
        {caps && !caps.standard === TOKEN_STANDARD.OPEN_ERC721 && <div className="tm-kv"><span className="k">Decimals</span><span className="tm-mono">{caps.decimals}</span></div>}
        {caps?.capped && <div className="tm-kv"><span className="k">Cap</span><span className="tm-mono">{ethers.formatUnits(caps.cap, caps.decimals)}</span></div>}
      </div>
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.6rem' }}>Copy</h4>
        <div className="tm-row-actions">
          <button type="button" className="tm-btn" onClick={() => copy(token.tokenAddress, 'address')}>Copy address</button>
        </div>
        {copied && <p className="tm-row-sub" role="status" style={{ marginTop: '0.5rem' }}>Copied {copied}.</p>}
      </div>
    </div>
  )
}
