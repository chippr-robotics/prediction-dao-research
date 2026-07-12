// Spec 043 — vault list + create/load orchestration for the Custody On chain section (US1). Reads the
// member's saved vault references, enriches each with live on-chain state, and exposes create/load actions
// that persist a reference. Honest state: on-chain reads are the source of truth; references are just labels.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '.'
import { isCustodySupported } from '../config/safeContracts'
import {
  createVault as createVaultTx,
  buildCreateVaultTx,
  loadVault,
  isVaultOwner,
} from '../lib/custody/safeVault'
import {
  loadVaultReferences,
  upsertVaultReference,
  removeVaultReference,
} from '../lib/custody/vaultReferences'
import { getPolicyStatus, readPolicy, summarizeRules, isPolicySupported } from '../lib/custody/policy'

/**
 * Spec 049 (US2/FR-006) — per-vault policy badge data for the list. Resilient by design: any
 * failure yields `{}` so the row simply renders without a badge; custody itself is unaffected.
 */
async function readPolicyBadge(vaultAddress, chainId, provider) {
  try {
    if (!isPolicySupported(chainId)) return { policyStatus: 'unsupported' }
    const policyStatus = await getPolicyStatus(vaultAddress, chainId, provider)
    if (policyStatus !== 'managed') return { policyStatus }
    const policy = await readPolicy(vaultAddress, chainId, provider)
    return { policyStatus, policySummary: summarizeRules(policy) }
  } catch {
    return {}
  }
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
    if (!address || !chainId || !supported) {
      setVaults([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const refs = loadVaultReferences(address).filter((r) => r.chainId === Number(chainId))
      const enriched = await Promise.all(
        refs.map(async (ref) => {
          try {
            const state = await loadVault(ref.address, chainId, provider)
            const badge = state.isSafe ? await readPolicyBadge(ref.address, chainId, provider) : {}
            return { ...ref, ...state, owner: isVaultOwner(state, address), ...badge }
          } catch (e) {
            return { ...ref, isSafe: undefined, loadError: e?.message || 'load failed' }
          }
        }),
      )
      if (myReq === reqId.current) setVaults(enriched)
    } catch (e) {
      if (myReq === reqId.current) setError(e?.message || 'Failed to load vaults')
    } finally {
      if (myReq === reqId.current) setLoading(false)
    }
  }, [address, chainId, provider, supported])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Load a vault by address, classify it, and (if it is a Safe) persist a reference. */
  const loadByAddress = useCallback(
    async (rawAddress, label = '', nowMs = 0) => {
      setError(null)
      const state = await loadVault(rawAddress, chainId, provider)
      if (!state.isSafe) {
        const reason = state.reason === 'no-contract' ? 'No contract at this address.' : 'Not a Safe vault.'
        const err = new Error(reason)
        err.classification = state.reason
        throw err
      }
      const owner = isVaultOwner(state, address)
      upsertVaultReference(
        address,
        { chainId: Number(chainId), address: state.address, label, role: owner ? 'owner' : 'watch' },
        nowMs || Date.now(),
      )
      await refresh()
      setActiveAddress(state.address)
      return { ...state, owner }
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
    async (vaultAddress) => {
      removeVaultReference(address, chainId, vaultAddress)
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
