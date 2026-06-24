import { useCallback } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { getContractAddressForChain } from '../../config/contracts'
import { EXTERNAL_DAO_REGISTRY_ABI } from '../../abis/externalDAORegistry'

// Upper bound on awaiting a confirmation — a broadcast-but-dropped tx must not hang wait() forever (it would
// orphan the persistent in-flight toast). 120s is well beyond a normal confirmation on the live networks.
const CONFIRM_TIMEOUT_MS = 120000

/**
 * Spec 030 — ClearPath hook (external-DAO pillar). Resolves the per-chain ExternalDAORegistry, exposes whether
 * the feature is available on the active network (FR-016/FR-020: truthful self-disable when absent), reads the
 * live registry over RPC (works on subgraph-less Mordor where Olympia lives), and wraps the register write as a
 * real on-chain tx with honest pending/confirmed/failed state surfaced through the app notification system.
 */
export function useClearPath() {
  const { account, signer, provider, chainId, isConnected } = useWallet()
  const { showNotification } = useNotification()

  const registryAddress = getContractAddressForChain('externalDAORegistry', chainId)
  const usdcAddress = getContractAddressForChain('paymentToken', chainId) // per-network USDC for treasury balances
  const isSupported = ethers.isAddress(registryAddress || '')
  const reader = provider || signer?.provider || null

  const registryReader = useCallback(() => {
    if (!isSupported || !reader) return null
    return new ethers.Contract(registryAddress, EXTERNAL_DAO_REGISTRY_ABI, reader)
  }, [isSupported, registryAddress, reader])

  /** Read every external DAO registered on the active network (network-scoped, real on-chain). */
  const listExternalDAOs = useCallback(async () => {
    const reg = registryReader()
    if (!reg) return []
    const n = Number(await reg.externalCount())
    const out = []
    for (let id = n; id >= 1; id--) {
      const [dao, framework, label, registrant, registeredAt] = await reg.getExternalDAO(id)
      out.push({
        id,
        dao,
        framework: Number(framework),
        label,
        registrant,
        registeredAt: Number(registeredAt),
      })
    }
    return out
  }, [registryReader])

  /** Register an external DAO. Real on-chain tx; honest state + notifications. Returns the receipt. */
  const registerExternalDAO = useCallback(
    async ({ dao, framework = 0, label = '' }) => {
      if (!isSupported) {
        showNotification('ClearPath is not available on this network.', 'warning')
        throw new Error('unsupported network')
      }
      if (!signer) {
        showNotification('Connect a wallet to register a DAO.', 'warning')
        throw new Error('no signer')
      }
      const reg = new ethers.Contract(registryAddress, EXTERNAL_DAO_REGISTRY_ABI, signer)
      try {
        // Persistent (duration 0) wallet + mining toasts so the user stays aware across the whole on-chain
        // activity; each is replaced by the next, ending in a confirmed (with tx hash) / failed toast.
        showNotification('Register DAO: confirm in your wallet…', 'info', 0)
        const tx = await reg.registerExternalDAO(dao, framework, label)
        showNotification('Register DAO submitted — awaiting confirmation…', 'info', 0)
        const receipt = await tx.wait(1, CONFIRM_TIMEOUT_MS)
        const ref = tx?.hash ? ` · tx ${tx.hash.slice(0, 6)}…${tx.hash.slice(-4)}` : ''
        showNotification(`Registered ${label || 'DAO'}.${ref}`, 'success')
        return receipt
      } catch (e) {
        // Timeout ≠ confirmed failure — the register may still mine; say so honestly rather than "failed".
        if (e?.code === 'TIMEOUT') {
          showNotification('Register DAO is taking longer than expected — it may still confirm. Check your wallet or the explorer, then Refresh.', 'warning', 0)
        } else {
          showNotification(e?.shortMessage || e?.reason || e?.message || 'Register failed.', 'error')
        }
        throw e
      }
    },
    [isSupported, signer, registryAddress, showNotification]
  )

  return {
    isSupported,
    registryAddress,
    usdcAddress,
    chainId,
    account,
    isConnected,
    reader,
    signer,
    listExternalDAOs,
    registerExternalDAO,
  }
}
