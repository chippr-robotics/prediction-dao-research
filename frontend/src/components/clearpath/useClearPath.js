import { useCallback, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { getContractAddressForChain } from '../../config/contracts'
import { getNetwork } from '../../config/networks'
import { makeReadProvider } from '../../utils/rpcProvider'
import { EXTERNAL_DAO_REGISTRY_ABI } from '../../abis/externalDAORegistry'
import * as trackedDaoStore from './trackedDaoStore'
import { knownDaosForChain } from '../../config/clearpath/knownDaos'

// Upper bound on awaiting a confirmation — a broadcast-but-dropped tx must not hang wait() forever (it would
// orphan the persistent in-flight toast). 120s is well beyond a normal confirmation on the live networks.
const CONFIRM_TIMEOUT_MS = 120000

const READ_ROUTE_KEY = 'clearpath.readRoute.v1'
const readStoredRoute = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(READ_ROUTE_KEY) === 'wallet'
      ? 'wallet'
      : 'public'
  } catch {
    return 'public'
  }
}

// Cache read providers by (chainId → rpcUrl) so the same network always yields the SAME provider instance
// across renders — dependent effects (ExternalDaoView keys reads on `reader`) must not see a fresh provider
// every render. A plain memoized factory keeps referential stability without a hook (React-Compiler friendly).
const READ_PROVIDERS = new Map()
function cachedReadProvider(rpcUrl, chainId) {
  const key = `${chainId}:${rpcUrl}`
  let p = READ_PROVIDERS.get(key)
  if (!p) {
    p = makeReadProvider(rpcUrl, chainId)
    READ_PROVIDERS.set(key, p)
  }
  return p
}

/**
 * Spec 030 + 042 — ClearPath hook.
 *
 * Availability is now capability-driven (spec 042): ClearPath runs on any network that declares the `clearpath`
 * capability AND has a live reader — it does NOT require a deployed ExternalDAORegistry. Where a registry exists
 * (e.g. Mordor) it is used as a shared-discovery overlay and MERGED with the member's device-local tracked list;
 * where it does not (e.g. Ethereum mainnet), the device-local list is the source and a member tracks a DAO by
 * address with no on-chain write. Everything stays strictly network-scoped (FR-014). Reads default to the
 * network's public RPC with a wallet-managed routing option (FR-019); writes always use the wallet signer.
 */
export function useClearPath() {
  // Spec 041/050: passkey smart-account sessions have no `signer`; their writes go through `sendCalls`
  // (one sponsored ERC-4337 UserOp). `loginMethod` picks the rail for the on-chain register write.
  const { account, signer, provider, chainId, isConnected, sendCalls, loginMethod } = useWallet()
  const isPasskey = loginMethod === 'passkey'
  const { showNotification } = useNotification()

  const net = getNetwork(chainId)
  const registryAddress = getContractAddressForChain('externalDAORegistry', chainId)
  const usdcAddress = getContractAddressForChain('paymentToken', chainId) // per-network USDC for treasury balances
  const hasRegistry = ethers.isAddress(registryAddress || '')
  const hasSanctionsSource = ethers.isAddress(getContractAddressForChain('sanctionsGuard', chainId) || '')

  const [readRoute, setReadRouteState] = useState(readStoredRoute)

  // Read routing (FR-019): 'public' → the network's own RPC (default; handles the wide eth_getLogs scans that
  // injected/mobile wallet backends reject; `makeReadProvider` also disables batching on ETC/Mordor). 'wallet' →
  // the connected wallet's provider. Writes ALWAYS use `signer`, independent of this setting.
  const reader = useMemo(() => {
    if (readRoute === 'wallet') return provider || signer?.provider || (net?.rpcUrl ? cachedReadProvider(net.rpcUrl, chainId) : null)
    return net?.rpcUrl ? cachedReadProvider(net.rpcUrl, chainId) : provider || signer?.provider || null
  }, [readRoute, provider, signer, net, chainId])

  // Spec 042: available when the network declares ClearPath AND we have something to read with — NOT gated on a
  // deployed registry (its reads are pure client-side RPC/subgraph).
  const isSupported = Boolean(net?.capabilities?.clearpath) && !!reader

  const setReadRoute = useCallback((route) => {
    const next = route === 'wallet' ? 'wallet' : 'public'
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(READ_ROUTE_KEY, next)
    } catch {
      // storage unavailable — keep the in-memory setting
    }
    setReadRouteState(next)
  }, [])

  const registryReader = useCallback(() => {
    if (!hasRegistry || !reader) return null
    return new ethers.Contract(registryAddress, EXTERNAL_DAO_REGISTRY_ABI, reader)
  }, [hasRegistry, registryAddress, reader])

  /** On-chain registry entries for the active network (empty when no registry is deployed). */
  const listRegistryDAOs = useCallback(async () => {
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
        source: 'registry',
      })
    }
    return out
  }, [registryReader])

  /**
   * Every external DAO on the active network: on-chain registry entries (if a registry is deployed) MERGED with
   * the member's device-local tracked list, de-duplicated by lowercased address (registry wins on conflict).
   * Strictly network-scoped — nothing crosses chains or accounts.
   */
  const listExternalDAOs = useCallback(async () => {
    const registryList = await listRegistryDAOs()
    const localList = trackedDaoStore.list(chainId, account).map((e) => ({
      id: `local:${String(e.address).toLowerCase()}`,
      dao: e.address,
      framework: e.framework,
      label: e.label,
      registrant: account,
      registeredAt: e.addedAt,
      source: 'local',
    }))
    // Curated, on-chain-verified DAOs for this network (e.g. ENS, Uniswap on mainnet) surface by default so a
    // member doesn't have to paste an address to find them; still deduped against registry + local entries.
    const knownList = knownDaosForChain(chainId).map((k) => ({
      id: `known:${String(k.address).toLowerCase()}`,
      dao: k.address,
      framework: k.framework,
      label: k.label,
      registrant: null,
      registeredAt: null,
      source: 'known',
    }))
    const seen = new Set(registryList.map((d) => String(d.dao).toLowerCase()))
    const merged = [...registryList]
    for (const d of [...localList, ...knownList]) {
      const lc = String(d.dao).toLowerCase()
      if (!seen.has(lc)) {
        merged.push(d)
        seen.add(lc)
      }
    }
    return merged
  }, [listRegistryDAOs, chainId, account])

  /** Register an external DAO on-chain (registry networks). Real tx; honest state + notifications. */
  const registerExternalDAO = useCallback(
    async ({ dao, framework = 0, label = '' }) => {
      if (!hasRegistry) {
        showNotification('This network has no on-chain DAO registry.', 'warning')
        throw new Error('no registry')
      }
      // A passkey session has no `signer` but can register via `sendCalls`; only block when neither rail exists.
      if (!isPasskey && !signer) {
        showNotification('Connect a wallet to register a DAO.', 'warning')
        throw new Error('no signer')
      }
      // Spec 041/050 passkey rail: encode the same registerExternalDAO calldata and send it as one sponsored
      // UserOp via `sendCalls` (which already awaits inclusion) instead of a signer-backed contract call.
      if (isPasskey) {
        if (typeof sendCalls !== 'function') {
          showNotification('This wallet cannot register a DAO on the current transaction rail.', 'error')
          throw new Error('no sendCalls')
        }
        try {
          showNotification('Register DAO: confirm in your wallet…', 'info', 0)
          const data = new ethers.Interface(EXTERNAL_DAO_REGISTRY_ABI).encodeFunctionData('registerExternalDAO', [dao, framework, label])
          const sent = await sendCalls([{ target: registryAddress, data, value: 0n }])
          const txHash = sent?.txHash ?? sent?.userOpHash ?? sent?.intentId
          const ref = txHash ? ` · tx ${String(txHash).slice(0, 6)}…${String(txHash).slice(-4)}` : ''
          showNotification(`Registered ${label || 'DAO'}.${ref}`, 'success')
          return sent
        } catch (e) {
          showNotification(e?.shortMessage || e?.reason || e?.message || 'Register failed.', 'error')
          throw e
        }
      }
      const reg = new ethers.Contract(registryAddress, EXTERNAL_DAO_REGISTRY_ABI, signer)
      try {
        showNotification('Register DAO: confirm in your wallet…', 'info', 0)
        const tx = await reg.registerExternalDAO(dao, framework, label)
        showNotification('Register DAO submitted — awaiting confirmation…', 'info', 0)
        const receipt = await tx.wait(1, CONFIRM_TIMEOUT_MS)
        const ref = tx?.hash ? ` · tx ${tx.hash.slice(0, 6)}…${tx.hash.slice(-4)}` : ''
        showNotification(`Registered ${label || 'DAO'}.${ref}`, 'success')
        return receipt
      } catch (e) {
        if (e?.code === 'TIMEOUT') {
          showNotification('Register DAO is taking longer than expected — it may still confirm. Check your wallet or the explorer, then Refresh.', 'warning', 0)
        } else {
          showNotification(e?.shortMessage || e?.reason || e?.message || 'Register failed.', 'error')
        }
        throw e
      }
    },
    [hasRegistry, isPasskey, sendCalls, signer, registryAddress, showNotification]
  )

  /**
   * Track a DAO. On a registry network this is the on-chain register (above); on a registry-less network it is a
   * device-local add (immediate, no tx) — honest "tracked on this device" note, duplicate → truthful notice, no
   * phantom row. The caller validates + framework-detects before calling.
   */
  const trackDAO = useCallback(
    async ({ address, framework = null, label = '' }) => {
      if (hasRegistry) {
        return registerExternalDAO({ dao: address, framework: framework ?? 0, label })
      }
      if (!account) {
        showNotification('Connect a wallet to track a DAO.', 'warning')
        throw new Error('no account')
      }
      const res = trackedDaoStore.add(chainId, account, { address, framework, label })
      if (!res.added && res.reason === 'exists') {
        showNotification('That DAO is already tracked.', 'warning')
        return res
      }
      if (!res.added) {
        showNotification('Could not track this DAO.', 'error')
        throw new Error('track failed')
      }
      showNotification(`Tracking ${label || 'DAO'} on this device.`, 'success')
      return res
    },
    [hasRegistry, registerExternalDAO, account, chainId, showNotification]
  )

  /** Remove a device-local tracked DAO (on-chain registry entries are not removable here). */
  const untrackDAO = useCallback(
    (address) => trackedDaoStore.remove(chainId, account, address),
    [chainId, account]
  )

  return {
    isSupported,
    hasRegistry,
    hasSanctionsSource,
    registryAddress,
    usdcAddress,
    chainId,
    account,
    isConnected,
    reader,
    signer,
    readRoute,
    setReadRoute,
    listExternalDAOs,
    registerExternalDAO,
    trackDAO,
    untrackDAO,
  }
}
