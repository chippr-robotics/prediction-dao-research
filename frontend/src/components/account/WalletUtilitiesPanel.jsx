import { useState } from 'react'
import AddressQRModal from '../ui/AddressQRModal'
import './WalletUtilitiesPanel.css'

/**
 * WalletUtilitiesPanel — de-emphasised wallet actions preserved from the old
 * Account tab (spec 020 US6, FR-017): full address + copy, Show QR Code,
 * Disconnect Wallet. Behavior is unchanged; only the prominence is reduced.
 */
function WalletUtilitiesPanel({ address, onDisconnect }) {
  const [isQROpen, setQROpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <section className="account-utilities" aria-label="Wallet utilities">
      <div className="account-utilities-row">
        <span className="account-utilities-label">Address</span>
        <span className="account-utilities-address" title={address}>{address}</span>
        <button type="button" className="account-utilities-link" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="account-utilities-actions">
        <button type="button" className="account-utilities-btn" onClick={() => setQROpen(true)}>
          Show QR Code
        </button>
        <button type="button" className="account-utilities-btn danger" onClick={onDisconnect}>
          Disconnect Wallet
        </button>
      </div>
      {isQROpen && (
        <AddressQRModal isOpen onClose={() => setQROpen(false)} address={address} />
      )}
    </section>
  )
}

export default WalletUtilitiesPanel
