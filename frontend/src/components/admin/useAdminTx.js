/**
 * useAdminTx (spec 093) — the shared admin write runner, extracted verbatim
 * from the monolithic AdminPanel's `runTx`.
 *
 * RESOLVES `true` on success and `false` on any failure — including a rejected
 * wallet prompt — never `undefined` and never a rejection. Callers that send a
 * SEQUENCE need that: the spec-067 bulk route toggles promised "a failed or
 * rejected signature stops the rest", and with a signal-free result the loop
 * could not observe a revert, so rejecting the first prompt still queued the
 * remaining four.
 *
 * `onSuccess` replaces the monolith's hard-wired `fetchContractState()`:
 * each app passes its own refresh so a write refreshes the state it changed.
 */
import { useCallback, useState } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import { useNotification } from '../../hooks/useUI'

export function useAdminTx({ onSuccess } = {}) {
  const { signer } = useWeb3()
  const { showNotification } = useNotification()
  const [pendingTx, setPendingTx] = useState(false)

  const runTx = useCallback(
    async (fn, successMsg) => {
      if (!signer) {
        showNotification('Connect your wallet first', 'error')
        return false
      }
      setPendingTx(true)
      try {
        const tx = await fn()
        await tx.wait()
        showNotification(successMsg, 'success')
        onSuccess?.()
        return true
      } catch (err) {
        console.error(err)
        showNotification(err.shortMessage || err.message, 'error')
        return false
      } finally {
        setPendingTx(false)
      }
    },
    [signer, showNotification, onSuccess],
  )

  return { runTx, pendingTx }
}
