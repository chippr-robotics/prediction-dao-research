import { useCallback } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { getContractAddressForChain } from '../../config/contracts'
import { EXTERNAL_DAO_REGISTRY_ABI } from '../../abis/externalDAORegistry'

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
        const tx = await reg.registerExternalDAO(dao, framework, label)
        showNotification('Register DAO submitted — awaiting confirmation…', 'info')
        const receipt = await tx.wait()
        showNotification(`Registered ${label || 'DAO'}.`, 'success')
        return receipt
      } catch (e) {
        showNotification(e?.shortMessage || e?.reason || e?.message || 'Register failed.', 'error')
        throw e
      }
    },
    [isSupported, signer, registryAddress, showNotification]
  )

  return {
    isSupported,
    registryAddress,
    chainId,
    account,
    isConnected,
    reader,
    signer,
    listExternalDAOs,
    registerExternalDAO,
  }
}
