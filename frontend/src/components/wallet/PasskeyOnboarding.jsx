/**
 * Passkey sign-up flow (spec 041, T029 — US1/FR-005/FR-007/FR-021).
 *
 * Landing → one biometric ceremony → connected account with a stable address
 * and a funding view (reuses the spec-011 address+QR surface). The account is
 * counterfactual until its first paid action — presented honestly as "ready
 * to receive; activates with your first action". No seed phrase exists
 * anywhere in this flow, by construction.
 */

import { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useConnect, useChainId } from 'wagmi'
import AddressQRModal from '../ui/AddressQRModal'
import { CeremonyCancelled, AuthenticatorUnavailable } from '../../lib/passkey/credentials'
import { PASSKEY_CONNECTOR_ID } from '../../connectors/passkey'
import { useWallet } from '../../hooks/useWalletManagement'

function PasskeyOnboarding({ onComplete }) {
  const { connect, connectors } = useConnect()
  const chainId = useChainId()
  const { address, isConnected } = useWallet()
  const [phase, setPhase] = useState('intro') // intro | ceremony | funded-view | error
  const [error, setError] = useState(null)
  const [showQR, setShowQR] = useState(false)

  const passkeyConnector = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID)

  const handleSignUp = useCallback(() => {
    if (!passkeyConnector) return
    setPhase('ceremony')
    setError(null)
    connect(
      { connector: passkeyConnector, chainId },
      {
        onSuccess: () => setPhase('funded-view'),
        onError: (err) => {
          if (err instanceof CeremonyCancelled || err?.name === 'CeremonyCancelled') {
            // Clean abort (edge case): back to the intro, fully re-attemptable.
            setPhase('intro')
            return
          }
          setError(
            err instanceof AuthenticatorUnavailable || err?.name === 'AuthenticatorUnavailable'
              ? err.message
              : 'Something went wrong creating your passkey account. Nothing was created — you can try again.'
          )
          setPhase('error')
        },
      }
    )
  }, [connect, passkeyConnector, chainId])

  if (!passkeyConnector) return null

  return (
    <div className="passkey-onboarding" role="region" aria-label="Create account with passkey">
      {phase === 'intro' && (
        <div className="passkey-onboarding__intro">
          <h2>Create your account with a passkey</h2>
          <p>
            Use Face ID, Touch ID, or your device PIN — no browser extension, no seed phrase, nothing to
            write down. Your device keeps the key; FairWins never can.
          </p>
          <button type="button" className="btn btn-primary" onClick={handleSignUp}>
            Continue with passkey
          </button>
          {/* Device-loss honesty at creation time (FR-021 moment #1) */}
          <p className="passkey-onboarding__warning" role="note">
            Your passkey lives on this device (and your platform&apos;s passkey sync, if enabled). After
            setup, add a second passkey or link a wallet in Account → Controllers so losing this device
            never means losing your funds.
          </p>
        </div>
      )}

      {phase === 'ceremony' && (
        <div className="passkey-onboarding__ceremony" aria-live="polite">
          <p>Follow your device&apos;s prompt to create your passkey…</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="passkey-onboarding__error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => setPhase('intro')}>
            Back
          </button>
        </div>
      )}

      {phase === 'funded-view' && isConnected && address && (
        <div className="passkey-onboarding__funded">
          <h2>Your account is ready</h2>
          <p className="passkey-onboarding__address" data-testid="passkey-account-address">
            {address}
          </p>
          <p>
            Send USDC to this address to fund it. It can receive funds right away — the account
            activates on-chain automatically with your first action (no extra step, FR-007).
          </p>
          <div className="passkey-onboarding__actions">
            <button type="button" className="btn" onClick={() => setShowQR(true)}>
              Show QR code
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onComplete?.(address)}>
              Done
            </button>
          </div>
          <AddressQRModal isOpen={showQR} onClose={() => setShowQR(false)} address={address} />
        </div>
      )}
    </div>
  )
}

PasskeyOnboarding.propTypes = {
  onComplete: PropTypes.func,
}

export default PasskeyOnboarding
