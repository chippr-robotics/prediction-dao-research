/**
 * Local Semaphore identity for a pool member (spec 034).
 *
 * The identity is derived deterministically from a wallet signature over a pool-scoped, domain-separated
 * message, so the same wallet always reproduces the same in-pool identity (and therefore the same public
 * commitment + nickname) without any server. The secret never leaves the device. The Semaphore package is
 * code-split into a lazy chunk (a static-specifier dynamic import) so it only loads when a user actually
 * joins/interacts with a pool, without bloating the main bundle.
 */

/** Stable, domain-separated message the wallet signs to seed its in-pool identity. */
export function identityMessage(poolAddress) {
  return `FairWins ZK-Wager Pool\nDerive my anonymous identity for pool:\n${poolAddress}`
}

/**
 * Create (deterministically) the member's Semaphore identity for a pool.
 * @param {import('ethers').Signer} signer
 * @param {string} poolAddress
 * @returns {Promise<{ identity: any, commitment: bigint }>}
 */
export async function createPoolIdentity(signer, poolAddress) {
  // Static specifier → Vite/Rollup code-splits @semaphore-protocol/identity into a lazy chunk that
  // loads on first pool interaction (the package is a real dependency; see frontend/package.json).
  let mod
  try {
    mod = await import('@semaphore-protocol/identity')
  } catch (e) {
    throw new Error(`Could not load anonymous identity support (@semaphore-protocol/identity): ${e?.message || e}`)
  }
  const Identity = mod.Identity
  const seed = await signer.signMessage(identityMessage(poolAddress))
  const identity = new Identity(seed)
  return { identity, commitment: identity.commitment }
}
