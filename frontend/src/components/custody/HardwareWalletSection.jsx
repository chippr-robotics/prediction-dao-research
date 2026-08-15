/**
 * Spec 085 — Protect ▸ Off chain: cold storage with hardware wallets. Replaces the reserved
 * placeholder (spec 043) with the saved hardware accounts and the guided add flow (FR-001).
 *
 * The list is public metadata only (address, vendor, path, label). Removing an entry forgets the
 * REFERENCE — the device still controls the funds — and the confirm says exactly that (FR-008).
 * Both add and remove are audited to the client ledger and toasted (FR-007).
 */

import { useCallback, useContext, useState } from 'react'
import PropTypes from 'prop-types'
import { useWallet } from '../../hooks/useWalletManagement'
// UIContext is read with a no-op fallback so the Protect shell still renders in isolated
// component tests that mount no UIProvider (toasts are additive, never load-bearing).
import { UIContext } from '../../contexts/UIContext'
import { useHardwareAccounts } from '../../hooks/useHardwareAccounts'
import { hardwareWalletVault } from '../../lib/hardware/hardwareAccounts'
import { captureHardwareAccountRemoved } from '../../data/ledger/sources/hardwareWalletSource'
import AddHardwareWalletSheet from './AddHardwareWalletSheet'
import './HardwareWallet.css'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export default function HardwareWalletSection({ deps }) {
  const { address: owner, chainId } = useWallet()
  const ui = useContext(UIContext)
  const accounts = useHardwareAccounts()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null) // lower address pending confirmation

  const remove = useCallback(
    (account) => {
      if (!owner) return
      const entry = hardwareWalletVault(owner).remove(account.address)
      setConfirmRemove(null)
      if (!entry) return
      try {
        captureHardwareAccountRemoved(owner, chainId, { address: entry.address, vendor: entry.vendor, path: entry.path })
      } catch {
        /* audit is best-effort */
      }
      ui?.showNotification?.(`Hardware account ${short(entry.address)} forgotten. The device still controls its funds.`, 'info')
    },
    [owner, chainId, ui],
  )

  return (
    <div className="hw-section" role="region" aria-label="Hardware wallets">
      {!owner ? (
        <p className="custody-hint">Connect your wallet to add hardware accounts.</p>
      ) : (
        <>
          <div className="custody-actions">
            <button type="button" onClick={() => setSheetOpen(true)} data-testid="hw-add">
              Add hardware wallet
            </button>
          </div>

          {accounts.length === 0 ? (
            <p className="custody-hint">No hardware accounts yet.</p>
          ) : (
            <ul className="hw-list">
              {accounts.map((acc) => {
                const key = String(acc.address).toLowerCase()
                const confirming = confirmRemove === key
                return (
                  <li key={key} className="hw-list__row" data-testid={`hw-account-${key}`}>
                    <div className="hw-list__id">
                      <span className={`hw-vendor-badge hw-vendor-badge--${acc.vendor}`}>{acc.vendorLabel}</span>
                      <span className="hw-list__text">
                        <span className="hw-list__label">{acc.label}</span>
                        <span className="hw-list__detail">
                          <code>{short(acc.address)}</code> · {acc.path}
                        </span>
                      </span>
                    </div>
                    {confirming ? (
                      // Inline confirmation, not a modal — role="alert" announces the question
                      // without claiming dialog semantics the markup doesn't implement.
                      <span className="hw-list__confirm">
                        <span className="hw-list__confirm-text" role="alert">
                          Forget this reference? The device keeps controlling the funds.
                        </span>
                        <button type="button" className="hw-list__confirm-yes" onClick={() => remove(acc)}>
                          Forget
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="hw-list__remove"
                        onClick={() => setConfirmRemove(key)}
                        aria-label={`Forget ${acc.label}`}
                      >
                        Forget
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <AddHardwareWalletSheet open={sheetOpen} onClose={() => setSheetOpen(false)} deps={deps} />
        </>
      )}
    </div>
  )
}

HardwareWalletSection.propTypes = {
  /** Test seam forwarded to AddHardwareWalletSheet ({ connect, availability, provider }). */
  deps: PropTypes.object,
}
