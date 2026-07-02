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
  // Normalise the pool scope so the SAME member renders the SAME two words for EVERYONE, regardless of
  // how the pool address was cased in the URL / navigation that produced it. A checksummed `0xAbC…` and
  // a lowercase `0xabc…` are the same pool, but `solidityPacked(['string'], …)` packs their raw bytes,
  // so an un-normalised scope hashed to different words per viewer — while the commitment-only `suffix`
  // stayed identical (exactly the "#12 / #ba match but the names differ across users" bug). Lowercasing
  // is address-safe and can't throw. NB: this changes the words for any in-flight pool once, after which
  // every viewer agrees.
  const scope = String(poolId).toLowerCase()
  const h = getBigInt(
    keccak256(solidityPacked(['uint256', 'string', 'string'], [commitment, scope, DOMAIN]))
  )

  const adjCount = BigInt(ADJECTIVES.length)
  const nounCount = BigInt(NOUNS.length)
  const adjective = ADJECTIVES[Number(h % adjCount)]
  const noun = NOUNS[Number((h / adjCount) % nounCount)]

  // Short, stable disambiguator from the public commitment for the rare in-pool collision (FR-012).
  const suffix = (commitment & 0xffn).toString(16).padStart(2, '0')

  return { adjective, noun, label: `${adjective} ${noun}`, suffix }
}
