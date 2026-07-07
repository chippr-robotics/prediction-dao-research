import './WalletUtilitiesPanel.css'

/**
 * WalletUtilitiesPanel — de-emphasised wallet actions on the Account tab
 * (spec 020 US6, FR-017). Address display/copy, pool phrase language, and QR
 * code moved to the Preferences tab (WalletDisplayPreferencesPanel); the
 * sidebar identity's address is now click-to-copy. Disconnect stays here
 * because it's a session action, not a setting.
 */
function WalletUtilitiesPanel({ onDisconnect }) {
  return (
    <section className="account-utilities" aria-label="Wallet utilities">
      <div className="account-utilities-actions">
        <button type="button" className="account-utilities-btn danger" onClick={onDisconnect}>
          Disconnect Wallet
        </button>
      </div>
    </section>
  )
}

export default WalletUtilitiesPanel
