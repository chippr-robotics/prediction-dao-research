import { useState } from 'react'
import AddressQRModal from '../ui/AddressQRModal'
import WordListLanguageSelector from '../pools/WordListLanguageSelector'
import './WalletDisplayPreferencesPanel.css'

/**
 * WalletDisplayPreferencesPanel — the "Wallet" area of the Preferences tab.
 * Pool phrase language and the address QR code (color picker included, via
 * AddressQRModal's variant="full") relocated here from the Account tab so
 * they sit with other settings instead of crowding the account stats.
 *
 * Spec 061: also the entry point for the Bitcoin receive surface — the same
 * modal in mode="bitcoin" shows the member's rotating Bitcoin address (the
 * modal itself handles the honest unavailable/locked states for non-passkey
 * accounts, so the button is always safe to offer).
 */
function WalletDisplayPreferencesPanel({ address }) {
  const [isQROpen, setQROpen] = useState(false)
  const [isBtcOpen, setBtcOpen] = useState(false)

  return (
    <div className="wallet-display-prefs">
      <h3 className="wallet-display-prefs-title">Wallet</h3>
      <p className="wallet-display-prefs-hint">
        Pool phrase language and your address QR code, including its color.
      </p>
      <WordListLanguageSelector />
      <div className="wallet-display-prefs-actions">
        <button type="button" className="account-utilities-btn" onClick={() => setQROpen(true)}>
          Show QR Code
        </button>
        <button type="button" className="account-utilities-btn" onClick={() => setBtcOpen(true)}>
          Receive Bitcoin
        </button>
      </div>
      {isQROpen && (
        <AddressQRModal isOpen onClose={() => setQROpen(false)} address={address} />
      )}
      {isBtcOpen && (
        <AddressQRModal
          isOpen
          onClose={() => setBtcOpen(false)}
          address={address}
          mode="bitcoin"
        />
      )}
    </div>
  )
}

export default WalletDisplayPreferencesPanel
