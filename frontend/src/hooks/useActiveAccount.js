// Spec 043 (US3) — expose the active identity and a single submit() that every money-moving surface can call.
// In personal mode submit sends via the connected signer; in vault mode it creates a threshold-gated proposal.

import { useCallback, useContext } from 'react'
import { useWallet } from './useWalletManagement'
import { CustodyContext } from '../contexts/CustodyContext'
import { getSafeContracts } from '../config/safeContracts'
import { getContractAddressForChain } from '../config/contracts'
import { submitAsActiveAccount } from '../lib/custody/submitAsActiveAccount'

const PERSONAL = { mode: 'personal' }
const NOOP = () => {}

export function useActiveAccount() {
  // Read the context directly and degrade to personal mode when no CustodyProvider is mounted. Operate-as is
  // an optional overlay (the provider is always present at runtime), so broad consumers like useTransfer and
  // useFriendMarketCreation must not hard-crash when it is absent (e.g. in isolated component tests).
  const custody = useContext(CustodyContext)
  const active = custody?.active ?? PERSONAL
  const legacySigner = custody?.legacySigner ?? null
  const operateAsPersonal = custody?.operateAsPersonal ?? NOOP
  const operateAsVault = custody?.operateAsVault ?? NOOP
  const operateAsLegacy = custody?.operateAsLegacy ?? NOOP
  const { chainId, signer, provider } = useWallet()
  const isVault = active.mode === 'vault'
  const isLegacy = active.mode === 'legacy'

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
      if (active.mode === 'legacy') {
        // Sign with the unlocked legacy key held in memory by CustodyContext. If it
        // is gone (e.g. after a reload cleared the in-memory signer), the member
        // must re-unlock the account before acting as it.
        if (!legacySigner) throw new Error('Unlock this recovered account again to act as it.')
        return submitAsActiveAccount(payload, { mode: 'personal', signer: legacySigner })
      }
      return submitAsActiveAccount(payload, { mode: 'personal', signer })
    },
    [active, signer, provider, legacySigner],
  )

  // Whether a vault action can currently be sent (connected to the vault's network).
  const canActAsVault = isVault && Number(chainId) === Number(active.chainId)
  // A legacy account can act only while its unlocked signer is still in memory.
  const canActAsLegacy = isLegacy && Boolean(legacySigner)

  return { identity: active, isVault, isLegacy, canActAsVault, canActAsLegacy, submit, operateAsPersonal, operateAsVault, operateAsLegacy }
}

export default useActiveAccount
