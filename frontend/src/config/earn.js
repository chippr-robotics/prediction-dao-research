/**
 * Earn section constants (spec 050 — lending & rewards, issue #861).
 *
 * Global, chain-independent coordinates for the Morpho lending integration and
 * the Merkl rewards program. Per-network coordinates (provider identity, the
 * Merkl distributor address, legacy rewards link) live on each NETWORKS entry's
 * `earn` block — see config/networks.js and
 * specs/050-earn-lending-rewards/contracts/earn-config.md.
 *
 * All values are public canonical endpoints/limits, not secrets.
 */

// Morpho's public GraphQL API — vault discovery, APY/TVL, position enrichment.
// Public, no auth; rate limit 750 req/min (we issue a handful per session).
export const MORPHO_API_URL = 'https://api.morpho.org/graphql'

// Merkl rewards API (Morpho migrated all reward distribution to Merkl under
// MIP-111 — the legacy rewards.morpho.org/URD flow is deprecated).
export const MERKL_API_URL = 'https://api.merkl.xyz/v4'

// Cap on curated vaults surfaced per chain (TVL-ordered, whitelisted+listed
// only). Keeps the list scannable for non-technical members.
export const VAULT_LIST_LIMIT = 20

// Position refresh cadence — aligned with usePortfolio's 60s poll.
export const POSITIONS_POLL_MS = 60_000

/**
 * Build a deep link into the Earn section.
 * `/wallet?tab=earn[&view=lend|rewards][&chain=<id>][&token=<sym>]`
 * `chain` is a hint (the section operates on the active wallet network and
 * prompts a switch when they differ); `token` prefilters the vault list.
 */
export function earnPath({ view, chainId, tokenSymbol } = {}) {
  const params = new URLSearchParams({ tab: 'earn' })
  if (view) params.set('view', view)
  if (chainId != null) params.set('chain', String(chainId))
  if (tokenSymbol) params.set('token', tokenSymbol)
  return `/wallet?${params.toString()}`
}
