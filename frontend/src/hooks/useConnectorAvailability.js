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
            // WebAuthn support on this device AND passkey config on the
            // active network (bundler endpoints + synced factory address).
            const { detectCapability } = await import('../lib/passkey/credentials')
            const { getNetwork } = await import('../config/networks')
            const capability = await detectCapability()
            const net = getNetwork(chainId)
            if (!capability.available) {
              next[connector.id] = { available: false, reason: capability.reason || 'Not supported on this device' }
            } else if (!net?.capabilities?.passkeyAccounts) {
              next[connector.id] = { available: false, reason: 'Not available on this network' }
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
