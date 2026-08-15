// Spec 085 — the saved hardware-wallet accounts available to the connected member, shaped for the
// account switcher and the Protect ▸ Off chain list. Read-only projection of the hardware-accounts
// store (public metadata only); the entry is carried so a consumer can reconnect the device on
// selection. Reactive: re-reads whenever the store mutates (add/remove/rename from any surface).

import { useMemo, useSyncExternalStore } from 'react'
import { useWallet } from './useWalletManagement'
import { hardwareWalletVault } from '../lib/hardware/hardwareAccounts'
import {
  getHardwareAccountsRevision,
  subscribeHardwareAccounts,
} from '../lib/hardware/hardwareAccountsStore'
import { VENDOR_LABELS } from '../lib/hardware/adapters'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * @returns {Array<{ id:string, kind:'hardware', address:string, label:string,
 *   vendor:'ledger'|'trezor', vendorLabel:string, path:string, entry:object }>}
 */
export function useHardwareAccounts() {
  const { address } = useWallet()
  const revision = useSyncExternalStore(subscribeHardwareAccounts, getHardwareAccountsRevision)

  return useMemo(() => {
    if (!address) return []
    let list
    try {
      list = hardwareWalletVault(address).list()
    } catch {
      return []
    }
    return list.map((entry) => ({
      id: `hardware:${String(entry.address).toLowerCase()}`,
      kind: 'hardware',
      address: entry.address,
      label: entry.label || short(entry.address),
      vendor: entry.vendor,
      vendorLabel: VENDOR_LABELS[entry.vendor] || entry.vendor,
      path: entry.path,
      entry,
    }))
    // The store lives outside React, so the revision IS the dependency that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, revision])
}

export default useHardwareAccounts
