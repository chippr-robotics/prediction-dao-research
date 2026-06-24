import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { getContractAddressForChain } from '../../config/contracts'
import {
  TOKEN_FACTORY_ABI,
  OPEN_ERC20_ABI,
  OPEN_ERC721_ABI,
  RESTRICTED_ERC20_ABI,
  OPEN_ERC20_V2_ABI,
  OPEN_ERC721_V2_ABI,
  RESTRICTED_ERC20_V2_ABI,
  TOKEN_STANDARD,
} from '../../abis/tokenFactory'

/** The role-based v2 ABI for a token of the given standard. */
export function v2AbiForStandard(standard) {
  if (standard === TOKEN_STANDARD.OPEN_ERC721) return OPEN_ERC721_V2_ABI
  if (standard === TOKEN_STANDARD.RESTRICTED_ERC1404) return RESTRICTED_ERC20_V2_ABI
  return OPEN_ERC20_V2_ABI
}

/** The v1 (Ownable) ABI for a token of the given standard. */
export function v1AbiForStandard(standard) {
  if (standard === TOKEN_STANDARD.OPEN_ERC721) return OPEN_ERC721_ABI
  if (standard === TOKEN_STANDARD.RESTRICTED_ERC1404) return RESTRICTED_ERC20_ABI
  return OPEN_ERC20_ABI
}

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
      // Use a MINIMAL ABI with only functions present on BOTH v1 (Ownable) and v2 (AccessControl) tokens.
      // `owner()` exists only on v1 — calling it on a v2 token returns empty data ("missing revert data"),
      // so it must not be read here. Live owner/roles come from detectCapabilities instead.
      if (record.standard === TOKEN_STANDARD.OPEN_ERC721) {
        let paused = false
        try {
          paused = await new ethers.Contract(record.tokenAddress, ['function paused() view returns (bool)'], reader).paused()
        } catch {
          paused = false // v1 ERC-721 has no pause
        }
        return { supplyDisplay: 'NFT collection', paused }
      }
      const c = new ethers.Contract(
        record.tokenAddress,
        [
          'function totalSupply() view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function paused() view returns (bool)',
        ],
        reader
      )
      const [supply, decimals] = await Promise.all([c.totalSupply(), c.decimals()])
      let paused = false
      try {
        paused = await c.paused()
      } catch {
        paused = false
      }
      return { supplyDisplay: `${ethers.formatUnits(supply, decimals)} ${record.symbol}`, paused }
    },
    [reader]
  )

  /**
   * Detect a token's administration model + the connected account's authority (US9, FR-028/SC-014). Probes the
   * deployed token: role-based v2 (AccessControlEnumerable) vs legacy v1 (Ownable). Returns a capability profile
   * the detail UI uses to render ONLY valid, authorized controls. Read-only; never assumes — every flag is from
   * chain.
   */
  const detectCapabilities = useCallback(
    async (record) => {
      if (!reader || !record) return null
      const std = record.standard
      const v2 = new ethers.Contract(record.tokenAddress, v2AbiForStandard(std), reader)
      const base = {
        model: 'v1',
        standard: std,
        isAdmin: false,
        roles: { admin: false, minter: false, pauser: false, burner: false, compliance: false },
        capped: false,
        cap: null,
        paused: false,
        decimals: 18,
      }
      try {
        // v2-only: AccessControlEnumerable enumeration. Reverts on v1 (Ownable).
        await v2.getRoleMemberCount(ethers.ZeroHash)
        base.model = 'v2'
      } catch {
        base.model = 'v1'
      }

      if (base.model === 'v2') {
        const [adminRole, minterRole, pauserRole, burnerRole] = await Promise.all([
          v2.DEFAULT_ADMIN_ROLE(),
          v2.MINTER_ROLE(),
          v2.PAUSER_ROLE(),
          v2.BURNER_ROLE(),
        ])
        const acct = account || ethers.ZeroAddress
        const [admin, minter, pauser, burner] = await Promise.all([
          v2.hasRole(adminRole, acct),
          v2.hasRole(minterRole, acct),
          v2.hasRole(pauserRole, acct),
          v2.hasRole(burnerRole, acct),
        ])
        base.roles = { admin, minter, pauser, burner, compliance: false }
        base.isAdmin = admin
        try {
          base.paused = await v2.paused()
        } catch {
          base.paused = false
        }
        if (std !== TOKEN_STANDARD.OPEN_ERC721) {
          const [cap, capped, decimals] = await Promise.all([v2.cap(), v2.capped(), v2.decimals()])
          base.capped = Boolean(capped)
          base.cap = cap
          base.decimals = Number(decimals)
        }
        if (std === TOKEN_STANDARD.RESTRICTED_ERC1404) {
          const complianceRole = await v2.COMPLIANCE_ROLE()
          base.roles.compliance = await v2.hasRole(complianceRole, acct)
        }
      } else {
        // v1 Ownable
        const v1 = new ethers.Contract(record.tokenAddress, v1AbiForStandard(std), reader)
        const owner = await v1.owner()
        base.isAdmin = Boolean(account) && owner.toLowerCase() === account.toLowerCase()
        base.owner = owner
        base.burnable = record.isBurnable
        base.pausable = record.isPausable
        if (std !== TOKEN_STANDARD.OPEN_ERC721) {
          try {
            base.decimals = Number(await v1.decimals())
          } catch {
            base.decimals = 18
          }
        }
      }
      return base
    },
    [reader, account]
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

  // --- v2 create (role-based + optional cap; cap '' or 0 ⇒ uncapped) ---

  const createOpenERC20V2 = useCallback(
    ({ name, symbol, decimals, initialSupply, cap = '0', metadataURI = '' }) =>
      runCreate((factory) => {
        const d = Number(decimals)
        const supply = ethers.parseUnits(String(initialSupply || '0'), d)
        const capWei = ethers.parseUnits(String(cap || '0'), d) // 0 ⇒ uncapped (contract stores max)
        return factory.createOpenERC20V2(name, symbol, d, supply, capWei, metadataURI)
      }),
    [runCreate]
  )

  const createOpenERC721V2 = useCallback(
    ({ name, symbol, baseURI = '' }) => runCreate((factory) => factory.createOpenERC721V2(name, symbol, baseURI)),
    [runCreate]
  )

  const createRestrictedERC20V2 = useCallback(
    ({ name, symbol, decimals, initialSupply, cap = '0', metadataURI = '', initialEligible = [] }) =>
      runCreate((factory) => {
        const d = Number(decimals)
        const supply = ethers.parseUnits(String(initialSupply || '0'), d)
        const capWei = ethers.parseUnits(String(cap || '0'), d)
        const eligible = initialEligible.filter((a) => ethers.isAddress(a))
        return factory.createRestrictedERC20V2(name, symbol, d, supply, capWei, metadataURI, eligible)
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
    detectCapabilities,
    reader,
    signer,
    // writes (v1)
    createOpenERC20,
    createOpenERC721,
    createRestrictedERC20,
    // writes (v2 role-based)
    createOpenERC20V2,
    createOpenERC721V2,
    createRestrictedERC20V2,
    // tx state
    status,
    error,
    lastTxHash,
  }
}

// Re-export the per-standard ABIs so admin components can attach to issued tokens without another import hop.
export {
  OPEN_ERC20_ABI,
  OPEN_ERC721_ABI,
  RESTRICTED_ERC20_ABI,
  OPEN_ERC20_V2_ABI,
  OPEN_ERC721_V2_ABI,
  RESTRICTED_ERC20_V2_ABI,
  TOKEN_STANDARD,
}

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
