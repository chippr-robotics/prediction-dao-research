/**
 * The single connect surface (spec 045, US2/FR-001..FR-004). Every entry
 * point — header button, wallet page, dashboard welcome — opens THIS dialog
 * via WalletContext.openConnectModal(); no other component renders connector
 * choices. Passkey and WalletConnect are featured ahead of browser wallets
 * (all three stay fully supported).
 *
 * Passkey path: first-time explainer (US4) → in-app account picker whenever
 * this browser knows at least one passkey (US3 + issue #849 — Brave/Chromium
 * won't reliably offer the choice, and even a lone recorded passkey must not
 * silently pin the member to index 0) → ceremony pinned to the chosen
 * credential, or a discoverable request for a passkey not yet in the book.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import { useConnectorAvailability } from '../../hooks/useConnectorAvailability'
import { getWalletLabel, getWalletIcon } from '../../utils/walletLabel'
import { knownCredentials, isTransactComplete, forgetCredential } from '../../lib/passkey/credentials'
import { hasSeenExplainer, markExplainerSeen } from '../../lib/passkey/explainer'
import { PASSKEY_CONNECTOR_ID } from '../../connectors/passkey'
import PasskeyExplainer from './PasskeyExplainer'
import './ConnectModal.css'

const TYPE_ORDER = { passkey: 0, walletConnect: 1, injected: 2 }
const FEATURED_TYPES = new Set(['passkey', 'walletConnect'])

const shortAddress = (addr) => (addr ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : '')

function ConnectModal() {
  // Mount the dialog (and its availability probing) only while open — the
  // provider renders this component app-wide.
  const { isConnectModalOpen } = useWallet()
  if (!isConnectModalOpen) return null
  return <ConnectModalDialog />
}

function ConnectModalDialog() {
  const { isConnectModalOpen, closeConnectModal, connectWallet, connectors, isConnected } = useWallet()
  const availability = useConnectorAvailability()
  const [step, setStep] = useState('methods') // methods | explainer | picker
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState(null)
  const [pickerAccounts, setPickerAccounts] = useState([])
  const dialogRef = useRef(null)

  const reset = useCallback(() => {
    setStep('methods')
    setPendingId(null)
    setError(null)
  }, [])

  const close = useCallback(() => {
    reset()
    closeConnectModal()
  }, [reset, closeConnectModal])

  // A successful connection (from any path, including a parallel surface)
  // closes the dialog — never leave a picker over a connected session.
  useEffect(() => {
    if (isConnected && isConnectModalOpen) close()
  }, [isConnected, isConnectModalOpen, close])

  // Esc closes; focus moves into the dialog on open; Tab/Shift+Tab cycle
  // within the dialog's focusable elements (aria-modal focus trap).
  useEffect(() => {
    if (!isConnectModalOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const outside = !dialog.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [isConnectModalOpen, close])

  const doConnect = useCallback(
    async (connectorId, opts) => {
      setPendingId(connectorId)
      setError(null)
      try {
        await connectWallet(connectorId, opts)
      } catch (err) {
        if (err?.name === 'CeremonyCancelled') {
          // Clean abort — back to an immediately re-attemptable idle state.
          setStep('methods')
        } else {
          setError(err?.message || 'Connection failed. Please try again.')
        }
      } finally {
        setPendingId(null)
      }
    },
    [connectWallet]
  )

  const startPasskey = useCallback(() => {
    const known = knownCredentials().filter(isTransactComplete)
    // Issue #849: whenever this browser knows at least one passkey, present the
    // chooser instead of silently pinning to the first (index 0). The picker
    // lets the member select any known passkey, reach a different one on the
    // device via "Use a different passkey…", or create another account — the
    // three acceptance scenarios. Only a browser with an empty book skips
    // straight to sign-up (there is nothing yet to choose between).
    if (known.length >= 1) {
      setPickerAccounts(known)
      setStep('picker')
      return
    }
    doConnect(PASSKEY_CONNECTOR_ID, undefined)
  }, [doConnect])

  const handleSelect = useCallback(
    (connector) => {
      if (connector.type === 'passkey' && !hasSeenExplainer()) {
        setStep('explainer')
        return
      }
      if (connector.type === 'passkey') return startPasskey()
      doConnect(connector.id)
    },
    [doConnect, startPasskey]
  )

  const handleExplainerContinue = useCallback(() => {
    markExplainerSeen()
    startPasskey()
  }, [startPasskey])

  const handleExplainerDismiss = useCallback(() => {
    markExplainerSeen()
    setStep('methods')
  }, [])

  const removeStaleAccount = useCallback((credentialId) => {
    forgetCredential(credentialId)
    setPickerAccounts((prev) => prev.filter((c) => c.credentialId !== credentialId))
  }, [])

  const sorted = [...connectors].sort(
    (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
  )
  const featured = sorted.filter((c) => FEATURED_TYPES.has(c.type))
  const others = sorted.filter((c) => !FEATURED_TYPES.has(c.type))

  const renderConnectorRow = (connector, { recommended } = {}) => {
    const available = availability.isAvailable(connector)
    const reason = availability.unavailableReason(connector)
    const isThisConnecting = pendingId === connector.id
    return (
      <button
        key={connector.id}
        type="button"
        onClick={() => handleSelect(connector)}
        className={`connect-modal__option ${!available ? 'unavailable' : ''} ${isThisConnecting ? 'connecting' : ''}`}
        disabled={pendingId !== null || !available}
        aria-busy={isThisConnecting}
      >
        <span className="connect-modal__option-icon" aria-hidden="true">
          {getWalletIcon(connector)}
        </span>
        <span className="connect-modal__option-name">{getWalletLabel(connector)}</span>
        {isThisConnecting && <span className="connect-modal__status connecting">Connecting...</span>}
        {!isThisConnecting && !available && (
          <span className="connect-modal__status">{reason || 'Not available'}</span>
        )}
        {!isThisConnecting && available && recommended && (
          <span className="connect-modal__badge">Recommended</span>
        )}
        {!isThisConnecting && available && !recommended && connector.type === 'walletConnect' && (
          <span className="connect-modal__badge">QR Code</span>
        )}
      </button>
    )
  }

  return (
    <div className="connect-modal__backdrop" onClick={close} data-testid="connect-modal-backdrop">
      <div
        className="connect-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Connect to FairWins"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="connect-modal__header">
          <h3>{step === 'picker' ? 'Choose an account' : 'Connect to FairWins'}</h3>
          <button type="button" className="connect-modal__close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        {error && (
          <div className="connect-modal__error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {step === 'methods' && (
          <>
            <div className="connect-modal__list" data-testid="connect-options">
              {availability.isChecking ? (
                <div className="connect-modal__loading">Detecting options...</div>
              ) : (
                <>
                  {featured.map((c) => renderConnectorRow(c, { recommended: c.type === 'passkey' }))}
                  {others.length > 0 && (
                    <>
                      <div className="connect-modal__divider" role="separator">
                        More options
                      </div>
                      {others.map((c) => renderConnectorRow(c))}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="connect-modal__footer">
              <p>
                New to Web3 wallets?{' '}
                <a href="https://ethereum.org/en/wallets/" target="_blank" rel="noopener noreferrer">
                  Learn more
                </a>
              </p>
              <p>
                Lost your passkey?{' '}
                <a href="/wallet?tab=security">Recover with a linked wallet</a>
              </p>
            </div>
          </>
        )}

        {step === 'explainer' && (
          <PasskeyExplainer onContinue={handleExplainerContinue} onDismiss={handleExplainerDismiss} />
        )}

        {step === 'picker' && (
          <div className="connect-modal__list" data-testid="passkey-picker">
            <p className="connect-modal__hint">
              {pickerAccounts.length > 1
                ? 'This browser knows several passkey accounts. Pick the one to sign into — the app never guesses.'
                : 'Pick a passkey to sign into, use another passkey on this device, or create a new account.'}
            </p>
            {pickerAccounts.map((cred) => (
              <div key={cred.credentialId} className="connect-modal__account-row">
                <button
                  type="button"
                  className="connect-modal__option"
                  disabled={pendingId !== null}
                  onClick={() =>
                    doConnect(PASSKEY_CONNECTOR_ID, { credentialId: cred.credentialId, mode: 'sign-in' })
                  }
                >
                  <span className="connect-modal__option-name">{cred.label || 'Passkey account'}</span>
                  {cred.address && <code className="connect-modal__address">{shortAddress(cred.address)}</code>}
                </button>
                <button
                  type="button"
                  className="connect-modal__forget"
                  onClick={() => removeStaleAccount(cred.credentialId)}
                  aria-label={`Remove ${cred.label || shortAddress(cred.address) || 'this account'} from this browser`}
                  title="Remove from this browser (the passkey itself stays on your device)"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="connect-modal__option connect-modal__option--secondary"
              disabled={pendingId !== null}
              onClick={() => doConnect(PASSKEY_CONNECTOR_ID, { mode: 'sign-in', discoverable: true })}
            >
              Use a different passkey…
            </button>
            <button
              type="button"
              className="connect-modal__option connect-modal__option--secondary"
              disabled={pendingId !== null}
              onClick={() => doConnect(PASSKEY_CONNECTOR_ID, { mode: 'sign-up' })}
            >
              Create a new account
            </button>
            <button type="button" className="connect-modal__back" onClick={reset}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConnectModal
