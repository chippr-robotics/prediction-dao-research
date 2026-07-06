/**
 * Passkey account management state (spec 041, T045 — US4).
 *
 * Projects the on-chain owner set ∪ local credential metadata into the
 * AccountController rows the ControllersPanel renders (data-model.md), plus
 * activation state and the encryption-capability flag. On-chain is
 * authoritative; local labels/addedAt are niceties (never authorization).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet } from './useWalletManagement'
import { readControllers } from '../lib/passkey/smartAccount'
import { knownCredentials } from '../lib/passkey/credentials'
import { capability as encryptionCapability } from '../lib/passkey/prfKeys'
import { screenController } from '../utils/sanctionsScreen'

export function usePasskeyAccount(injectedDeps = {}) {
  const { address, chainId, loginMethod, isConnected, provider } = useWallet()
  // Injected deps are test/config seams, not reactive inputs. Pin the
  // first-render value (lazy useState initializer — render-safe, stable
  // identity) so a default `{}` (new object every render) can never
  // re-trigger the refresh effect in a loop.
  const [deps] = useState(injectedDeps)
  const [state, setState] = useState({ loading: true, deployed: false, controllers: [], error: null })

  const isPasskeySession = isConnected && loginMethod === 'passkey'

  const refresh = useCallback(async () => {
    if (!isPasskeySession || !address) {
      setState({ loading: false, deployed: false, controllers: [], error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { deployed, controllers } = await (deps.readControllers ?? readControllers)({
        chainId,
        accountAddress: address,
        deps,
      })
      const local = (deps.knownCredentials ?? knownCredentials)()
      // Periodic controller re-screen (spec 041 clarification Q2): wallet
      // controllers are screened alongside the account; a flagged (or
      // unscreenable — fail-closed) controller flags the whole account for
      // gated actions. Passkey entries have no address — nothing to screen.
      const screenFn = deps.screenController ?? screenController
      const screening = await Promise.all(
        controllers.map(async (c) => {
          if (c.kind !== 'wallet' || !provider) return null
          try {
            return await screenFn(c.address, provider)
          } catch {
            return { clear: false, available: false }
          }
        })
      )
      const rows = controllers.map((c, i) => {
        // Match a passkey owner entry to its local credential by public key.
        const match =
          c.kind === 'passkey'
            ? local.find(
                (cred) =>
                  cred.publicKey &&
                  c.ownerBytes.toLowerCase() ===
                    `0x${cred.publicKey.x.slice(2)}${cred.publicKey.y.slice(2)}`.toLowerCase()
              )
            : null
        return {
          ...c,
          label: match?.label ?? (c.kind === 'wallet' ? 'Linked wallet' : 'Passkey (another device)'),
          credentialId: match?.credentialId ?? null,
          addedAt: match?.updatedAt ?? null,
          isThisDevice: Boolean(match),
          screening: screening[i], // null for passkeys; {clear, available} for wallets
        }
      })
      setState({ loading: false, deployed, controllers: rows, error: null })
    } catch (e) {
      setState({ loading: false, deployed: false, controllers: [], error: e.message })
    }
  }, [isPasskeySession, address, chainId, provider, deps])


  useEffect(() => {
    refresh()
  }, [refresh])

  const encryption = useMemo(() => {
    if (!isPasskeySession || !address) return { state: 'available' }
    const session = (deps.knownCredentials ?? knownCredentials)().find(
      (c) => c.address?.toLowerCase() === address.toLowerCase()
    )
    return (deps.encryptionCapability ?? encryptionCapability)({
      account: address,
      credentialId: session?.credentialId,
      prfCapable: session?.prfCapable ?? false,
      deps,
    })
  }, [isPasskeySession, address, deps])


  return {
    isPasskeySession,
    address,
    loading: state.loading,
    /** false = counterfactual: fundable, activates with the first action (FR-007). */
    deployed: state.deployed,
    controllers: state.controllers,
    controllerCount: state.controllers.length,
    /** FR-021 warning driver: value is at single-credential risk until a second controller exists. */
    singleControllerRisk: state.controllers.length <= 1,
    /** Clarification Q2: any not-clear wallet controller flags the account for gated actions. */
    accountFlagged: state.controllers.some((c) => c.screening && !c.screening.clear),
    encryption,
    error: state.error,
    refresh,
  }
}
