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
  // Spec 062: when operating as a recovered legacy account, the unlocked ethers
  // signer lives here in MEMORY ONLY — never persisted, never serialized, cleared
  // on any identity change. It is the private-key material, so it must not leak.
  const [legacySigner, setLegacySigner] = useState(null)
  const prevAddress = useRef(address)

  // Reset to the personal wallet whenever the connected account actually changes or disconnects. This is a
  // deliberate external-sync effect (identity must not carry across accounts); guarded by a ref so it only
  // fires on a real change.
  useEffect(() => {
    if (prevAddress.current !== address) {
      prevAddress.current = address
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on account change
      setActive({ mode: 'personal' })
      setLegacySigner(null) // drop the in-memory legacy key on account change
    }
  }, [address])

  const operateAsVault = useCallback((vault) => {
    if (!vault?.address || vault.chainId == null) return
    setLegacySigner(null)
    setActive({
      mode: 'vault',
      vaultAddress: vault.address,
      chainId: Number(vault.chainId),
      label: vault.label || '',
    })
  }, [])

  const operateAsPersonal = useCallback(() => {
    setLegacySigner(null)
    setActive({ mode: 'personal' })
  }, [])

  // Operate as a recovered legacy account. The caller unlocks it first (biometric
  // or passphrase → provider-connected signer) and passes that signer; we hold it
  // in memory for the session and expose the identity for display + gating.
  const operateAsLegacy = useCallback((descriptor) => {
    if (!descriptor?.address || !descriptor.signer) return
    setLegacySigner(descriptor.signer)
    setActive({
      mode: 'legacy',
      address: descriptor.address,
      chainId: descriptor.chainId != null ? Number(descriptor.chainId) : undefined,
      kind: descriptor.kind || 'privateKey',
      label: descriptor.label || '',
    })
  }, [])

  const value = useMemo(
    () => ({ active, legacySigner, operateAsVault, operateAsPersonal, operateAsLegacy }),
    [active, legacySigner, operateAsVault, operateAsPersonal, operateAsLegacy],
  )

  return <CustodyContext.Provider value={value}>{children}</CustodyContext.Provider>
}

export default CustodyProvider
