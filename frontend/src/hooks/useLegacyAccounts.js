// Spec 062 follow-up — the recovered legacy accounts available to the connected
// member, shaped for the account switcher. Read-only projection of the encrypted
// vault (ciphertext + metadata only); the entry is carried so the switcher can
// unlock it on selection.

import { useMemo } from 'react'
import { useWallet } from './useWalletManagement'
import { legacyKeyVault } from '../lib/recovery/legacyKeys'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * @returns {Array<{ id:string, kind:'legacy', address:string, label:string,
 *   protection:'passkey'|'passphrase', entry:object }>}
 */
export function useLegacyAccounts() {
  const { address } = useWallet()
  return useMemo(() => {
    if (!address) return []
    let list = []
    try {
      list = legacyKeyVault(address).list()
    } catch {
      return []
    }
    return list.map((entry) => ({
      id: `legacy:${String(entry.address).toLowerCase()}`,
      kind: 'legacy',
      address: entry.address,
      label: short(entry.address),
      protection: entry.protection === 'passkey' ? 'passkey' : 'passphrase',
      entry,
    }))
  }, [address])
}

export default useLegacyAccounts
