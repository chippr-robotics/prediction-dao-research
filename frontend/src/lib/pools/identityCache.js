/**
 * Device-local cache of a member's pool-identity DISPLAY values (tester feedback on spec 034).
 *
 * Auto-showing the member's nickname and claim code (instead of click-to-reveal) must not re-prompt a
 * wallet signature or re-run a ZK proof on every page view. Both values are derived from the pool
 * identity, whose secret we deliberately do NOT persist (a stolen identity secret could vote/claim as
 * the member). What we cache is safe by construction:
 *   - `commitment` — the member's PUBLIC Semaphore commitment, already visible on-chain in the pool's
 *     Joined event; the nickname derives from it.
 *   - `claimCode`  — the claim-scope nullifier the member deliberately reveals to the creator anyway;
 *     knowing it does not let anyone else claim (claiming needs a fresh proof from the secret).
 * Scoped per account + pool; never throws (private browsing / quota degrade to session-only).
 */

const key = (account, pool) =>
  `fairwins_pool_identity_v1_${String(account || '').toLowerCase()}_${String(pool || '').toLowerCase()}`

/** Read the cached identity display values for (account, pool): { commitment?, claimCode? } or null. */
export function readPoolIdentity(account, pool) {
  if (!account || !pool) return null
  try {
    const raw = localStorage.getItem(key(account, pool))
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Merge-write display values for (account, pool). Unknown fields are preserved. */
export function cachePoolIdentity(account, pool, patch) {
  if (!account || !pool || !patch) return
  try {
    const current = readPoolIdentity(account, pool) || {}
    localStorage.setItem(key(account, pool), JSON.stringify({ ...current, ...patch }))
  } catch {
    /* private browsing / quota — degrade to session-only */
  }
}
