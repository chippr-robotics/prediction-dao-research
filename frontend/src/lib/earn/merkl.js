/**
 * Merkl rewards module (spec 050).
 *
 * Morpho distributes all current rewards through Merkl (MIP-111). Members'
 * reward balances come from the Merkl REST API; claiming calls the Merkl
 * Distributor with the CUMULATIVE earned amount + Merkle proofs (the contract
 * transfers only the unclaimed difference, so repeat claims are safe no-ops).
 * The legacy rewards.morpho.org/URD flow is deprecated and intentionally not
 * implemented — the UI links to Morpho's legacy claim page instead.
 * Contract details: specs/050-earn-lending-rewards/contracts/merkl-rewards.md.
 */
import { MERKL_API_URL } from '../../config/earn'

export class MerklApiError extends Error {
  constructor(message, { cause } = {}) {
    super(message)
    this.name = 'MerklApiError'
    if (cause) this.cause = cause
  }
}

function toBigIntOrZero(v) {
  try {
    return BigInt(v ?? 0)
  } catch {
    return 0n
  }
}

/**
 * Normalize one Merkl reward record into the RewardBalance model
 * (data-model.md). Returns null for records missing token coordinates.
 */
export function normalizeReward(record, { nowMs }) {
  const token = record?.token
  if (!token?.address) return null
  const amount = toBigIntOrZero(record.amount)
  const claimed = toBigIntOrZero(record.claimed)
  const claimable = amount > claimed ? amount - claimed : 0n
  return {
    token: {
      address: token.address,
      symbol: token.symbol || '',
      decimals: Number.isInteger(Number(token.decimals)) ? Number(token.decimals) : 18,
    },
    amount,
    claimed,
    claimable,
    pending: toBigIntOrZero(record.pending),
    proofs: Array.isArray(record.proofs) ? record.proofs : [],
    fetchedAt: nowMs,
  }
}

/**
 * The member's reward balances on one chain. Rewards with nothing claimable
 * AND nothing pending are dropped (there is nothing to show). Throws
 * MerklApiError on failure — the UI maps it to an explicit unavailable state,
 * never a fabricated zero.
 */
export async function fetchRewards(address, chainId, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (!address) return []
  // Merkl requires the lowercased address form.
  const url = `${MERKL_API_URL}/users/${String(address).toLowerCase()}/rewards?chainId=${Number(chainId)}`
  let res
  try {
    res = await fetchImpl(url)
  } catch (err) {
    throw new MerklApiError('Could not reach the rewards service', { cause: err })
  }
  if (!res.ok) throw new MerklApiError(`Rewards service error (HTTP ${res.status})`)
  let body
  try {
    body = await res.json()
  } catch (err) {
    throw new MerklApiError('Rewards service returned an unreadable response', { cause: err })
  }
  const chains = Array.isArray(body) ? body : []
  const rewards = []
  for (const chainBlock of chains) {
    if (Number(chainBlock?.chain?.id) !== Number(chainId)) continue
    for (const record of chainBlock.rewards || []) {
      const normalized = normalizeReward(record, { nowMs })
      if (normalized && (normalized.claimable > 0n || normalized.pending > 0n)) {
        rewards.push(normalized)
      }
    }
  }
  return rewards
}

/**
 * Build the Merkl Distributor claim(users, tokens, amounts, proofs) arguments
 * for every claimable reward. Amounts are the CUMULATIVE `amount`, per the
 * distributor's accounting — never the difference. Returns null when nothing
 * is claimable (callers must not prompt the wallet for a no-op).
 */
export function buildClaimArgs(account, rewards) {
  const claimables = (rewards || []).filter((r) => r.claimable > 0n && r.proofs.length > 0)
  if (!account || claimables.length === 0) return null
  return {
    users: claimables.map(() => account),
    tokens: claimables.map((r) => r.token.address),
    amounts: claimables.map((r) => r.amount),
    proofs: claimables.map((r) => r.proofs),
    rewards: claimables,
  }
}
