/**
 * Returning-user passkey sign-in (spec 041, T042 — US3/FR-009).
 *
 * One button → one unpinned WebAuthn assertion. The PLATFORM picker chooses
 * among the user's discoverable FairWins credentials (same-device, synced,
 * or cross-device/hybrid via phone — all standard WebAuthn transports); the
 * app never guesses which account the user meant. Resolution lands on the
 * SAME on-chain account: local mapping first, re-derivation from the
 * credential's public key when browser data was cleared, and an honest
 * relink message when neither is possible.
 */

import { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useConnect, useChainId } from 'wagmi'
import { PASSKEY_CONNECTOR_ID } from '../../connectors/passkey'
import { CeremonyCancelled } from '../../lib/passkey/credentials'

function PasskeySignIn({ onSignedIn }) {
  const { connect, connectors } = useConnect()
  const chainId = useChainId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const connector = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID)

  const handleSignIn = useCallback(() => {
    if (!connector) return
    setBusy(true)
    setError(null)
    connect(
      // mode comes from the connector options; sign-in is the default once a
      // credential exists on this browser — for a fresh browser the platform
      // picker still surfaces synced credentials (discoverable/resident keys).
      { connector, chainId },
      {
        onSuccess: (data) => {
          setBusy(false)
          onSignedIn?.(data?.accounts?.[0])
        },
        onError: (err) => {
          setBusy(false)
          if (err instanceof CeremonyCancelled || err?.name === 'CeremonyCancelled') return // clean abort
          setError(err?.message || 'Sign-in failed. You can try again.')
        },
      }
    )
  }, [connect, connector, chainId, onSignedIn])

  if (!connector) return null

  return (
    <div className="passkey-signin">
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSignIn}
        disabled={busy}
        data-testid="passkey-signin"
      >
        {busy ? 'Waiting for your device…' : 'Continue with passkey'}
      </button>
      {error && (
        <p className="passkey-signin__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

PasskeySignIn.propTypes = {
  onSignedIn: PropTypes.func,
}

export default PasskeySignIn
