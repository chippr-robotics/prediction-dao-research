// Spec 062 follow-up — the recovered legacy accounts available to the connected
// member, shaped for the account switcher. Read-only projection of the encrypted
// vault (ciphertext + metadata only); the entry is carried so the switcher can
// unlock it on selection.
//
// Spec 086: the label prefers the member's address-book nickname (any chain — an
// EOA is the same account everywhere), so the card and the Recovery tab finally
// agree on what a recovered account is called. Falls back to the short address.

import { useMemo } from 'react'
import { useWallet } from './useWalletManagement'
import { useAddressBook } from './useAddressBook'
import { legacyKeyVault } from '../lib/recovery/legacyKeys'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * @returns {Array<{ id:string, kind:'legacy', address:string, label:string,
 *   protection:'passkey'|'passphrase', entry:object }>}
 */
export function useLegacyAccounts() {
  const { address } = useWallet()
  const { contacts } = useAddressBook()

  // Chain-agnostic nickname index: findByAddress matches (address, chainId)
  // exactly, but a legacy EOA is the same account on every chain.
  const nicknameByAddress = useMemo(() => {
    const out = new Map()
    for (const contact of contacts || []) {
      for (const saved of contact.addresses || []) {
        const key = String(saved.address || '').toLowerCase()
        if (key && !out.has(key)) out.set(key, contact.nickname)
      }
    }
    return out
  }, [contacts])

  return useMemo(() => {
    if (!address) return []
    let list
    try {
      list = legacyKeyVault(address).list()
    } catch {
      return []
    }
    return list.map((entry) => ({
      id: `legacy:${String(entry.address).toLowerCase()}`,
      kind: 'legacy',
      address: entry.address,
      label: nicknameByAddress.get(String(entry.address).toLowerCase()) || short(entry.address),
      protection: entry.protection === 'passkey' ? 'passkey' : 'passphrase',
      entry,
    }))
  }, [address, nicknameByAddress])
}

export default useLegacyAccounts
