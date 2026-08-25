// Spec 043 (US3) — expose the active identity and a single submit() that every money-moving surface can call.
// In personal mode submit sends via the connected signer; in vault mode it creates a threshold-gated proposal.
//
// Spec 088 — recovered and hardware identities are ADDRESS-ONLY until value moves: submit()
// fetches the acting signer on demand through the custody broker (the globally-mounted ceremony
// host renders the unlock / device-connect dialog right then). A cached signer bound to a network
// the wallet has since left is DROPPED and re-requested — the fresh ceremony binds to the current
// chain — instead of failing the send with a "switch back" error.
//
// Spec 088 FR-002 (audit) — submit() has NO fall-through for an unhandled acting kind. Any mode
// that is not 'personal' and has no branch of its own is REFUSED, never sent with the CONNECTED
// wallet's signer under somebody else's label.

import { useCallback, useContext } from 'react'
import { useWallet } from './useWalletManagement'
import { CustodyContext } from '../contexts/CustodyContext'
import { getSafeContracts } from '../config/safeContracts'
import { getContractAddressForChain } from '../config/contracts'
import { submitAsActiveAccount } from '../lib/custody/submitAsActiveAccount'

const PERSONAL = { mode: 'personal' }
const NOOP = () => {}
const NO_BROKER = () => Promise.reject(new Error('No signing ceremony is available here.'))

export function useActiveAccount() {
  // Read the context directly and degrade to personal mode when no CustodyProvider is mounted. Operate-as is
  // an optional overlay (the provider is always present at runtime), so broad consumers like useTransfer and
  // useFriendMarketCreation must not hard-crash when it is absent (e.g. in isolated component tests).
  const custody = useContext(CustodyContext)
  const active = custody?.active ?? PERSONAL
  const legacySigner = custody?.legacySigner ?? null
  const hardwareSigner = custody?.hardwareSigner ?? null
  const operateAsPersonal = custody?.operateAsPersonal ?? NOOP
  const operateAsVault = custody?.operateAsVault ?? NOOP
  const operateAsLegacy = custody?.operateAsLegacy ?? NOOP
  const operateAsHardware = custody?.operateAsHardware ?? NOOP
  const requestActingSigner = custody?.requestActingSigner ?? NO_BROKER
  const dropActingSigner = custody?.dropActingSigner ?? NOOP
  const { chainId, signer, provider } = useWallet()
  const isVault = active.mode === 'vault'
  const isLegacy = active.mode === 'legacy'
  const isHardware = active.mode === 'hardware'

  const submit = useCallback(
    async (payload) => {
      if (active.mode === 'vault') {
        return submitAsActiveAccount(payload, {
          mode: 'vault',
          vaultAddress: active.vaultAddress,
          chainId: active.chainId,
          hubAddress: getContractAddressForChain('safeProposalHub', active.chainId),
          safeContracts: getSafeContracts(active.chainId),
          signer,
          provider,
        })
      }
      if (active.mode === 'legacy' || active.mode === 'hardware') {
        // Spec 088 — get-or-request the acting signer. A cached signer whose chain binding no
        // longer matches the wallet's network is stale: drop it and run a fresh ceremony (which
        // binds to the CURRENT chain) rather than telling the member to switch back.
        let acting = active.mode === 'legacy' ? legacySigner : hardwareSigner
        const stale = acting && active.chainId != null && Number(chainId) !== Number(active.chainId)
        if (stale) {
          dropActingSigner()
          acting = null
        }
        if (!acting) acting = await requestActingSigner()
        return submitAsActiveAccount(payload, { mode: 'personal', signer: acting })
      }
      // Spec 088 FR-002 — every non-personal kind must be handled ABOVE. A mode with no branch
      // here (today: 'derived', the cross-chain identity useEffectiveAccount already resolves)
      // would otherwise fall through to the connected wallet's signer and sign as somebody else
      // under an acting label — silently, which is the single thing this seam exists to prevent.
      // Refuse instead, and name the account so the member knows what to do about it.
      if (active.mode && active.mode !== 'personal') {
        throw new Error(
          `This account cannot send transactions here yet, so nothing has been signed. Switch back to acting as yourself to send from your own account.`,
        )
      }
      return submitAsActiveAccount(payload, { mode: 'personal', signer })
    },
    [active, chainId, signer, provider, legacySigner, hardwareSigner, requestActingSigner, dropActingSigner],
  )

  // Whether a vault action can currently be sent (connected to the vault's network).
  const canActAsVault = isVault && Number(chainId) === Number(active.chainId)
  // Spec 088 — a recovered/hardware acting account can always ACT: the signer is obtained on
  // demand by the deferred ceremony, so these no longer gate on a signer already being in hand.
  // (They remain distinct flags because consumers branch per kind.)
  const canActAsLegacy = isLegacy
  const canActAsHardware = isHardware

  return { identity: active, isVault, isLegacy, isHardware, canActAsVault, canActAsLegacy, canActAsHardware, submit, operateAsPersonal, operateAsVault, operateAsLegacy, operateAsHardware }
}

export default useActiveAccount
