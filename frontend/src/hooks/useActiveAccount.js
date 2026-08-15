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
  const hardwareSigner = custody?.hardwareSigner ?? null
  const operateAsPersonal = custody?.operateAsPersonal ?? NOOP
  const operateAsVault = custody?.operateAsVault ?? NOOP
  const operateAsLegacy = custody?.operateAsLegacy ?? NOOP
  const operateAsHardware = custody?.operateAsHardware ?? NOOP
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
      if (active.mode === 'legacy') {
        // Sign with the unlocked legacy key held in memory by CustodyContext. If it
        // is gone (e.g. after a reload cleared the in-memory signer), the member
        // must re-unlock the account before acting as it.
        if (!legacySigner) throw new Error('Unlock this recovered account again to act as it.')
        // The unlocked signer is bound to the provider at unlock time; if the
        // member has since switched networks, sending would land on the wrong
        // chain. Refuse until they're back on the network they unlocked on
        // (mirrors the vault network guard).
        if (active.chainId != null && Number(chainId) !== Number(active.chainId)) {
          throw new Error('Switch back to the network where you unlocked this recovered account before acting as it.')
        }
        return submitAsActiveAccount(payload, { mode: 'personal', signer: legacySigner })
      }
      if (active.mode === 'hardware') {
        // Spec 085 — sign with the device-backed signer held in memory. Every send is confirmed on
        // the device screen. If the session is gone (reload, unplug), reconnect before acting.
        if (!hardwareSigner) throw new Error('Reconnect your hardware wallet to act as this account.')
        if (active.chainId != null && Number(chainId) !== Number(active.chainId)) {
          throw new Error('Switch back to the network where you connected this hardware account before acting as it.')
        }
        return submitAsActiveAccount(payload, { mode: 'personal', signer: hardwareSigner })
      }
      return submitAsActiveAccount(payload, { mode: 'personal', signer })
    },
    [active, chainId, signer, provider, legacySigner, hardwareSigner],
  )

  // Whether a vault action can currently be sent (connected to the vault's network).
  const canActAsVault = isVault && Number(chainId) === Number(active.chainId)
  // A legacy account can act only while its unlocked signer is still in memory AND
  // the wallet is on the network it was unlocked for (else a switch would send on
  // the wrong chain).
  const canActAsLegacy = isLegacy && Boolean(legacySigner) && (active.chainId == null || Number(chainId) === Number(active.chainId))
  // A hardware account can act only while its device session is still in memory AND the wallet is
  // on the network it was connected for (same guard as legacy — a switch would send on the wrong chain).
  const canActAsHardware = isHardware && Boolean(hardwareSigner) && (active.chainId == null || Number(chainId) === Number(active.chainId))

  return { identity: active, isVault, isLegacy, isHardware, canActAsVault, canActAsLegacy, canActAsHardware, submit, operateAsPersonal, operateAsVault, operateAsLegacy, operateAsHardware }
}

export default useActiveAccount
