/**
 * AutoConnectPrompt — opens the ONE connect surface as soon as the app is
 * entered without an account.
 *
 * Nothing in FairWins is usable disconnected: every panel behind this is a
 * "Connect wallet to …" placeholder. Making the member find and press a Connect
 * button first was a step with no decision in it, so entering the app now
 * prompts to unlock straight away (spec 045 FR-001 still holds — this opens the
 * shared ConnectModal, it never renders connector choices of its own).
 *
 * Three rules keep the prompt honest:
 *  - It waits for wagmi's eager reconnect to SETTLE. A returning passkey or
 *    WalletConnect session restores itself; prompting mid-restore would ask the
 *    member to unlock an account they already have (spec 045 FR-004).
 *  - It waits for the eligibility gate. The connect dialog never stacks on top
 *    of the spec-007 entry gate.
 *  - It prompts at most ONCE per entry into the app. Dismissing it, or signing
 *    out on purpose, leaves the member disconnected — the header and the
 *    in-panel Connect buttons are still there when they want back in.
 */

import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import { hasAcknowledged, subscribeAck } from '../../utils/entryGateAck'

export default function AutoConnectPrompt() {
  const { isConnected, connectionStatus, isConnectModalOpen, openConnectModal } = useWallet()
  const [gateAcknowledged, setGateAcknowledged] = useState(() => hasAcknowledged())
  const promptedRef = useRef(false)

  useEffect(() => {
    if (gateAcknowledged) return undefined
    return subscribeAck((ack) => setGateAcknowledged(Boolean(ack)))
  }, [gateAcknowledged])

  useEffect(() => {
    if (promptedRef.current) return
    if (!gateAcknowledged) return
    // Undefined status (older test doubles) counts as settled.
    if (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') return
    // A restored session needs no prompt — and marking it spent here means a
    // later, deliberate sign-out is not immediately undone by a re-prompt.
    if (isConnected) {
      promptedRef.current = true
      return
    }
    promptedRef.current = true
    if (!isConnectModalOpen) openConnectModal()
  }, [gateAcknowledged, connectionStatus, isConnected, isConnectModalOpen, openConnectModal])

  return null
}
