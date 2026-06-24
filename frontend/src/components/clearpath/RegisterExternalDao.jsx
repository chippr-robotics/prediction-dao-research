import { useState } from 'react'
import { ethers } from 'ethers'
import { DAO_FRAMEWORK } from '../../abis/externalDAORegistry'
import { validateGovernor } from './governorConnector'
import CpAddressField from './CpAddressField'

// Spec 030 (US3) — register an existing DAO deployed by another platform. Validates client-side (a fast mirror
// of the on-chain ERC-165/IGovernor check) before the real register tx; the contract is the source of truth.

export default function RegisterExternalDao({ reader, register, onRegistered }) {
  const [addr, setAddr] = useState('')
  const [label, setLabel] = useState('')
  const [check, setCheck] = useState(null) // { ok, name, reason }
  const [busy, setBusy] = useState(false)

  async function doValidate() {
    setCheck(null)
    const result = await validateGovernor(reader, addr.trim())
    setCheck(result)
    if (result.ok && !label) setLabel(result.name || '')
  }

  async function doRegister() {
    setBusy(true)
    try {
      await register({ dao: addr.trim(), framework: DAO_FRAMEWORK.OZGovernor, label: label.trim() })
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

  return (
    <div className="cp-card">
      <h4 style={{ marginBottom: '0.6rem' }}>Register an external DAO</h4>
      <p className="cp-intro">
        Track and (where authorized) act on a DAO deployed by another platform — e.g. an OpenZeppelin Governor DAO
        like Olympia. ClearPath takes no custody or authority; you sign every action. Requires a Silver+ membership.
      </p>
      <CpAddressField id="cp-dao-addr" label="Governor address" value={addr} onChange={setAddr} disabled={busy} />
      <div className="cp-field">
        <label className="cp-label" htmlFor="cp-dao-label">Label (optional)</label>
        <input id="cp-dao-label" className="cp-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Olympia DAO" />
      </div>
      <div className="cp-row-actions">
        <button type="button" className="cp-btn" disabled={!ethers.isAddress(addr.trim())} onClick={doValidate}>Validate</button>
        <button type="button" className="cp-btn cp-btn-primary" disabled={!valid || busy} onClick={doRegister}>
          {busy ? 'Registering…' : 'Register DAO'}
        </button>
      </div>
      {check && (
        check.ok
          ? <p className="cp-ok" role="status" style={{ marginTop: '0.6rem' }}>✓ Recognized governance contract{check.name ? `: ${check.name}` : ''}</p>
          : <div className="cp-error" role="alert">{check.reason}</div>
      )}
    </div>
  )
}
