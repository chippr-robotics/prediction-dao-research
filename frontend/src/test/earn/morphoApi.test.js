/**
 * Morpho API client tests (spec 050, contracts/morpho-api.md) — curation
 * filters, chain guards, null-safe APY/TVL, typed failure, and position
 * enrichment shape.
 */
import { describe, it, expect } from 'vitest'
import {
  fetchVaults,
  fetchPositionsEnrichment,
  normalizeVault,
  MorphoApiError,
} from '../../lib/earn/morphoApi'

const VAULT_ITEM = {
  address: '0xVault1',
  symbol: 'mUSDC',
  name: 'Prime USDC Vault',
  listed: true,
  whitelisted: true,
  state: {
    totalAssetsUsd: 12_345_678,
    apy: 0.031,
    netApy: 0.043,
    curator: 'Prime Curation',
    allRewards: [{ asset: { address: '0xMorpho', symbol: 'MORPHO' }, supplyApr: 0.012 }],
  },
  asset: { name: 'USD Coin', address: '0xUSDC', decimals: 6, symbol: 'USDC' },
  chain: { id: 137 },
}

const okFetch = (data) => async () => ({ ok: true, json: async () => ({ data }) })

describe('normalizeVault', () => {
  it('normalizes a curated vault', () => {
    const vault = normalizeVault(VAULT_ITEM, 137)
    expect(vault).toMatchObject({
      address: '0xVault1',
      chainId: 137,
      name: 'Prime USDC Vault',
      asset: { symbol: 'USDC', decimals: 6 },
      netApy: 0.043,
      apy: 0.031,
      totalAssetsUsd: 12_345_678,
      curator: 'Prime Curation',
    })
    expect(vault.rewards).toEqual([{ assetSymbol: 'MORPHO', supplyApr: 0.012 }])
  })

  it('drops non-listed, non-whitelisted, and foreign-chain items', () => {
    expect(normalizeVault({ ...VAULT_ITEM, listed: false }, 137)).toBeNull()
    expect(normalizeVault({ ...VAULT_ITEM, whitelisted: false }, 137)).toBeNull()
    expect(normalizeVault({ ...VAULT_ITEM, chain: { id: 1 } }, 137)).toBeNull()
  })

  it('keeps missing APY/TVL as null — never zero (honest-state)', () => {
    const vault = normalizeVault(
      { ...VAULT_ITEM, state: { ...VAULT_ITEM.state, netApy: null, totalAssetsUsd: null } },
      137,
    )
    expect(vault.netApy).toBeNull()
    expect(vault.totalAssetsUsd).toBeNull()
  })
})

describe('fetchVaults', () => {
  it('returns normalized, curated vaults', async () => {
    const fetchImpl = okFetch({ vaults: { items: [VAULT_ITEM, { ...VAULT_ITEM, address: '0xV2', listed: false }] } })
    const vaults = await fetchVaults(137, { fetchImpl })
    expect(vaults).toHaveLength(1)
    expect(vaults[0].address).toBe('0xVault1')
  })

  it('throws MorphoApiError on HTTP failure', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503 })
    await expect(fetchVaults(137, { fetchImpl })).rejects.toBeInstanceOf(MorphoApiError)
  })

  it('throws MorphoApiError on network failure', async () => {
    const fetchImpl = async () => {
      throw new Error('offline')
    }
    await expect(fetchVaults(137, { fetchImpl })).rejects.toBeInstanceOf(MorphoApiError)
  })

  it('throws MorphoApiError on GraphQL-level errors', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ errors: [{ message: 'boom' }] }) })
    await expect(fetchVaults(137, { fetchImpl })).rejects.toBeInstanceOf(MorphoApiError)
  })
})

describe('fetchPositionsEnrichment', () => {
  it('keys enrichment by lowercased vault address', async () => {
    const fetchImpl = okFetch({
      userByAddress: {
        vaultPositions: [
          { vault: { address: '0xVAULT1' }, state: { shares: '1', assets: '2', assetsUsd: 100.5, pnlUsd: 2.25 } },
        ],
      },
    })
    const enrichment = await fetchPositionsEnrichment('0xabc', 137, { fetchImpl })
    expect(enrichment['0xvault1']).toEqual({ assetsUsd: 100.5, pnlUsd: 2.25 })
  })

  it('treats an unknown user as empty enrichment, not an error', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ errors: [{ message: 'No user found' }] }) })
    await expect(fetchPositionsEnrichment('0xabc', 137, { fetchImpl })).resolves.toEqual({})
  })
})
