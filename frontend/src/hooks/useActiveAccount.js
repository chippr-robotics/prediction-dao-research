// Spec 043 (US3) — expose the active identity and a single submit() that every money-moving surface can call.
// In personal mode submit sends via the connected signer; in vault mode it creates a threshold-gated proposal.

import { useCallback } from 'react'
import { useWallet } from '.'
import { useCustody } from './useCustody'
import { getSafeContracts } from '../config/safeContracts'
import { getContractAddressForChain } from '../config/contracts'
import { submitAsActiveAccount } from '../lib/custody/submitAsActiveAccount'

export function useActiveAccount() {
  const { active, operateAsPersonal } = useCustody()
  const { chainId, signer, provider } = useWallet()
  const isVault = active.mode === 'vault'

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
      return submitAsActiveAccount(payload, { mode: 'personal', signer })
    },
    [active, signer, provider],
  )

  // Whether a vault action can currently be sent (connected to the vault's network).
  const canActAsVault = isVault && Number(chainId) === Number(active.chainId)

  return { identity: active, isVault, canActAsVault, submit, operateAsPersonal }
}

export default useActiveAccount
