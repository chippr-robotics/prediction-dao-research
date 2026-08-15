/**
 * Spec 085 — reconnect a saved hardware account into a live device-backed signer so the app can
 * "act as" it. The dialog mirrors LegacyUnlockDialog: the switcher opens it with the entry, the
 * member confirms on the device, and on success the HardwareSigner is handed back to the caller,
 * which passes it to CustodyContext.operateAsHardware — the session lives in memory only.
 */

import { useCallback, useContext, useState } from 'react'
import PropTypes from 'prop-types'
// WalletContext is read directly with a null fallback (the useEffectiveAccount pattern) so hosts
// rendered in isolated component tests — where no WalletProvider is mounted — do not hard-crash.
import { WalletContext } from '../../contexts/WalletContext'
// Strict lookup, deliberately not getNetwork() — no default-network fallback (specs 068/071).
import { NETWORKS } from '../../config/networks'
import { getReadProvider } from '../../utils/rpcProvider'
import { connectHardwareAccount } from '../../lib/hardware/connectAccount'
import { reportHardwareError } from '../../lib/hardware/errors'
import { VENDOR_LABELS } from '../../lib/hardware/adapters'
import ActionSheet from './ActionSheet'
import './LegacyKeyRecoveryPanel.css'

const shortAddr = (a) => (a ? `${a.substring(0, 6)}…${a.substring(a.length - 4)}` : '')

export default function HardwareConnectDialog({ open, entry, onClose, onConnected, deps = {} }) {
  const chainId = useContext(WalletContext)?.chainId ?? null
  const [phase, setPhase] = useState('idle') // idle | connecting
  const [error, setError] = useState(null)

  const vendorLabel = VENDOR_LABELS[entry?.vendor] || 'hardware wallet'
  const networkName = (chainId != null && NETWORKS[chainId]?.name) || 'this network'

  const close = useCallback(() => {
    if (phase === 'connecting') return
    setError(null)
    onClose?.()
  }, [phase, onClose])

  const doConnect = useCallback(async () => {
    if (!entry) return
    setError(null)
    setPhase('connecting')
    try {
      const connect = deps.connectAccount ?? connectHardwareAccount
      const provider = deps.provider ?? (chainId != null ? getReadProvider(chainId) : null)
      const signer = await connect({ entry, provider })
      setPhase('idle')
      onConnected?.(signer)
    } catch (e) {
      setPhase('idle')
      setError(reportHardwareError(e, 'hardware-connect'))
    }
  }, [entry, chainId, deps, onConnected])

  const busy = phase === 'connecting'

  return (
    <ActionSheet open={open} onClose={close} title="Connect your device" closeDisabled={busy}>
      <div className="recover-step">
        <p>
          Act as <code>{shortAddr(entry?.address)}</code> — every action will be confirmed on your{' '}
          {vendorLabel} screen while the app signs with this account on {networkName}.
        </p>
        <p className="recover-step__hint">
          {entry?.vendor === 'ledger'
            ? 'Plug in the device, unlock it, and open the Ethereum app.'
            : 'Plug in the device and approve the connection in the Trezor window.'}
        </p>
        {error && (
          <p role="alert" className="lkr-notice lkr-notice--error">
            {error}
          </p>
        )}
        <div className="recover-step__actions">
          <button type="button" className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={doConnect} disabled={busy}>
            {busy ? 'Check the device…' : 'Connect'}
          </button>
        </div>
      </div>
    </ActionSheet>
  )
}

HardwareConnectDialog.propTypes = {
  open: PropTypes.bool,
  entry: PropTypes.object,
  onClose: PropTypes.func,
  onConnected: PropTypes.func,
  /** Test seam: { connectAccount, provider } */
  deps: PropTypes.object,
}
