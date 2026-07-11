/**
 * Morpho GraphQL client + normalizers (spec 050).
 *
 * Vault discovery, APY/TVL, and position USD/earnings enrichment come from
 * Morpho's public GraphQL API. This module is the only place that speaks the
 * API's shapes; everything downstream consumes the normalized Vault /
 * PositionEnrichment models (specs/050-earn-lending-rewards/data-model.md).
 *
 * Honest-state rules (constitution III):
 *   - curation is the API's own `listed` flag (vaults shown on the Morpho app)
 *     — never a hand-kept list. The docs' `whitelisted` field was removed from
 *     the live schema (queries using it 400); `listed` is its successor;
 *   - null APY/TVL stays null (rendered "—"), never coerced to 0;
 *   - any transport/GraphQL failure throws MorphoApiError so hooks can map it
 *     to an explicit `unavailable` state — stale numbers are never truth.
 */
import { MORPHO_API_URL, VAULT_LIST_LIMIT } from '../../config/earn'

export class MorphoApiError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'MorphoApiError'
    if (cause) this.cause = cause
  }
}

const VAULTS_QUERY = `
query EarnVaults($chainIds: [Int!]!, $first: Int!) {
  vaults(
    first: $first
    orderBy: TotalAssetsUsd
    orderDirection: Desc
    where: { chainId_in: $chainIds, listed: true }
  ) {
    items {
      address symbol name listed
      state {
        totalAssetsUsd apy netApy
        curators { name }
        allRewards { asset { address symbol } supplyApr }
      }
      asset { name address decimals symbol }
      chain { id }
    }
  }
}`

const POSITIONS_QUERY = `
query EarnPositions($address: String!, $chainId: Int!) {
  userByAddress(address: $address, chainId: $chainId) {
    vaultPositions {
      vault { address }
      state { shares assets assetsUsd pnlUsd }
    }
  }
}`

async function graphql(query, variables, { fetchImpl = fetch } = {}) {
  let res
  try {
    res = await fetchImpl(MORPHO_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  } catch (err) {
    throw new MorphoApiError('Could not reach the lending data service', { cause: err })
  }
  if (!res.ok) throw new MorphoApiError(`Lending data service error (HTTP ${res.status})`)
  let body
  try {
    body = await res.json()
  } catch (err) {
    throw new MorphoApiError('Lending data service returned an unreadable response', { cause: err })
  }
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new MorphoApiError(body.errors[0]?.message || 'Lending data service query failed')
  }
  return body?.data ?? null
}

/** null-safe finite number (API may return null for young/unpriced vaults). */
function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Normalize one API vault item; returns null for items that fail curation or
 * consistency guards (non-listed, chain outside the allowlist, missing
 * coordinates). `chainIds` is the earn-enabled allowlist — vaults are tagged
 * with their own chainId so the multi-network list stays unambiguous
 * (network transparency, like the portfolio).
 */
export function normalizeVault(item, chainIds) {
  const allowed = Array.isArray(chainIds) ? chainIds.map(Number) : [Number(chainIds)]
  if (!item?.address || !item?.asset?.address) return null
  if (item.listed !== true) return null
  const itemChainId = Number(item.chain?.id)
  if (!allowed.includes(itemChainId)) return null
  const decimals = Number(item.asset.decimals)
  if (!Number.isInteger(decimals) || decimals < 0) return null
  // Human curator names ("Gauntlet", "Steakhouse Financial"); the schema's
  // scalar `state.curator` is a raw address — never shown to members.
  const curatorNames = (item.state?.curators || [])
    .map((c) => c?.name)
    .filter(Boolean)
  return {
    address: item.address,
    chainId: itemChainId,
    name: item.name || item.symbol || 'Vault',
    symbol: item.symbol || '',
    asset: {
      address: item.asset.address,
      symbol: item.asset.symbol || '',
      name: item.asset.name || item.asset.symbol || '',
      decimals,
    },
    netApy: numOrNull(item.state?.netApy),
    apy: numOrNull(item.state?.apy),
    rewards: (item.state?.allRewards || [])
      .filter((r) => r?.asset?.symbol != null)
      .map((r) => ({ assetSymbol: r.asset.symbol, supplyApr: numOrNull(r.supplyApr) })),
    totalAssetsUsd: numOrNull(item.state?.totalAssetsUsd),
    curator: curatorNames.length > 0 ? curatorNames.join(' & ') : null,
  }
}

/**
 * Curated vault list across the earn-enabled chains — one query, TVL-ordered
 * (API order preserved), capped at VAULT_LIST_LIMIT. Each vault carries its
 * own chainId so the UI can badge networks like the portfolio does.
 * Throws MorphoApiError on failure.
 */
export async function fetchVaults(chainIds, { fetchImpl } = {}) {
  const allowed = (Array.isArray(chainIds) ? chainIds : [chainIds]).map(Number)
  const data = await graphql(
    VAULTS_QUERY,
    // first is generous: curation drops non-listed items after the fetch.
    { chainIds: allowed, first: 100 },
    { fetchImpl },
  )
  const items = data?.vaults?.items || []
  return items
    .map((item) => normalizeVault(item, allowed))
    .filter(Boolean)
    .slice(0, VAULT_LIST_LIMIT)
}

/**
 * USD/earnings enrichment for the member's vault positions on one chain,
 * keyed by lowercased vault address:
 *   { [vaultAddress]: { assetsUsd, pnlUsd } }
 * A user the API has never seen yields {} (not an error). Throws
 * MorphoApiError on transport failure — callers degrade to on-chain values.
 */
export async function fetchPositionsEnrichment(address, chainId, { fetchImpl } = {}) {
  if (!address) return {}
  let data
  try {
    data = await graphql(
      POSITIONS_QUERY,
      { address: String(address), chainId: Number(chainId) },
      { fetchImpl },
    )
  } catch (err) {
    // The API answers unknown users with a GraphQL error rather than an empty
    // user — treat that specific shape as "no enrichment", keep transport
    // failures loud.
    if (err instanceof MorphoApiError && /no.*user|not.*found/i.test(err.message)) return {}
    throw err
  }
  const positions = data?.userByAddress?.vaultPositions || []
  const byVault = {}
  for (const pos of positions) {
    const vaultAddress = pos?.vault?.address
    if (!vaultAddress) continue
    byVault[vaultAddress.toLowerCase()] = {
      assetsUsd: numOrNull(pos.state?.assetsUsd),
      pnlUsd: numOrNull(pos.state?.pnlUsd),
    }
  }
  return byVault
}
