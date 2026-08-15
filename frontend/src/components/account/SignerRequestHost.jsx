/**
 * Spec 088 — the ONE place a deferred signing ceremony renders. Mounted globally (App.jsx), it
 * watches the custody broker's `signerRequest` and shows the right dialog at the moment a
 * signature is actually needed: passphrase/biometric unlock for a recovered account, device
 * connect for a hardware account. Completing the ceremony resolves the pending action (the
 * send that triggered it continues); dismissing it cancels that action with a stated reason.
 *
 * Switching accounts never renders these dialogs anymore — the acting identity is address-only
 * (view, receive, navigate). Only value leaving the account summons this host.
 */

import { useContext, useMemo, useEffect } from 'react'
import { CustodyContext } from '../../contexts/CustodyContext'
import { WalletContext } from '../../contexts/WalletContext'
import { legacyKeyVault } from '../../lib/recovery/legacyKeys'
import { hardwareWalletVault } from '../../lib/hardware/hardwareAccounts'
import LegacyUnlockDialog from './LegacyUnlockDialog'
import HardwareConnectDialog from './HardwareConnectDialog'

export default function SignerRequestHost() {
  const custody = useContext(CustodyContext)
  const wallet = useContext(WalletContext)
  const signerRequest = custody?.signerRequest ?? null
  const owner = wallet?.address ?? null
  const chainId = wallet?.chainId ?? null

  // Resolve the ceremony entry from (acting address, connected owner) — both stores are keyed
  // by the owner and case-insensitive on the account address.
  const entry = useMemo(() => {
    if (!signerRequest || !owner) return null
    try {
      return signerRequest.mode === 'legacy'
        ? legacyKeyVault(owner).get(signerRequest.address)
        : hardwareWalletVault(owner).get(signerRequest.address)
    } catch {
      return null
    }
  }, [signerRequest, owner])

  // A request for an account this owner no longer has saved cannot be fulfilled — fail the
  // pending action with the reason instead of showing a dialog over a missing entry.
  useEffect(() => {
    if (signerRequest && !entry) {
      custody?.cancelSignerRequest?.('This account is no longer saved on this device.')
    }
  }, [signerRequest, entry, custody])

  if (!signerRequest || !entry) return null

  const onClose = () => custody.cancelSignerRequest('Signing was cancelled.')

  if (signerRequest.mode === 'legacy') {
    return (
      <LegacyUnlockDialog
        open
        entry={entry}
        onClose={onClose}
        onUnlocked={(signer) => custody.attachActingSigner(signer, chainId)}
      />
    )
  }
  return (
    <HardwareConnectDialog
      open
      entry={entry}
      onClose={onClose}
      onConnected={(signer) => custody.attachActingSigner(signer, chainId)}
    />
  )
}
