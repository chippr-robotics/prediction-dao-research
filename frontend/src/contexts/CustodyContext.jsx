// Spec 043 (US3) — the active-identity provider. A member operates either as their personal wallet (default)
// or "as" one of their vaults. This is a per-session choice (not persisted) and always resets to personal when
// the connected account changes. Authorization still keys off the connected wallet address; the active
// identity only changes where prepared actions are *sent* (personal send vs. threshold-gated vault proposal).

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useWallet } from '../hooks'
import { CustodyContext } from './CustodyContext'

export function CustodyProvider({ children }) {
  const { address } = useWallet()
  const [active, setActive] = useState({ mode: 'personal' })
  const prevAddress = useRef(address)

  // Reset to the personal wallet whenever the connected account actually changes or disconnects. This is a
  // deliberate external-sync effect (identity must not carry across accounts); guarded by a ref so it only
  // fires on a real change.
  useEffect(() => {
    if (prevAddress.current !== address) {
      prevAddress.current = address
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on account change
      setActive({ mode: 'personal' })
    }
  }, [address])

  const operateAsVault = useCallback((vault) => {
    if (!vault?.address || vault.chainId == null) return
    setActive({
      mode: 'vault',
      vaultAddress: vault.address,
      chainId: Number(vault.chainId),
      label: vault.label || '',
    })
  }, [])

  const operateAsPersonal = useCallback(() => setActive({ mode: 'personal' }), [])

  const value = useMemo(
    () => ({ active, operateAsVault, operateAsPersonal }),
    [active, operateAsVault, operateAsPersonal],
  )

  return <CustodyContext.Provider value={value}>{children}</CustodyContext.Provider>
}

export default CustodyProvider
