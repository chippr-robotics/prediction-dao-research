// Spec 043 — vault list + create/load orchestration for the Custody On chain section (US1). Reads the
// member's saved vault references, enriches each with live on-chain state, and exposes create/load actions
// that persist a reference. Honest state: on-chain reads are the source of truth; references are just labels.
//
// Spec 068 (US1) makes the list MULTI-CHAIN: every saved vault is listed with its own chain identity
// regardless of which network the wallet is on, each enriched through a read provider for ITS chain.
// Enrichment failures are isolated per vault — one unreachable network must never blank the list —
// and `onVaultChain` gates every state-changing action so nothing can be submitted to the wrong chain.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '.'
import { isCustodySupported, CUSTODY_SUPPORTED_CHAIN_IDS } from '../config/safeContracts'
import { NETWORKS } from '../config/networks'
import { getProvider } from '../utils/blockchainService'
import {
  createVault as createVaultTx,
  buildCreateVaultTx,
  loadVault,
  findVaultAcrossChains,
  parseVaultAddressInput,
  isVaultOwner,
} from '../lib/custody/safeVault'
import {
  loadVaultReferences,
  upsertVaultReference,
  removeVaultReference,
} from '../lib/custody/vaultReferences'
import { readPolicy, summarizeRules } from '../lib/custody/policy'
import { getPolicyStatus as getPolicyStatusV2, readPolicyV2 } from '../lib/custody/policyV2'

/**
 * Spec 049 (US2/FR-006) — per-vault policy badge data for the list. Resilient by design: any
 * failure yields `{}` so the row simply renders without a badge; custody itself is unaffected.
 * Spec 068 adds the ordered engine: a `managed-v2` vault carries its rule count instead of a v1
 * rule summary.
 */
async function readPolicyBadge(vaultAddress, chainId, provider) {
  try {
    const policyStatus = await getPolicyStatusV2(vaultAddress, chainId, provider)
    if (policyStatus === 'managed-v2') {
      const policy = await readPolicyV2(vaultAddress, chainId, provider)
      const count = policy?.rules?.length ?? 0
      return { policyStatus, policySummary: `${count} ordered rule${count === 1 ? '' : 's'}` }
    }
    if (policyStatus !== 'managed') return { policyStatus }
    const policy = await readPolicy(vaultAddress, chainId, provider)
    return { policyStatus, policySummary: summarizeRules(policy) }
  } catch {
    return {}
  }
}

/**
 * Chain identity for a saved vault (FR-002). Strict lookup only: `getNetwork()` falls back to the
 * default network for unknown ids, which would label a vault with the wrong chain — for custody
 * that is exactly the confusion this feature exists to prevent.
 */
function chainIdentity(chainId) {
  const net = NETWORKS[Number(chainId)]
  if (!net) return { chainName: `Chain ${Number(chainId)}`, isTestnet: false, chainKnown: false }
  return { chainName: net.name, isTestnet: Boolean(net.isTestnet), chainKnown: true }
}

export function useCustodyVaults() {
  const { address, chainId, signer, provider, sendCalls, loginMethod } = useWallet()
  const isPasskey = loginMethod === 'passkey'
  const [vaults, setVaults] = useState([])
  const [activeAddress, setActiveAddress] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqId = useRef(0)

  const supported = isCustodySupported(chainId)

  const refresh = useCallback(async () => {
    // Bump first so any in-flight request is invalidated even on the early-return path.
    const myReq = ++reqId.current
    if (!address) {
      setVaults([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Every saved vault, on every chain (FR-003) — the list is the member's whole custody estate,
      // not a view of the connected network.
      const refs = loadVaultReferences(address)
      const enriched = await Promise.all(
        refs.map(async (ref) => {
          const refChainId = Number(ref.chainId)
          const onVaultChain = Number(chainId) === refChainId
          const identity = chainIdentity(refChainId)
          try {
            // Read through a provider for the VAULT's chain. The connected wallet provider is only
            // usable when it is already on that chain; otherwise fall back to the chain's own RPC.
            const reader = onVaultChain ? provider : getProvider(refChainId)
            const state = await loadVault(ref.address, refChainId, reader)
            const badge = state.isSafe ? await readPolicyBadge(ref.address, refChainId, reader) : {}
            return {
              ...ref,
              ...identity,
              ...state,
              chainId: refChainId,
              onVaultChain,
              reachable: true,
              owner: isVaultOwner(state, address),
              ...badge,
            }
          } catch (e) {
            // Per-vault isolation (FR-003): an unreachable chain degrades ONE row, honestly, and
            // never blanks the rest of the estate.
            return {
              ...ref,
              ...identity,
              chainId: refChainId,
              onVaultChain,
              reachable: false,
              isSafe: undefined,
              loadError: e?.message || 'load failed',
            }
          }
        }),
      )
      if (myReq === reqId.current) setVaults(enriched)
    } catch (e) {
      if (myReq === reqId.current) setError(e?.message || 'Failed to load vaults')
    } finally {
      if (myReq === reqId.current) setLoading(false)
    }
  }, [address, chainId, provider])

  useEffect(() => {
    refresh()
  }, [refresh])

  /**
   * Load a vault by address and persist a reference.
   *
   * Spec 068 — searches EVERY custody chain, not just the connected one. A member with a vault
   * address rarely knows (or should have to know) which chain it is on; making them switch networks
   * until one sticks is not a discovery mechanism. `preferredChainId` pins the choice when the same
   * address is a Safe on more than one chain.
   *
   * The error distinguishes "no Safe anywhere we could reach" from "some chains were unreachable",
   * so a dead RPC never reads as "your vault does not exist".
   */
  const loadByAddress = useCallback(
    async (rawAddress, label = '', nowMs = 0, { preferredChainId } = {}) => {
      setError(null)
      // Safe UIs (incl. the ETC Cooperative fork) display EIP-3770-prefixed addresses
      // ("ETC:0x…", "ETCM:0x…") and members paste them verbatim: strip the prefix and use a
      // recognized one as a chain hint, ranked below an explicit member choice.
      const { address: cleanAddress, chainHint } = parseVaultAddressInput(rawAddress)
      const { matches, unreachable, searched } = await findVaultAcrossChains(
        cleanAddress,
        CUSTODY_SUPPORTED_CHAIN_IDS,
        { providerFor: (id) => (Number(id) === Number(chainId) ? provider : getProvider(id)) },
      )

      if (matches.length === 0) {
        const names = searched.map((id) => chainIdentity(id).chainName).join(', ')
        const err = new Error(
          unreachable.length > 0
            ? `No Safe vault found at this address on ${names}. ` +
              `${unreachable.map((u) => chainIdentity(u.chainId).chainName).join(', ')} could not be reached, ` +
              `so it may exist there — try again shortly.`
            : `No Safe vault found at this address on any supported network (${names}).`,
        )
        err.classification = 'not-found-anywhere'
        err.unreachable = unreachable
        throw err
      }

      // Same address, multiple chains: honour an explicit choice, else the pasted prefix's chain,
      // else prefer the connected chain, else the first hit. All matches are returned so the
      // caller can offer the rest.
      const picked =
        matches.find((m) => Number(m.chainId) === Number(preferredChainId)) ||
        (chainHint != null && matches.find((m) => Number(m.chainId) === Number(chainHint))) ||
        matches.find((m) => Number(m.chainId) === Number(chainId)) ||
        matches[0]

      const owner = isVaultOwner(picked, address)
      upsertVaultReference(
        address,
        { chainId: Number(picked.chainId), address: picked.address, label, role: owner ? 'owner' : 'watch' },
        nowMs || Date.now(),
      )
      await refresh()
      setActiveAddress(picked.address)
      return { ...picked, owner, matches, unreachable }
    },
    [address, chainId, provider, refresh],
  )

  /** Create a new vault and persist its reference (owner role). `policySetup` (spec 049, optional)
   * attaches a policy guard atomically at creation. */
  const createVault = useCallback(
    async ({ owners, threshold, saltNonce, label = '', policySetup }, nowMs = 0) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to create a vault')
      setError(null)
      let vaultAddress
      let txHash
      if (isPasskey) {
        // Passkey rail: send createProxyWithNonce as ONE sponsored UserOp. A UserOp receipt has no
        // parseable ProxyCreation log, so the deterministic CREATE2 address (predictedAddress) is
        // authoritative for the deployed vault.
        const tx = await buildCreateVaultTx({ chainId, owners, threshold, saltNonce, policySetup, provider })
        const sent = await sendCalls([{ target: tx.to, data: tx.data, value: tx.value ?? 0n }])
        vaultAddress = tx.predictedAddress
        txHash = sent?.txHash ?? sent?.userOpHash ?? sent?.intentId
      } else {
        const res = await createVaultTx({ signer, chainId, owners, threshold, saltNonce, policySetup })
        vaultAddress = res.address
        txHash = res.txHash
      }
      upsertVaultReference(
        address,
        { chainId: Number(chainId), address: vaultAddress, label, role: 'owner' },
        nowMs || Date.now(),
      )
      await refresh()
      setActiveAddress(vaultAddress)
      return { address: vaultAddress, txHash }
    },
    [isPasskey, signer, sendCalls, provider, address, chainId, refresh],
  )

  /** Preview the deterministic address a new vault would deploy to (before signing, FR US1). */
  const previewVaultAddress = useCallback(
    async ({ owners, threshold, saltNonce, policySetup }) => {
      const { predictedAddress } = await buildCreateVaultTx({
        chainId,
        owners,
        threshold,
        saltNonce,
        policySetup,
        provider,
      })
      return predictedAddress
    },
    [chainId, provider],
  )

  const forget = useCallback(
    async (vaultAddress, vaultChainId) => {
      // References are keyed (chainId, address); with a cross-chain list the caller's vault may not
      // live on the connected chain, so accept its chain explicitly and fall back to the connected
      // one for legacy call sites.
      removeVaultReference(address, vaultChainId ?? chainId, vaultAddress)
      if (activeAddress === vaultAddress) setActiveAddress(null)
      await refresh()
    },
    [address, chainId, activeAddress, refresh],
  )

  const activeVault = vaults.find((v) => v.address === activeAddress) || null

  return {
    supported,
    vaults,
    activeVault,
    activeAddress,
    selectVault: setActiveAddress,
    loading,
    error,
    refresh,
    loadByAddress,
    createVault,
    previewVaultAddress,
    forget,
  }
}

export default useCustodyVaults
