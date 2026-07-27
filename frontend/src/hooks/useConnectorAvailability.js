/**
 * Per-connector availability for the unified connect surface (spec 045,
 * FR-003). Extracted from WalletButton so every connect entry point shows the
 * SAME honest availability states instead of each surface probing (or not
 * probing) on its own.
 */

import { useState, useEffect } from 'react'
import { useConnect, useChainId } from 'wagmi'

export function useConnectorAvailability() {
  const { connectors } = useConnect()
  const chainId = useChainId()
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
            // Passkey option only where genuinely usable (spec 041 FR-004):
            // WebAuthn support on this device AND a network where BOTH halves of
            // passkey support are real — a bundler to relay the UserOp and a
            // deployed account factory to create the account. `getPasskeySupport`
            // joins the two and names which half is missing, so a member on a
            // network mid-rollout reads the actual reason instead of a blanket
            // "not available".
            const { detectCapability } = await import('../lib/passkey/credentials')
            const { getPasskeySupport } = await import('../config/passkeySupport')
            const capability = await detectCapability()
            const support = getPasskeySupport(chainId)
            if (!capability.available) {
              next[connector.id] = { available: false, reason: capability.reason || 'Not supported on this device' }
            } else if (!support.supported) {
              next[connector.id] = { available: false, reason: support.reason }
            } else {
              next[connector.id] = { available: true }
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connectorsKey stands in for connectors
  }, [connectorsKey, chainId])

  const isAvailable = (connector) => status[connector.id]?.available !== false
  const unavailableReason = (connector) => status[connector.id]?.reason

  return { status, isChecking, isAvailable, unavailableReason }
}
