// Spec 062/063 — shared "acting account" switcher logic: the list of accounts a member can act as
// (personal wallet + multisig vaults + recovered legacy accounts), which one is current, and how to
// switch. Legacy accounts unlock (biometric/passphrase) into an in-memory signer before taking over.
// Used by the wallet header's biticon caret dropdown so the identity IS the switcher.

import { useCallback, useMemo, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { useActiveAccount } from './useActiveAccount'
import { useCustodyVaults } from './useCustodyVaults'
import { useLegacyAccounts } from './useLegacyAccounts'

export const ACCOUNT_KIND_TAG = { vault: 'Multisig', legacy: 'Recovered' }
export const shortAccountAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export function useAccountSwitcher() {
  const { address, chainId } = useWallet()
  const { identity, operateAsPersonal, operateAsVault, operateAsLegacy } = useActiveAccount()
  const { vaults } = useCustodyVaults()
  const legacyAccounts = useLegacyAccounts()
  const [unlockEntry, setUnlockEntry] = useState(null)

  const accounts = useMemo(() => {
    const list = [{ id: 'personal', kind: 'personal', address, label: 'Personal wallet' }]
    for (const v of vaults || []) {
      if (v?.address) {
        list.push({ id: `vault:${v.address}`, kind: 'vault', address: v.address, chainId: v.chainId, label: v.label || shortAccountAddr(v.address) })
      }
    }
    return list.concat(legacyAccounts)
  }, [address, vaults, legacyAccounts])

  const currentId = useMemo(() => {
    if (identity.mode === 'vault') return `vault:${identity.vaultAddress}`
    if (identity.mode === 'legacy') return `legacy:${String(identity.address).toLowerCase()}`
    return 'personal'
  }, [identity])

  // Switch to an account. Legacy accounts open the unlock dialog first (operateAsLegacy on success).
  const choose = useCallback(
    (acc) => {
      if (acc.kind === 'personal') return operateAsPersonal()
      if (acc.kind === 'vault') return operateAsVault({ address: acc.address, chainId: acc.chainId, label: acc.label })
      if (acc.kind === 'legacy') { setUnlockEntry(acc.entry); return undefined }
      return undefined
    },
    [operateAsPersonal, operateAsVault],
  )

  const onUnlocked = useCallback(
    (signer) => {
      if (unlockEntry) {
        operateAsLegacy({ address: unlockEntry.address, chainId, kind: unlockEntry.kind, label: shortAccountAddr(unlockEntry.address), signer })
      }
      setUnlockEntry(null)
    },
    [unlockEntry, chainId, operateAsLegacy],
  )

  return {
    accounts,
    currentId,
    choose,
    unlockEntry,
    setUnlockEntry,
    onUnlocked,
    // Only worth surfacing the caret when there's more than the personal wallet to choose from.
    hasChoices: accounts.length > 1,
  }
}

export default useAccountSwitcher
