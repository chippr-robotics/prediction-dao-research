import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { getContractAddressForChain } from '../../config/contracts'
import {
  TOKEN_FACTORY_ABI,
  OPEN_ERC20_ABI,
  OPEN_ERC721_ABI,
  RESTRICTED_ERC20_ABI,
  TOKEN_STANDARD,
} from '../../abis/tokenFactory'

/**
 * Spec 028 — token-mint hook. Resolves the per-chain `tokenFactory` deployment, exposes whether the feature is
 * available on the active network (FR-023: disabled with a truthful signal when absent), checks issuance
 * authorization (TOKEN_ISSUER_ROLE), and wraps the create* entrypoints as real on-chain transactions with
 * honest pending/confirmed/failed state (FR-006/FR-024 — no token is surfaced before its tx confirms).
 */
export function useTokenFactory() {
  const { account, signer, provider, chainId, isConnected } = useWallet()

  const factoryAddress = getContractAddressForChain('tokenFactory', chainId)
  const isSupported = ethers.isAddress(factoryAddress || '')

  const [canIssue, setCanIssue] = useState(false)
  const [status, setStatus] = useState('idle') // 'idle' | 'creating' | 'success' | 'error'
  const [error, setError] = useState(null)
  const [lastTxHash, setLastTxHash] = useState(null)

  const reader = provider || signer?.provider || null

  // Resolve whether the connected account may issue (TOKEN_ISSUER_ROLE), so the UI can gate the create flow
  // truthfully rather than letting an unauthorized tx fail on-chain unexpectedly.
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!isSupported || !account || !reader) {
        if (!cancelled) setCanIssue(false)
        return
      }
      try {
        const factory = new ethers.Contract(factoryAddress, TOKEN_FACTORY_ABI, reader)
        const role = await factory.TOKEN_ISSUER_ROLE()
        const allowed = await factory.hasRole(role, account)
        if (!cancelled) setCanIssue(Boolean(allowed))
      } catch {
        if (!cancelled) setCanIssue(false)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [isSupported, factoryAddress, account, reader])

  // Map a raw on-chain TokenRecord tuple to a plain JS record (no BigInt leaking into the UI).
  function mapRecord(r) {
    return {
      id: r.id.toString(),
      standard: Number(r.standard),
      tokenAddress: r.tokenAddress,
      issuer: r.issuer,
      name: r.name,
      symbol: r.symbol,
      metadataURI: r.metadataURI,
      isBurnable: r.isBurnable,
      isPausable: r.isPausable,
      createdAt: Number(r.createdAt),
    }
  }

  /** Read every token the connected account has issued (network-scoped registry → full records). */
  const listMyTokens = useCallback(async () => {
    if (!isSupported || !account || !reader) return []
    const factory = new ethers.Contract(factoryAddress, TOKEN_FACTORY_ABI, reader)
    const ids = await factory.getTokensByIssuer(account)
    return Promise.all(ids.map(async (id) => mapRecord(await factory.getToken(id))))
  }, [isSupported, factoryAddress, account, reader])

  /**
   * Public discovery (US5): the most recent tokens on the active network, newest first. Capped at `limit` to
   * bound RPC reads (the subgraph is the unbounded path once deployed); `{ records, total, truncated }` so the
   * UI can honestly say "latest N of M" rather than silently hiding tokens.
   */
  const listAllTokens = useCallback(
    async (limit = 100) => {
      if (!isSupported || !reader) return { records: [], total: 0, truncated: false }
      const factory = new ethers.Contract(factoryAddress, TOKEN_FACTORY_ABI, reader)
      const total = Number(await factory.tokenCount())
      const ids = []
      for (let id = total; id >= 1 && ids.length < limit; id--) ids.push(id)
      const records = await Promise.all(ids.map(async (id) => mapRecord(await factory.getToken(id))))
      return { records, total, truncated: total > records.length }
    },
    [isSupported, factoryAddress, reader]
  )

  /**
   * Read a single token's LIVE on-chain state for its public profile (US5): owner, live supply (fungible),
   * and paused state (pausable). ERC-721 has no enumerable supply, so it reports a collection label instead.
   */
  const readTokenLive = useCallback(
    async (record) => {
      if (!reader || !record) return null
      if (record.standard === TOKEN_STANDARD.OPEN_ERC721) {
        const c = new ethers.Contract(record.tokenAddress, OPEN_ERC721_ABI, reader)
        return { owner: await c.owner(), supplyDisplay: 'NFT collection', paused: false }
      }
      const abi = record.standard === TOKEN_STANDARD.RESTRICTED_ERC1404 ? RESTRICTED_ERC20_ABI : OPEN_ERC20_ABI
      const c = new ethers.Contract(record.tokenAddress, abi, reader)
      const [supply, decimals, owner] = await Promise.all([c.totalSupply(), c.decimals(), c.owner()])
      let paused = false
      if (record.standard === TOKEN_STANDARD.OPEN_ERC20 && record.isPausable) {
        try {
          paused = await c.paused()
        } catch {
          paused = false
        }
      }
      return {
        owner,
        supplyDisplay: `${ethers.formatUnits(supply, decimals)} ${record.symbol}`,
        paused,
      }
    },
    [reader]
  )

  // Shared write wrapper: enforces support + signer, tracks honest tx state, returns the created token address.
  const runCreate = useCallback(
    async (fn) => {
      if (!isSupported) throw new Error('Token issuance is not available on this network.')
      if (!signer) throw new Error('Connect a wallet to create a token.')
      setStatus('creating')
      setError(null)
      setLastTxHash(null)
      try {
        const factory = new ethers.Contract(factoryAddress, TOKEN_FACTORY_ABI, signer)
        const tx = await fn(factory)
        setLastTxHash(tx.hash)
        const receipt = await tx.wait()
        // Pull the deployed token address from the TokenCreated event (only finalized after confirmation).
        let tokenAddress = null
        let id = null
        for (const log of receipt.logs || []) {
          try {
            const parsed = factory.interface.parseLog(log)
            if (parsed?.name === 'TokenCreated') {
              tokenAddress = parsed.args.token
              id = parsed.args.id.toString()
              break
            }
          } catch {
            /* not a factory event */
          }
        }
        setStatus('success')
        return { id, tokenAddress, txHash: tx.hash }
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.reason || e?.message || 'Token creation failed.')
        throw e
      }
    },
    [isSupported, factoryAddress, signer]
  )

  const createOpenERC20 = useCallback(
    ({ name, symbol, decimals, initialSupply, metadataURI = '', burnable = false, pausable = false }) =>
      runCreate((factory) => {
        const supply = ethers.parseUnits(String(initialSupply || '0'), Number(decimals))
        return factory.createOpenERC20(name, symbol, Number(decimals), supply, metadataURI, burnable, pausable)
      }),
    [runCreate]
  )

  const createOpenERC721 = useCallback(
    ({ name, symbol, baseURI = '', burnable = false }) =>
      runCreate((factory) => factory.createOpenERC721(name, symbol, baseURI, burnable)),
    [runCreate]
  )

  const createRestrictedERC20 = useCallback(
    ({ name, symbol, decimals, initialSupply, metadataURI = '', initialEligible = [] }) =>
      runCreate((factory) => {
        const supply = ethers.parseUnits(String(initialSupply || '0'), Number(decimals))
        const eligible = initialEligible.filter((a) => ethers.isAddress(a))
        return factory.createRestrictedERC20(name, symbol, Number(decimals), supply, metadataURI, eligible)
      }),
    [runCreate]
  )

  return {
    // network/feature state
    isSupported,
    factoryAddress,
    chainId,
    isConnected,
    account,
    // authorization
    canIssue,
    // reads
    listMyTokens,
    listAllTokens,
    readTokenLive,
    // writes
    createOpenERC20,
    createOpenERC721,
    createRestrictedERC20,
    // tx state
    status,
    error,
    lastTxHash,
  }
}

// Re-export the per-standard ABIs so admin components can attach to issued tokens without another import hop.
export { OPEN_ERC20_ABI, OPEN_ERC721_ABI, RESTRICTED_ERC20_ABI, TOKEN_STANDARD }

/**
 * A truthful, human-readable summary of the rules governing a token (US5, FR-025). Derived from the registry
 * record (standard + flags) so it never overstates what the on-chain token enforces.
 */
export function tokenRuleSummary(record) {
  if (!record) return ''
  switch (record.standard) {
    case TOKEN_STANDARD.RESTRICTED_ERC1404:
      return 'Identity-restricted (ERC-1404): only eligible, unfrozen, unsanctioned addresses may hold or transfer.'
    case TOKEN_STANDARD.PERMISSIONED_ERC3643:
      return 'Permissioned security token (ERC-3643): identity-verified holders only.'
    case TOKEN_STANDARD.OPEN_ERC721: {
      const bits = ['Open NFT collection — anyone may hold or transfer (subject to sanctions screening).']
      if (record.isBurnable) bits.push('Holders may burn.')
      return bits.join(' ')
    }
    case TOKEN_STANDARD.OPEN_ERC20:
    default: {
      const bits = ['Open token — anyone may hold or transfer (subject to sanctions screening).']
      if (record.isBurnable) bits.push('Burnable.')
      if (record.isPausable) bits.push('Pausable by the owner.')
      return bits.join(' ')
    }
  }
}
