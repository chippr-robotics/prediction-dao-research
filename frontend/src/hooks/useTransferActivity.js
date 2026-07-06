import { useCallback, useEffect, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { listTransfers, subscribeTransfers } from '../lib/transfer/transferStore'

/**
 * useTransferActivity — reactive view of the local Pay & Transfer history for the active address, scoped to
 * the active chain. Re-reads on any store change (same-tab custom event or cross-tab `storage`) so a
 * transfer initiated on the Transfer tab appears on the Activity tab immediately.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.allChains=false] - when true, ignore the chain filter and show every network.
 */
export function useTransferActivity({ allChains = false } = {}) {
  const { address, chainId } = useWallet()
  const [transfers, setTransfers] = useState([])

  const refresh = useCallback(() => {
    setTransfers(listTransfers(address, allChains ? undefined : chainId))
  }, [address, chainId, allChains])

  useEffect(() => {
    refresh()
    const unsubscribe = subscribeTransfers(refresh)
    return unsubscribe
  }, [refresh])

  return { transfers, refresh }
}

export default useTransferActivity
