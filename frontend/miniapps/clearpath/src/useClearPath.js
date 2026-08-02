import { useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'
import { EXTERNAL_DAO_REGISTRY_ABI } from './externalDAORegistryAbi'
import * as trackedDaoStore from './trackedDaoStore'
import { knownDaosForChain } from './config/knownDaos'

// Upper bound on awaiting a confirmation — a broadcast-but-dropped tx must not hang wait() forever (it would
// orphan the persistent in-flight toast). 120s is well beyond a normal confirmation on the live networks.
const CONFIRM_TIMEOUT_MS = 120000

/**
 * A read provider for any chain, or null when the host has no endpoint for it.
 *
 * `readProvider` THROWS for an unconfigured chain — a real condition, since the member owns their
 * endpoints (spec 069) — and null is how every read path below already spells "cannot read here".
 */
function readerForChain(host, chainId) {
  if (chainId == null) return null
  try {
    return host.readProvider(chainId)
  } catch {
    return null
  }
}

/*
 * THE READ-ROUTE TOGGLE IS GONE, and its absence is the correct outcome rather than a casualty.
 *
 * Host-native this offered 'public' vs 'wallet' reads and hand-built providers from
 * `NETWORKS[chainId].rpcUrl` — something the platform's own guardrails forbid, because it bypasses
 * the member's configured endpoints. A package cannot do it at all: no wallet provider is
 * reachable, and no network config is bundled.
 *
 * `host.readProvider(chainId)` is the spec-069-resolved endpoint — the member's override first,
 * the build default behind it — so the choice the toggle used to offer now lives in one place, the
 * member's own Network settings, and applies everywhere instead of only here.
 */

/** Whether an on-chain ExternalDAORegistry is deployed on `targetChainId`. */
function hasRegistryOn(host, targetChainId) {
  try {
    return ethers.isAddress(host.contracts('externalDAORegistry', targetChainId) || '')
  } catch {
    return false
  }
}

/**
 * Spec 030 + 042 — ClearPath hook.
 *
 * Availability is capability-driven (spec 042): ClearPath runs on any network that declares the `clearpath`
 * capability AND has a live reader — it does NOT require a deployed ExternalDAORegistry. Where a registry exists
 * (e.g. Mordor) it is used as a shared-discovery overlay and MERGED with the member's device-local tracked list;
 * where it does not (e.g. Ethereum mainnet), the device-local list is the source and a member tracks a DAO by
 * address with no on-chain write.
 *
 * Network-agnostic listing (follow-up to spec 042, mirroring the Portfolio pattern in usePortfolio.js):
 * `listExternalDAOs()` scans EVERY `clearpath`-capable network in parallel over each network's own read
 * provider, independent of which chain the wallet is connected to — so a member sees every known/tracked DAO
 * across all networks at once. Reads degrade per-network (a bad RPC on one chain never blanks the others);
 * writes are unaffected and still require the wallet to actually be on the target DAO's chain (checked by the
 * caller before invoking `registerExternalDAO`, and by `ExternalDaoView` before a vote/queue/execute).
 */
export function useClearPath() {
  const host = useMiniAppHost()
  const { address: account, chainId, isConnected } = host.wallet
  const showNotification = useCallback((message, type) => host.toast.show(message, type), [host])

  /** Declared in the manifest allowlist; anything else throws, which would be a packaging bug. */
  const resolve = useCallback(
    (name, forChain) => {
      try {
        return host.contracts(name, forChain)
      } catch {
        return null
      }
    },
    [host],
  )

  /*
   * The chains ClearPath reads, decided by the APP rather than by a host flag.
   *
   * Host-native this filtered on `NETWORKS[id].capabilities.clearpath` — host configuration naming
   * this one app, which is exactly the coupling a mini-app platform should not have. The package
   * now asks the host which chains exist in this cohort and works out for itself where it can
   * operate: a chain qualifies if it carries an ExternalDAORegistry, or if this package ships
   * known DAOs for it. Adding a network becomes a host release again, not a re-publish.
   */
  const chainIds = useMemo(
    () =>
      host
        .networks()
        .filter((id) => ethers.isAddress(resolve('externalDAORegistry', id) || '') || knownDaosForChain(id).length > 0),
    [host, resolve],
  )

  const registryAddress = resolve('externalDAORegistry', chainId)
  const usdcAddress = resolve('paymentToken', chainId) // per-network USDC for treasury balances
  const hasRegistry = ethers.isAddress(registryAddress || '')
  const hasSanctionsSource = ethers.isAddress(resolve('sanctionsGuard', chainId) || '')

  const reader = useMemo(() => readerForChain(host, chainId), [host, chainId])

  /** A read provider for any chain this app operates on. */
  const readerFor = useCallback(
    (targetChainId) =>
      (Number(targetChainId) === Number(chainId) ? reader : readerForChain(host, targetChainId)),
    [host, chainId, reader],
  )

  /*
   * Availability is decided by what this package can actually DO here, not by a host flag naming
   * it: a chain qualifies if ClearPath can read on it and it is one of the chains this app
   * operates on. Reads are pure client-side RPC/subgraph, so a deployed registry is NOT required.
   */
  const isSupported = chainIds.includes(Number(chainId)) && !!reader

  /** On-chain registry entries for `targetChainId` (empty when no registry is deployed there, or on any read failure — never throws). */
  const listRegistryDAOsFor = useCallback(async (targetChainId) => {
    if (!hasRegistryOn(host, targetChainId)) return []
    const targetReader = readerFor(targetChainId)
    if (!targetReader) return []
    const regAddr = resolve('externalDAORegistry', targetChainId)
    const reg = new ethers.Contract(regAddr, EXTERNAL_DAO_REGISTRY_ABI, targetReader)
    const n = Number(await reg.externalCount())
    const out = []
    for (let id = n; id >= 1; id--) {
      const [dao, framework, label, registrant, registeredAt] = await reg.getExternalDAO(id)
      out.push({
        id: `${targetChainId}:${id}`,
        dao,
        framework: Number(framework),
        label,
        registrant,
        registeredAt: Number(registeredAt),
        source: 'registry',
      })
    }
    return out
  }, [host, resolve, readerFor])

  /**
   * Every external DAO on `targetChainId`: on-chain registry entries (if deployed) MERGED with the member's
   * device-local tracked list and the curated known-DAO seed list, de-duplicated by lowercased address
   * (registry wins on conflict). Strictly network-scoped — nothing crosses chains or accounts.
   */
  const listExternalDAOsFor = useCallback(
    async (targetChainId) => {
      const registryList = await listRegistryDAOsFor(targetChainId).catch(() => [])
      const localList = trackedDaoStore.list(host.store, account, targetChainId).map((e) => ({
        id: `local:${targetChainId}:${String(e.address).toLowerCase()}`,
        dao: e.address,
        framework: e.framework,
        label: e.label,
        registrant: account,
        registeredAt: e.addedAt,
        source: 'local',
      }))
      // Curated, on-chain-verified DAOs for this network (e.g. ENS, Uniswap on mainnet) surface by default so a
      // member doesn't have to paste an address to find them; still deduped against registry + local entries.
      const knownList = knownDaosForChain(targetChainId).map((k) => ({
        id: `known:${targetChainId}:${String(k.address).toLowerCase()}`,
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
      const targetNet = host.network(targetChainId)
      return merged.map((d) => ({ ...d, chainId: targetChainId, networkName: targetNet?.name || String(targetChainId) }))
    },
    [listRegistryDAOsFor, account, host]
  )

  /**
   * Every external DAO across EVERY clearpath-capable network (network-agnostic, mirrors usePortfolio). Each
   * network is scanned independently via `Promise.allSettled` — an unreachable RPC on one chain never blanks the
   * others (honest partial degradation). Rows are tagged with `chainId`/`networkName` so the UI can badge them
   * and gate write actions on a network switch.
   */
  const listExternalDAOs = useCallback(async () => {
    const settled = await Promise.allSettled(chainIds.map((id) => listExternalDAOsFor(id)))
    return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }, [chainIds, listExternalDAOsFor])

  /** Register an external DAO on-chain (registry networks). Real tx, signed on the CONNECTED chain; honest state + notifications. */
  const registerExternalDAO = useCallback(
    async ({ dao, framework = 0, label = '' }) => {
      if (!hasRegistry) {
        showNotification('This network has no on-chain DAO registry.', 'warning')
        throw new Error('no registry')
      }
      /*
       * ONE PATH FOR EVERY RAIL. Host-native this branched on `loginMethod` between a signer-bound
       * contract call and an ERC-4337 batch; a package can reach neither, and does not need to —
       * `host.wallet.submit` picks the rail and reports which one answered.
       */
      try {
        showNotification('Register DAO: confirm in your wallet…', 'info')
        const data = new ethers.Interface(EXTERNAL_DAO_REGISTRY_ABI).encodeFunctionData(
          'registerExternalDAO',
          [dao, framework, label],
        )
        const result = await host.wallet.submit({ to: registryAddress, data, value: 0n, chainId })

        if (result.kind === 'proposed') {
          // The Safe still has to approve it; no DAO is registered yet.
          showNotification(`Register ${label || 'DAO'} proposed — it needs the vault's approvals.`, 'info')
          return result
        }

        showNotification('Register DAO submitted — awaiting confirmation…', 'info')
        // `submit` resolves at broadcast; confirmation is this app's job.
        const receipt = await result.wait()
        if (receipt && receipt.status === 0) throw new Error('The registration reverted on-chain.')
        const hash = result.txHash
        const ref = hash ? ` · tx ${String(hash).slice(0, 6)}…${String(hash).slice(-4)}` : ''
        showNotification(`Registered ${label || 'DAO'}.${ref}`, 'success')
        return receipt
      } catch (e) {
        const text = e?.userMessage || e?.shortMessage || e?.reason || e?.message || 'Register failed.'
        showNotification(text.length > 150 ? `${text.slice(0, 149)}…` : text, 'error')
        throw e
      }
    },
    [hasRegistry, host, chainId, registryAddress, showNotification],
  )

  /**
   * Track a DAO on `targetChainId` (defaults to the connected chain). On a network with an on-chain registry
   * this is a real register tx — the caller MUST have already confirmed the wallet is on that chain (e.g. via a
   * "Switch to X" prompt), since a signer can only sign for its connected chain. On a registry-less network it
   * is a device-local add (immediate, no tx, no network switch required) — honest "tracked on this device" note,
   * duplicate → truthful notice, no phantom row.
   */
  const trackDAO = useCallback(
    async ({ address, framework = null, label = '', chainId: targetChainId = chainId }) => {
      if (hasRegistryOn(host, targetChainId)) {
        if (Number(targetChainId) !== Number(chainId)) {
          const targetName = host.network(targetChainId)?.name || 'that network'
          showNotification(`Switch your wallet to ${targetName} to register this DAO.`, 'warning')
          throw new Error('wrong network')
        }
        return registerExternalDAO({ dao: address, framework: framework ?? 0, label })
      }
      if (!account) {
        showNotification('Connect a wallet to track a DAO.', 'warning')
        throw new Error('no account')
      }
      const res = trackedDaoStore.add(host.store, account, targetChainId, { address, framework, label })
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
    [chainId, registerExternalDAO, account, showNotification, host]
  )

  /** Remove a device-local tracked DAO on `targetChainId` (defaults to the connected chain; on-chain registry entries are not removable here). */
  const untrackDAO = useCallback(
    (address, targetChainId = chainId) => trackedDaoStore.remove(host.store, account, targetChainId, address),
    [chainId, account, host.store]
  )

  return {
    isSupported,
    hasRegistry,
    hasRegistryFor: hasRegistryOn,
    hasSanctionsSource,
    registryAddress,
    usdcAddress,
    chainId,
    chainIds,
    account,
    isConnected,
    reader,
    readerFor,
    listExternalDAOs,
    registerExternalDAO,
    trackDAO,
    untrackDAO,
  }
}
