/**
 * Per-connector availability for the unified connect surface (spec 045,
 * FR-003). Extracted from WalletButton so every connect entry point shows the
 * SAME honest availability states instead of each surface probing (or not
 * probing) on its own.
 */

import { useState, useEffect } from 'react'
import { useConnect } from 'wagmi'

export function useConnectorAvailability() {
  const { connectors } = useConnect()
  const [status, setStatus] = useState({})
  const [isChecking, setIsChecking] = useState(true)

  // Key the probe on connector IDENTITY, not array identity — some callers
  // (and test doubles) hand a fresh array each render, which would otherwise
  // re-trigger the async probe in a loop.
  const connectorsKey = connectors.map((c) => c.id).join(',')

  useEffect(() => {
    let cancelled = false
    const checkConnectors = async () => {
      setIsChecking(true)
      const next = {}

      for (const connector of connectors) {
        try {
          if (connector.type === 'injected') {
            const hasProvider =
              typeof window !== 'undefined' && (window.ethereum !== undefined || window.web3 !== undefined)
            next[connector.id] = hasProvider
              ? { available: true }
              : { available: false, reason: 'No browser wallet detected' }
          } else if (connector.type === 'walletConnect') {
            // Always usable: QR code / deep links need no local provider.
            next[connector.id] = { available: true }
          } else if (connector.type === 'passkey') {
            // Availability here means "can this member SIGN IN", which depends on the DEVICE only
            // (spec 041 FR-004) — a WebAuthn ceremony plus a local address derivation, needing no
            // bundler, no EntryPoint and no RPC.
            //
            // It deliberately does NOT consider the active network. Doing so locked members out of
            // their own accounts: the selected network persists, so a member who switched to a
            // chain without a bundler came back to find the passkey option refused on the chain
            // they were already on — and switching away required signing in first. Whether a chain
            // can carry a transaction is a separate question, disclosed at the point of action.
            const { detectCapability } = await import('../lib/passkey/credentials')
            const capability = await detectCapability()
            next[connector.id] = capability.available
              ? { available: true }
              : { available: false, reason: capability.reason || 'Not supported on this device' }
            // NOTE: `config/passkeySupport.js#getPasskeySupport` joins bundler config with the
            // deployed factory and names which half is missing. That gate is correct for the
            // Network tab and for disclosing why a TRANSACTION cannot be sent — but it must not
            // gate sign-in, so it is deliberately not consulted here.
          } else {
            try {
              const provider = await connector.getProvider()
              next[connector.id] = { available: Boolean(provider) }
            } catch {
              next[connector.id] = { available: true } // assume available if unknowable
            }
          }
        } catch (error) {
          console.warn(`Error checking connector ${connector.name}:`, error)
          next[connector.id] = { available: false, reason: 'Could not be detected' }
        }
      }

      if (!cancelled) {
        setStatus(next)
        setIsChecking(false)
      }
    }

    checkConnectors()
    return () => {
      cancelled = true
    }
    // No chainId dep: availability is device-scoped now, so switching networks cannot change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectorsKey stands in for connectors
  }, [connectorsKey])

  const isAvailable = (connector) => status[connector.id]?.available !== false
  const unavailableReason = (connector) => status[connector.id]?.reason

  return { status, isChecking, isAvailable, unavailableReason }
}
