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

export function useCustodyVaults() {
  const { address, chainId, signer, provider } = useWallet()
  const [vaults, setVaults] = useState([])
  const [activeAddress, setActiveAddress] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqId = useRef(0)

  const supported = isCustodySupported(chainId)

  const refresh = useCallback(async () => {
    if (!address || !chainId || !supported) {
      setVaults([])
      return
    }
    const myReq = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const refs = loadVaultReferences(address).filter((r) => r.chainId === Number(chainId))
      const enriched = await Promise.all(
        refs.map(async (ref) => {
          try {
            const state = await loadVault(ref.address, chainId, provider)
            return { ...ref, ...state, owner: isVaultOwner(state, address) }
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

  /** Create a new vault and persist its reference (owner role). */
  const createVault = useCallback(
    async ({ owners, threshold, saltNonce, label = '' }, nowMs = 0) => {
      if (!signer) throw new Error('Connect a wallet to create a vault')
      setError(null)
      const { address: vaultAddress, txHash } = await createVaultTx({
        signer,
        chainId,
        owners,
        threshold,
        saltNonce,
      })
      upsertVaultReference(
        address,
        { chainId: Number(chainId), address: vaultAddress, label, role: 'owner' },
        nowMs || Date.now(),
      )
      await refresh()
      setActiveAddress(vaultAddress)
      return { address: vaultAddress, txHash }
    },
    [signer, address, chainId, refresh],
  )

  /** Preview the deterministic address a new vault would deploy to (before signing, FR US1). */
  const previewVaultAddress = useCallback(
    async ({ owners, threshold, saltNonce }) => {
      const { predictedAddress } = await buildCreateVaultTx({
        chainId,
        owners,
        threshold,
        saltNonce,
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
