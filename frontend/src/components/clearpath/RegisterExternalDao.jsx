import { useState } from 'react'
import { ethers } from 'ethers'
import { DAO_FRAMEWORK_LABEL } from '../../abis/externalDAORegistry'
import { detectFramework, getConnector } from './connectors'
import CpAddressField from './CpAddressField'

// Spec 030 + 042 — register/track an existing DAO deployed by another platform. Validation is framework-aware:
// it detects OpenZeppelin Governor vs GovernorBravo client-side (a fast mirror of the on-chain probe) before
// tracking. On a network with an on-chain registry (Mordor) tracking is a real register tx; on a registry-less
// network (Ethereum mainnet) it is a device-local add — either way ClearPath takes no custody; you sign every
// governance action. The contract / DAO's own rules remain the source of truth.

export default function RegisterExternalDao({ reader, track, hasRegistry, onRegistered }) {
  const [addr, setAddr] = useState('')
  const [label, setLabel] = useState('')
  const [check, setCheck] = useState(null) // { ok, name, framework, reason }
  const [busy, setBusy] = useState(false)

  async function doValidate() {
    setCheck(null)
    const target = addr.trim()
    if (!ethers.isAddress(target)) {
      setCheck({ ok: false, reason: 'Not a valid address.' })
      return
    }
    const framework = await detectFramework(reader, target)
    if (framework === 'unknown') {
      setCheck({ ok: false, reason: 'Not a recognized governance contract (OpenZeppelin Governor or Governor Bravo).' })
      return
    }
    // Use the matched connector's richer validate for the on-chain name, when available.
    const conn = getConnector(framework)
    const result = conn?.validate ? await conn.validate(reader, target) : { ok: true, name: '' }
    const next = { ...result, ok: result.ok !== false, framework }
    setCheck(next)
    if (next.ok && !label) setLabel(next.name || '')
  }

  async function doTrack() {
    setBusy(true)
    try {
      await track({ address: addr.trim(), framework: check?.framework ?? null, label: label.trim() })
      setAddr('')
      setLabel('')
      setCheck(null)
      onRegistered?.()
    } catch {
      /* notification already surfaced by the hook */
    } finally {
      setBusy(false)
    }
  }

  const valid = check?.ok === true
  const actionLabel = hasRegistry ? 'Register DAO' : 'Track DAO'

  return (
    <div className="cp-card">
      <h4 style={{ marginBottom: '0.6rem' }}>{hasRegistry ? 'Register an external DAO' : 'Track a DAO'}</h4>
      <p className="cp-intro">
        Track and (where authorized) act on a DAO deployed by another platform — an OpenZeppelin Governor (e.g.
        ENS, Olympia) or a Governor Bravo DAO (e.g. Uniswap). ClearPath takes no custody or authority; you sign
        every action.
        {hasRegistry
          ? ' Registering records it on-chain for shared discovery (requires a Silver+ membership).'
          : ' This network has no on-chain registry, so the DAO is tracked on this device.'}
      </p>
      <CpAddressField id="cp-dao-addr" label="Governor address" value={addr} onChange={setAddr} disabled={busy} />
      <div className="cp-field">
        <label className="cp-label" htmlFor="cp-dao-label">Label (optional)</label>
        <input id="cp-dao-label" className="cp-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Uniswap" />
      </div>
      <div className="cp-row-actions">
        <button type="button" className="cp-btn" disabled={!ethers.isAddress(addr.trim())} onClick={doValidate}>Validate</button>
        <button type="button" className="cp-btn cp-btn-primary" disabled={!valid || busy} onClick={doTrack}>
          {busy ? `${actionLabel.replace(/ DAO$/, '')}ing…` : actionLabel}
        </button>
      </div>
      {check && (
        check.ok
          ? (
            <p className="cp-ok" role="status" style={{ marginTop: '0.6rem' }}>
              ✓ Recognized {DAO_FRAMEWORK_LABEL[check.framework] || 'governance'} contract{check.name ? `: ${check.name}` : ''}
            </p>
          )
          : <div className="cp-error" role="alert">{check.reason}</div>
      )}
    </div>
  )
}
