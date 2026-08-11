import { useState } from 'react'
import AddressQRModal from '../ui/AddressQRModal'
import WordListLanguageSelector from '../pools/WordListLanguageSelector'
import AccordionSection from './AccordionSection'
import NavIcon from '../nav/NavIcon'
import './WalletDisplayPreferencesPanel.css'

/**
 * WalletDisplayPreferencesPanel — the "Wallet" card of the Settings tab.
 * Pool phrase language and the address QR code (color picker included, via
 * AddressQRModal's variant="full") relocated here from the Account tab so
 * they sit with other settings instead of crowding the account stats.
 *
 * Spec 061: also the entry point for the Bitcoin receive surface — the same
 * modal in mode="bitcoin" shows the member's rotating Bitcoin address (the
 * modal itself handles the honest unavailable/locked states for non-passkey
 * accounts, so the button is always safe to offer).
 *
 * The QR modals render OUTSIDE the collapsible region: a dialog opened from
 * inside a section must not sit in a subtree that goes `inert` the moment the
 * member collapses it.
 */
function WalletDisplayPreferencesPanel({ address }) {
  const [isQROpen, setQROpen] = useState(false)
  const [isBtcOpen, setBtcOpen] = useState(false)

  return (
    <>
      <AccordionSection
        id="wallet-display"
        title="Wallet"
        summary="Address QR code and phrase language"
        icon={<NavIcon name="qrcode" size={18} />}
        className="wallet-display-prefs"
      >
        <WordListLanguageSelector />
        <div className="wallet-display-prefs-actions">
          <button type="button" className="account-utilities-btn" onClick={() => setQROpen(true)}>
            Show QR Code
          </button>
          <button type="button" className="account-utilities-btn" onClick={() => setBtcOpen(true)}>
            Receive Bitcoin
          </button>
        </div>
      </AccordionSection>
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
    </>
  )
}

export default WalletDisplayPreferencesPanel
