/**
 * Two-word anonymous nicknames for ZK-Wager Pools (spec 034, FR-009/FR-011/FR-012).
 *
 * Derived deterministically from a member's PUBLIC identity commitment so ANY member can reproduce
 * every member's nickname (e.g. to render a leaderboard) — and never from a wallet address. This is a
 * pure client-side display function; the nickname is NEVER written to or read from the chain.
 */
import { keccak256, solidityPacked, getBigInt } from 'ethers'
import { ADJECTIVES, NOUNS, NICKNAME_VERSION } from './nicknameWords'

const DOMAIN = `FAIRWINS_POOL_NICK_v${NICKNAME_VERSION}`

/**
 * Derive a stable nickname for an in-pool identity.
 * @param {bigint|string|number} identityCommitment the member's public Semaphore commitment
 * @param {string|number} [poolId] scopes the nickname to a pool (optional but recommended)
 * @returns {{ adjective: string, noun: string, label: string, suffix: string }}
 */
export function deriveNickname(identityCommitment, poolId = '') {
  const commitment = getBigInt(identityCommitment)
  const h = getBigInt(
    keccak256(solidityPacked(['uint256', 'string', 'string'], [commitment, String(poolId), DOMAIN]))
  )

  const adjCount = BigInt(ADJECTIVES.length)
  const nounCount = BigInt(NOUNS.length)
  const adjective = ADJECTIVES[Number(h % adjCount)]
  const noun = NOUNS[Number((h / adjCount) % nounCount)]

  // Short, stable disambiguator from the public commitment for the rare in-pool collision (FR-012).
  const suffix = (commitment & 0xffn).toString(16).padStart(2, '0')

  return { adjective, noun, label: `${adjective} ${noun}`, suffix }
}
