import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { WAGER_TAG_REGISTRY_ABI, TagStatus } from '../../abis/wagerTagRegistry'
import { getContractAddressForChain } from '../../config/contracts'
import { normalizeTag, isValidTag, formatTag } from '../../lib/tags/normalizeTag'
import { useTagRegistryMetrics } from '../../hooks/useTagRegistryMetrics'
import './TagRegistryAdmin.css'

/**
 * TagRegistryAdmin (spec 054 — operator admin) — the "Wager Tags" tab of the platform AdminPanel.
 *
 * Manages the on-chain %tag naming registry for the operator: live registry metrics from a bounded
 * event scan (no backend), moderation (suspend / verify / reserve — each gated on the caller's role
 * ON THIS contract, which has its OWN AccessControl separate from the main registry), policy-param
 * tuning, and role management. Every write goes through the parent's `runTx` (plain signer, like the
 * other admin tabs — admin actions are not gasless). Reads soft-fail; the tab degrades to a
 * "not deployed on this network" notice when the registry address is unset.
 *
 * Tab contract: { signer, account, contracts, chainId, runTx, pendingTx }.
 */

const STATUS_LABEL = {
  [TagStatus.NONE]: 'None',
  [TagStatus.ACTIVE]: 'Active',
  [TagStatus.REPOINTING]: 'Repointing',
  [TagStatus.QUARANTINED]: 'Quarantined',
  [TagStatus.SUSPENDED]: 'Suspended',
  [TagStatus.LAPSED_RECLAIMABLE]: 'Lapsed (reclaimable)',
}

const TIER_LABEL = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum']

// Policy params: bounds mirror the contract constants (seconds). Used for client-side validation +
// human hints so an operator doesn't submit a value the contract will just revert (ParamOutOfBounds).
const DAY = 86400
const POLICY_FIELDS = [
  { key: 'minCommitmentAge', label: 'Min commitment age', min: 60, max: DAY, hint: '1 min – 1 day' },
  { key: 'maxCommitmentAge', label: 'Max commitment age', min: 61, max: 7 * DAY, hint: '> min, ≤ 7 days' },
  { key: 'quarantinePeriod', label: 'Quarantine period', min: 30 * DAY, max: 365 * DAY, hint: '30 – 365 days' },
  { key: 'changeCooldown', label: 'Change cooldown', min: DAY, max: 365 * DAY, hint: '1 – 365 days' },
  { key: 'repointDelay', label: 'Repoint delay', min: DAY, max: 14 * DAY, hint: '24 h – 14 days' },
  { key: 'lapseGrace', label: 'Lapse grace', min: 30 * DAY, max: 3650 * DAY, hint: '30 – 3650 days' },
]

const shortHash = (h) => (h && h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h || '—')
const shortAddr = (a) => (a && ethers.isAddress(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '—')

function humanDuration(seconds) {
  const s = Number(seconds || 0)
  if (!s) return '—'
  if (s % DAY === 0) return `${s / DAY} day${s / DAY === 1 ? '' : 's'}`
  if (s % 3600 === 0) return `${s / 3600} hour${s / 3600 === 1 ? '' : 's'}`
  if (s % 60 === 0) return `${s / 60} min`
  return `${s}s`
}

export default function TagRegistryAdmin({ signer, account, contracts, chainId, runTx, pendingTx }) {
  const address = useMemo(
    () => getContractAddressForChain('wagerTagRegistry', chainId) || contracts?.wagerTagRegistry || '',
    [chainId, contracts],
  )
  const provider = signer?.provider || null
  const configured = Boolean(address && ethers.isAddress(address))

  const reader = useMemo(
    () => (configured && provider ? new ethers.Contract(address, WAGER_TAG_REGISTRY_ABI, provider) : null),
    [configured, address, provider],
  )
  const writer = useCallback(
    () => (configured && signer ? new ethers.Contract(address, WAGER_TAG_REGISTRY_ABI, signer) : null),
    [configured, address, signer],
  )

  // Roles the connected wallet holds ON THIS contract (its own AccessControl).
  const [roles, setRoles] = useState({ curator: false, moderator: false, verifier: false, admin: false })
  const [config, setConfig] = useState(null) // policy params + gate + wired contracts
  const [configError, setConfigError] = useState('')

  const metrics = useTagRegistryMetrics({ provider, chainId, address })

  // Moderation lookup + forms.
  const [tagInput, setTagInput] = useState('')
  const [lookup, setLookup] = useState(null) // { canonical, tagHash, owner, status, verified, reserved } | null
  const [lookupError, setLookupError] = useState('')
  const [policyForm, setPolicyForm] = useState(null)
  const [gateTier, setGateTier] = useState(3)
  const [roleForm, setRoleForm] = useState({ role: 'MODERATOR', address: '' })

  const loadConfig = useCallback(async () => {
    if (!reader || !account) return
    setConfigError('')
    try {
      const [
        curatorRole, moderatorRole, verifierRole, adminRole,
        membershipRole, minTier, membershipManager, sanctionsGuard,
        minCommitmentAge, maxCommitmentAge, quarantinePeriod, changeCooldown, repointDelay, lapseGrace,
      ] = await Promise.all([
        reader.REGISTRY_CURATOR_ROLE(), reader.MODERATOR_ROLE(), reader.VERIFIER_ROLE(), reader.DEFAULT_ADMIN_ROLE(),
        reader.membershipRole(), reader.minTier(), reader.membershipManager(), reader.sanctionsGuard(),
        reader.minCommitmentAge(), reader.maxCommitmentAge(), reader.quarantinePeriod(),
        reader.changeCooldown(), reader.repointDelay(), reader.lapseGrace(),
      ])
      const [curator, moderator, verifier, admin] = await Promise.all([
        reader.hasRole(curatorRole, account), reader.hasRole(moderatorRole, account),
        reader.hasRole(verifierRole, account), reader.hasRole(adminRole, account),
      ])
      setRoles({ curator, moderator, verifier, admin })
      const cfg = {
        roleHashes: { curator: curatorRole, moderator: moderatorRole, verifier: verifierRole, admin: adminRole },
        membershipRole,
        minTier: Number(minTier),
        membershipManager,
        sanctionsGuard,
        minCommitmentAge: Number(minCommitmentAge),
        maxCommitmentAge: Number(maxCommitmentAge),
        quarantinePeriod: Number(quarantinePeriod),
        changeCooldown: Number(changeCooldown),
        repointDelay: Number(repointDelay),
        lapseGrace: Number(lapseGrace),
      }
      setConfig(cfg)
      setPolicyForm(Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, String(cfg[f.key])])))
      setGateTier(cfg.minTier)
    } catch (err) {
      setConfigError(`Could not read registry config: ${err?.message || err}`)
    }
  }, [reader, account])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { if (configured && provider) metrics.refresh() /* initial, cache-backed */ }, [configured, provider]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Moderation lookup ----
  const doLookup = useCallback(async () => {
    setLookupError('')
    setLookup(null)
    if (!isValidTag(tagInput)) { setLookupError('Enter a valid tag (3–20 chars, a–z 0–9, single interior hyphens).'); return }
    if (!reader) { setLookupError('Registry not configured on this network.'); return }
    try {
      const canonical = normalizeTag(tagInput)
      const tagHash = ethers.id(canonical)
      const [info, isReserved] = await Promise.all([reader.getTagInfoByHash(tagHash), reader.reserved(tagHash)])
      setLookup({
        canonical,
        tagHash,
        owner: info.owner,
        status: Number(info.status),
        verified: Boolean(info.verified),
        reserved: Boolean(isReserved),
      })
    } catch (err) {
      setLookupError(`Lookup failed: ${err?.message || err}`)
    }
  }, [tagInput, reader])

  const afterWrite = useCallback(() => {
    loadConfig()
    if (lookup?.tagHash) doLookup().catch(() => {}) // refresh the open lookup only; don't spuriously error a policy/role action
    metrics.refresh({ force: true })
  }, [loadConfig, doLookup, metrics, lookup])

  // Route a write through the parent's runTx (plain signer), then refresh reads once it settles.
  // Promise.resolve tolerates a runTx that returns undefined; afterWrite is idempotent (pure re-reads).
  const submit = useCallback(
    (build, msg) => {
      const c = writer()
      if (!c) return
      Promise.resolve(runTx(() => build(c), msg)).finally(() => afterWrite())
    },
    [writer, runTx, afterWrite],
  )

  const onSuspend = (suspend) =>
    submit((c) => c.setSuspended(lookup.tagHash, suspend), `${suspend ? 'Suspend' : 'Unsuspend'} ${formatTag(lookup.canonical)}`)
  const onVerify = (verify) =>
    submit((c) => c.setVerified(lookup.tagHash, verify), `${verify ? 'Verify' : 'Unverify'} ${formatTag(lookup.canonical)}`)
  const onReserve = (reserve) =>
    submit((c) => c.setReserved([lookup.tagHash], reserve), `${reserve ? 'Reserve' : 'Unreserve'} ${formatTag(lookup.canonical)}`)

  // ---- Policy ----
  const policyInvalid = useMemo(() => {
    if (!policyForm) return true
    for (const f of POLICY_FIELDS) {
      const v = Number(policyForm[f.key])
      if (!Number.isFinite(v) || v < f.min || v > f.max) return true
    }
    return Number(policyForm.maxCommitmentAge) <= Number(policyForm.minCommitmentAge)
  }, [policyForm])

  const savePolicy = () => {
    if (policyInvalid) return
    const args = POLICY_FIELDS.map((f) => Number(policyForm[f.key]))
    submit((c) => c.setPolicyParams(...args), 'Update policy params')
  }

  const saveGate = () => {
    if (!config) return
    submit((c) => c.setMembershipGate(config.membershipRole, gateTier), `Set membership gate → ${TIER_LABEL[gateTier]}`)
  }

  // ---- Role management ----
  const onRoleGrant = (grant) => {
    if (!config) return
    const target = roleForm.address.trim()
    if (!ethers.isAddress(target)) return
    const roleHash = config.roleHashes[roleForm.role.toLowerCase()]
    submit(
      (c) => (grant ? c.grantRole(roleHash, target) : c.revokeRole(roleHash, target)),
      `${grant ? 'Grant' : 'Revoke'} ${roleForm.role} → ${shortAddr(target)}`,
    )
  }

  // ---- Render ----
  if (!configured) {
    return (
      <section aria-labelledby="tagadmin-heading">
        <h3 id="tagadmin-heading">Wager tag registry</h3>
        <p role="status">The wager tag registry is not deployed / configured on this network.</p>
      </section>
    )
  }

  const roleBadges = [
    roles.admin && 'Admin',
    roles.curator && 'Curator',
    roles.moderator && 'Moderator',
    roles.verifier && 'Verifier',
  ].filter(Boolean)

  const m = metrics.data

  return (
    <section aria-labelledby="tagadmin-heading" className="tag-admin">
      <h3 id="tagadmin-heading">Wager tag registry</h3>
      <p className="tag-admin__addr">
        Registry: <span title={address}>{shortAddr(address)}</span>
        {roleBadges.length ? (
          <span className="tag-admin__roles"> — your roles: {roleBadges.map((r) => (
            <span key={r} className="tag-admin__badge">{r}</span>
          ))}</span>
        ) : (
          <span className="tag-admin__roles"> — you hold no operator role on this registry (reads only).</span>
        )}
      </p>
      {configError && <p role="alert" className="tag-admin__error">{configError}</p>}

      {/* -------------------- Metrics -------------------- */}
      <div className="admin-card">
        <div className="tag-admin__card-head">
          <h4 id="tagadmin-metrics">Metrics</h4>
          <button type="button" className="confirm-btn" onClick={() => metrics.refresh({ force: true })} disabled={metrics.loading}>
            {metrics.loading ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
        {metrics.error && <p role="alert" className="tag-admin__error">Metrics scan failed: {metrics.error}</p>}
        {!m && !metrics.loading && !metrics.error && <p role="status">No metrics loaded yet.</p>}
        {m && (
          <>
            <div className="tag-admin__tiles" aria-labelledby="tagadmin-metrics">
              <Tile label={m.truncated ? 'Net registrations (window)' : 'Active tags'} value={m.netRegistrations} />
              <Tile label="Registrations" value={m.counts.registered} />
              <Tile label="Changes" value={m.counts.changed} />
              <Tile label="Releases" value={m.counts.released} />
              <Tile label="Reclaims" value={m.counts.reclaimed} />
              <Tile label="Repoints (final)" value={m.counts.repointFinalized} />
              <Tile label="Suspended" value={m.suspended.length} />
              <Tile label="Verified" value={m.verified.length} />
              <Tile label="Reserved" value={m.reserved.length} />
            </div>
            {m.truncated && (
              <p role="note" className="tag-admin__note">
                Showing the most recent block window only — lifetime tallies are for the scanned range,
                not all-time. Query the chain directly (or a future subgraph) for the full history.
              </p>
            )}
            <TagChipList title="Currently suspended" items={m.suspended} empty="None suspended." />
            <TagChipList title="Currently verified" items={m.verified} empty="None verified." />
            <TagChipList title="Currently reserved" items={m.reserved} empty="None reserved (in window)." />

            <h5>Recent activity</h5>
            {m.recent.length === 0 ? (
              <p role="status">No recent registry events in the scanned window.</p>
            ) : (
              <div className="tag-admin__table-wrap">
                <table>
                  <caption className="sr-only">Recent wager-tag registry events (newest first)</caption>
                  <thead>
                    <tr><th scope="col">Event</th><th scope="col">Tag / hash</th><th scope="col">Account</th><th scope="col">Block</th></tr>
                  </thead>
                  <tbody>
                    {m.recent.map((e, i) => (
                      <tr key={`${e.type}-${e.block}-${i}`}>
                        <td>{e.type.replace(/^Tag/, '')}</td>
                        <td title={e.tagHash || ''}>{e.tag ? formatTag(e.tag) : shortHash(e.tagHash)}</td>
                        <td title={e.owner || ''}>{shortAddr(e.owner)}</td>
                        <td>{e.block}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* -------------------- Moderation -------------------- */}
      <div className="admin-card">
        <h4 id="tagadmin-moderation">Moderation</h4>
        <p>Look up a tag, then suspend / verify / reserve it. Each action is gated on-chain by the matching role.</p>
        <div className="tag-admin__lookup">
          <label htmlFor="tagadmin-tag">Tag</label>
          <div className="tag-admin__input-row">
            <span aria-hidden="true" className="tag-admin__prefix">%</span>
            <input
              id="tagadmin-tag"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.replace(/^%+/, ''))}
              placeholder="chipprbots"
              autoComplete="off"
              spellCheck="false"
            />
            <button type="button" className="confirm-btn" onClick={doLookup} disabled={pendingTx}>Look up</button>
          </div>
        </div>
        {lookupError && <p role="alert" className="tag-admin__error">{lookupError}</p>}
        {lookup && (
          <div className="tag-admin__lookup-result" role="group" aria-label="Tag status">
            <p>
              <strong>{formatTag(lookup.canonical)}</strong> — status <strong>{STATUS_LABEL[lookup.status] ?? lookup.status}</strong>
              {lookup.verified ? <span className="tag-admin__badge">Verified</span> : null}
              {lookup.reserved ? <span className="tag-admin__badge">Reserved</span> : null}
              <br />
              Owner: <span title={lookup.owner}>{lookup.owner === ethers.ZeroAddress ? '— (unregistered)' : shortAddr(lookup.owner)}</span>
              <br />
              <code className="tag-admin__hash">{lookup.tagHash}</code>
            </p>
            <div className="tag-admin__mod-actions">
              <button type="button" className="confirm-btn danger" disabled={!roles.moderator || pendingTx}
                onClick={() => onSuspend(lookup.status !== TagStatus.SUSPENDED)}>
                {lookup.status === TagStatus.SUSPENDED ? 'Unsuspend' : 'Suspend'}
              </button>
              <button type="button" className="confirm-btn" disabled={!roles.verifier || pendingTx}
                onClick={() => onVerify(!lookup.verified)}>
                {lookup.verified ? 'Remove verification' : 'Verify'}
              </button>
              <button type="button" className="confirm-btn" disabled={!roles.curator || pendingTx}
                onClick={() => onReserve(!lookup.reserved)}>
                {lookup.reserved ? 'Unreserve' : 'Reserve'}
              </button>
            </div>
            {!roles.moderator && !roles.verifier && !roles.curator && (
              <p role="note" className="tag-admin__note">You hold no moderation role on this registry — actions are disabled.</p>
            )}
          </div>
        )}
      </div>

      {/* -------------------- Policy (admin) -------------------- */}
      {roles.admin && config && policyForm && (
        <div className="admin-card">
          <h4 id="tagadmin-policy">Policy parameters</h4>
          <div className="tag-admin__policy-grid">
            {POLICY_FIELDS.map((f) => (
              <div key={f.key} className="tag-admin__policy-field">
                <label htmlFor={`policy-${f.key}`}>{f.label} <span className="tag-admin__hint">({f.hint})</span></label>
                <input
                  id={`policy-${f.key}`}
                  type="number"
                  value={policyForm[f.key]}
                  min={f.min}
                  max={f.max}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, [f.key]: e.target.value }))}
                />
                <span className="tag-admin__hint">= {humanDuration(policyForm[f.key])} (now {humanDuration(config[f.key])})</span>
              </div>
            ))}
          </div>
          <button type="button" className="confirm-btn primary" onClick={savePolicy} disabled={policyInvalid || pendingTx}>
            {pendingTx ? 'Saving…' : 'Save policy'}
          </button>

          <h5>Membership gate</h5>
          <p>Minimum tier required to register a tag (hard-floored at Gold). Current: <strong>{TIER_LABEL[config.minTier]}</strong>.</p>
          <div className="tag-admin__gate-row">
            <label htmlFor="tagadmin-gate">Minimum tier</label>
            <select id="tagadmin-gate" value={gateTier} onChange={(e) => setGateTier(Number(e.target.value))}>
              <option value={3}>Gold</option>
              <option value={4}>Platinum</option>
            </select>
            <button type="button" className="confirm-btn" onClick={saveGate} disabled={pendingTx || gateTier === config.minTier}>
              Set gate
            </button>
          </div>
          <p className="tag-admin__hint">
            Membership manager: <span title={config.membershipManager}>{shortAddr(config.membershipManager)}</span> ·
            Sanctions guard: {config.sanctionsGuard === ethers.ZeroAddress ? 'disabled' : <span title={config.sanctionsGuard}>{shortAddr(config.sanctionsGuard)}</span>}
          </p>
        </div>
      )}

      {/* -------------------- Roles (admin) -------------------- */}
      {roles.admin && config && (
        <div className="admin-card">
          <h4 id="tagadmin-roles">Operator roles</h4>
          <p>Grant or revoke the registry's operator roles for an address (requires the registry admin role).</p>
          <div className="tag-admin__role-form">
            <label htmlFor="tagadmin-role">Role</label>
            <select id="tagadmin-role" value={roleForm.role} onChange={(e) => setRoleForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="CURATOR">Curator (reserve terms)</option>
              <option value="MODERATOR">Moderator (suspend)</option>
              <option value="VERIFIER">Verifier (verification badge)</option>
            </select>
            <label htmlFor="tagadmin-role-addr">Address</label>
            <input
              id="tagadmin-role-addr"
              type="text"
              value={roleForm.address}
              onChange={(e) => setRoleForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="0x…"
              autoComplete="off"
            />
            <div className="tag-admin__mod-actions">
              <button type="button" className="confirm-btn primary" onClick={() => onRoleGrant(true)} disabled={pendingTx || !ethers.isAddress(roleForm.address.trim())}>Grant</button>
              <button type="button" className="confirm-btn danger" onClick={() => onRoleGrant(false)} disabled={pendingTx || !ethers.isAddress(roleForm.address.trim())}>Revoke</button>
            </div>
          </div>
          <p className="tag-admin__hint">Role hashes are the keccak256 of the role names; the curator role also administers the reserved list.</p>
        </div>
      )}
    </section>
  )
}

function Tile({ label, value }) {
  return (
    <div className="tag-admin__tile">
      <span className="tag-admin__tile-value">{value}</span>
      <span className="tag-admin__tile-label">{label}</span>
    </div>
  )
}

function TagChipList({ title, items, empty }) {
  return (
    <div className="tag-admin__chiplist">
      <h5>{title} ({items.length})</h5>
      {items.length === 0 ? (
        <p role="status" className="tag-admin__hint">{empty}</p>
      ) : (
        <ul className="tag-admin__chips">
          {items.map((it) => (
            <li key={it.tagHash} className="tag-admin__chip" title={it.tagHash}>
              {it.tag ? formatTag(it.tag) : shortHash(it.tagHash)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
