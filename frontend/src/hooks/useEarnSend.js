/**
 * useEarnSend (spec 050) — network-transparent transaction sending for the
 * Earn section. Vaults and rewards span every earn-enabled network (like the
 * portfolio), so the member never manages networks by hand: when a
 * transaction targets a different chain than the active one, the switch
 * happens automatically as part of submitting — no separate "switch network"
 * step to confirm in the app. (A browser wallet may still show its own
 * switch prompt; that surface belongs to the wallet, not us.)
 *
 * After switching we wait for the session to settle on the target chain —
 * and, for classic wallets, for the signer to be rebuilt — before handing the
 * batch to WalletContext.sendCalls, which reads the ACTIVE chain. A ref to
 * the latest wallet snapshot avoids acting on a stale closure mid-switch.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useSwitchChain } from 'wagmi'
import { useWallet } from './useWalletManagement'
import { NETWORKS } from '../config/networks'

const SETTLE_TIMEOUT_MS = 20_000
const SETTLE_POLL_MS = 150

export function useEarnSend() {
  const wallet = useWallet() || {}
  const { switchChainAsync } = useSwitchChain()
  const isPasskey = wallet.loginMethod === 'passkey'

  // Always-current wallet snapshot — the switch spans renders, so the send
  // must use post-switch values, not the ones captured at tap time.
  const latestRef = useRef({})
  useEffect(() => {
    latestRef.current = {
      chainId: wallet.chainId,
      signer: wallet.signer,
      sendCalls: wallet.sendCalls,
    }
  })

  /**
   * Whether this session can transact on `chainId` at all. Passkey smart
   * accounts need that chain's ERC-4337 rail (bundler) configured; classic
   * wallets can transact anywhere they can switch to.
   */
  const canTransactOn = useCallback(
    (chainId) => !isPasskey || Boolean(NETWORKS[chainId]?.passkey),
    [isPasskey],
  )

  /**
   * Member-facing reason when canTransactOn is false.
   */
  const cannotTransactReason = useCallback(
    (chainId) =>
      `Passkey accounts can't send transactions on ${NETWORKS[chainId]?.name || 'this network'} yet — connect a browser wallet to use it.`,
    [],
  )

  /**
   * Send `calls` on `targetChainId`, switching networks first when needed.
   * `onState` receives { step: 'switching' | 'sending' }. Resolves with the
   * sendCalls result. Throws with member-facing messages on failure.
   */
  const sendOnChain = useCallback(
    async (targetChainId, calls, { onState } = {}) => {
      const target = Number(targetChainId)
      if (!canTransactOn(target)) throw new Error(cannotTransactReason(target))

      if (Number(latestRef.current.chainId) !== target) {
        onState?.({ step: 'switching' })
        try {
          await switchChainAsync({ chainId: target })
        } catch {
          throw new Error(
            `Could not switch to ${NETWORKS[target]?.name || 'the required network'} — approve the network change and try again.`,
          )
        }
        // Wait for the session to settle on the target chain. Classic
        // wallets also need the chain-scoped signer rebuilt before sendCalls
        // can route the batch correctly.
        const deadline = Date.now() + SETTLE_TIMEOUT_MS
        while (
          Number(latestRef.current.chainId) !== target ||
          (!isPasskey && !latestRef.current.signer)
        ) {
          if (Date.now() > deadline) {
            throw new Error(
              `The switch to ${NETWORKS[target]?.name || 'the required network'} did not complete — please try again.`,
            )
          }
          await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS))
        }
      }

      const send = latestRef.current.sendCalls
      if (typeof send !== 'function') {
        throw new Error('This session cannot send transactions right now — please reconnect and try again.')
      }
      onState?.({ step: 'sending' })
      return send(calls)
    },
    [canTransactOn, cannotTransactReason, isPasskey, switchChainAsync],
  )

  return { sendOnChain, canTransactOn, cannotTransactReason, isPasskey }
}

export default useEarnSend
