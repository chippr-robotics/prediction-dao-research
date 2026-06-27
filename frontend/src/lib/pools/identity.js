/**
 * Local Semaphore identity for a pool member (spec 034).
 *
 * The identity is derived deterministically from a wallet signature over a pool-scoped, domain-separated
 * message, so the same wallet always reproduces the same in-pool identity (and therefore the same public
 * commitment + nickname) without any server. The secret never leaves the device. The Semaphore package is
 * loaded lazily (and kept out of the bundle via `@vite-ignore`) so the rest of the app builds without it
 * until pool joins ship.
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
  // The specifier is held in a variable so the bundler does NOT statically resolve it at build
  // time (the package ships with pool joins, not yet). It resolves at runtime once installed.
  const identityPackage = '@semaphore-protocol/identity'
  let mod
  try {
    mod = await import(/* @vite-ignore */ identityPackage)
  } catch {
    throw new Error('Anonymous identity support is not installed yet (@semaphore-protocol/identity).')
  }
  const Identity = mod.Identity
  const seed = await signer.signMessage(identityMessage(poolAddress))
  const identity = new Identity(seed)
  return { identity, commitment: identity.commitment }
}
