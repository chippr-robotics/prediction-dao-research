// Spec 043 (US1) — load an existing vault by address. Distinguishes "not a contract", "not a Safe", and a
// real Safe (owned vs view-only is derived after load). Delegates the chain read to onLoad.
//
// Spec 068 (US5) — address entry goes through the shared Protect field (paste, address book, QR).
// Spec 068 also makes loading CROSS-CHAIN: `onLoad` searches every custody network, so a member
// pasting a vault address does not have to already know which chain it is on (and does not have to
// hop networks to find out). The result states which network it was found on, and when the same
// address is a Safe on several, all of them are offered rather than one silently chosen.

import { useState } from 'react'
import { NETWORKS } from '../../config/networks'
import CustodyAddressField from './CustodyAddressField'

const chainName = (id) => NETWORKS[Number(id)]?.name || `Chain ${Number(id)}`

export default function LoadVaultForm({ onLoad, onDone, chainId }) {
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const handleLoad = async (preferredChainId) => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const vault = await onLoad(address.trim(), label, 0, { preferredChainId })
      setResult(vault)
      // Hold the form open while the member decides between multiple networks; closing it would
      // silently commit them to whichever one we happened to pick.
      if (!(vault.matches?.length > 1)) onDone?.(vault)
    } catch (e) {
      setError(e?.message || 'Could not load that address')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="custody-load" onSubmit={(e) => e.preventDefault()} aria-label="Load a vault by address">
      <CustodyAddressField
        id="load-address"
        label="Vault address"
        value={address}
        onChange={setAddress}
        chainId={chainId}
      />
      <div className="custody-field">
        <label htmlFor="load-label">Label (private, on this device)</label>
        <input id="load-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>

      {error && (
        <p className="custody-error" role="alert">
          {error}
        </p>
      )}
      {result?.isSafe && (
        <p className="custody-predicted" role="status">
          Found on <strong>{chainName(result.chainId)}</strong>: {result.owner ? 'a vault you co-own' : 'a view-only vault'}{' '}
          with {result.owners.length} owners and a {result.threshold}-of-{result.owners.length} threshold
          {result.version ? ` (Safe ${result.version})` : ''}.
        </p>
      )}

      {result?.matches?.length > 1 && (
        <div className="custody-warning" role="status">
          <p>
            This address is a Safe on {result.matches.length} networks. {chainName(result.chainId)} was added — pick
            another to add it instead:
          </p>
          <div className="custody-actions">
            {result.matches
              .filter((m) => Number(m.chainId) !== Number(result.chainId))
              .map((m) => (
                <button key={m.chainId} type="button" onClick={() => handleLoad(m.chainId)} disabled={busy}>
                  Use {chainName(m.chainId)}
                </button>
              ))}
          </div>
        </div>
      )}

      {result?.unreachable?.length > 0 && (
        <p className="custody-hint" role="status">
          {result.unreachable.map((u) => chainName(u.chainId)).join(', ')} could not be reached, so this address was
          not checked there.
        </p>
      )}

      <div className="custody-actions">
        <button type="button" onClick={() => handleLoad()} disabled={!address.trim() || busy}>
          {busy ? 'Searching all networks…' : 'Load vault'}
        </button>
      </div>
    </form>
  )
}
