// Spec 063 (US1) — the single place every money-and-identity surface resolves "which account am I acting
// as, and what is its address here?". Extends the spec-043/062 acting-account seam so the portfolio, Receive,
// Request, Home actions, and dashboard stats all follow the selected account instead of hardcoding the
// connected wallet. Transfer and Trade already compute this inline (DexContext.tradingAddress,
// TransferForm.actingAddress); this hook is the shared, reusable form of that pattern.
//
// It reads WalletContext and CustodyContext DIRECTLY (with null fallbacks) rather than going through
// useWallet()/useActiveAccount(), so broad surfaces that mount it never hard-crash in isolated component
// tests where no provider is present — mirroring how useActiveAccount degrades to personal mode.

import { useContext, useMemo } from 'react'
import { WalletContext } from '../contexts/WalletContext'
import { CustodyContext } from '../contexts/CustodyContext'

// Stable personal-mode fallback so the useMemo below doesn't see a fresh object each render.
const PERSONAL = { mode: 'personal' }

/**
 * @returns {{
 *   type: 'personal'|'vault'|'legacy'|'derived',
 *   address: string|null,          // the acting account's EVM address (its receive/from address on EVM chains)
 *   label: string|null,
 *   isActingAccount: boolean,      // true when acting as anything other than the personal wallet
 *   connectedAddress: string|null, // the underlying connected wallet, regardless of selection
 *   chainId: number|null,          // the chain the acting account is bound to (vault/legacy), else null
 * }}
 *
 * `address` is the account the surface must show and use as the "from"/receive target. Callers that render a
 * per-chain address (Receive on Bitcoin, etc.) must still check whether the acting account actually has an
 * address on that chain and disclose "no address for this account on this chain" rather than falling back to
 * another account (FR-007).
 */
export function useEffectiveAccount() {
  const connectedAddress = useContext(WalletContext)?.address ?? null
  const active = useContext(CustodyContext)?.active ?? PERSONAL

  return useMemo(() => {
    const mode = active?.mode || 'personal'
    if (mode === 'vault' && active?.vaultAddress) {
      return {
        type: 'vault',
        address: active.vaultAddress,
        label: active.label || null,
        isActingAccount: true,
        connectedAddress: connectedAddress || null,
        chainId: active.chainId ?? null,
      }
    }
    // Recovered legacy accounts and cross-chain derived accounts both surface as an
    // acting EVM address via active.address (spec 062 + 063).
    if ((mode === 'legacy' || mode === 'derived') && active?.address) {
      return {
        type: mode,
        address: active.address,
        label: active.label || null,
        isActingAccount: true,
        connectedAddress: connectedAddress || null,
        chainId: active.chainId ?? null,
      }
    }
    return {
      type: 'personal',
      address: connectedAddress || null,
      label: null,
      isActingAccount: false,
      connectedAddress: connectedAddress || null,
      chainId: null,
    }
  }, [active, connectedAddress])
}

export default useEffectiveAccount
