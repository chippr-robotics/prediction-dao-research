/**
 * Frontend client for the FairWins ZK-Wager Pool gas relayer (spec 034, US3).
 *
 * The relayer is GAS INFRASTRUCTURE, not an app backend (see services/relayer/README.md). It is
 * OPTIONAL: when `VITE_POOL_RELAYER_URL` is unset, `makePoolRelayer()` returns null so the gasless flow
 * falls back to a normal (gas-paying) join — keeping the no-backend footprint intact unless a relayer is
 * explicitly operated.
 *
 * `makePoolRelayer(chainId)` returns a function shaped for `relayGaslessJoin`'s `relayer` arg:
 *   (authorization, { pool, identityCommitment }) => Promise<{ txHash }>
 * It POSTs { chainId, pool, identityCommitment, authorization } to `${VITE_POOL_RELAYER_URL}/relay/pool-join`.
 */

/** The configured relayer base URL, or '' when unset. Read at call time so tests can stub the env. */
function relayerBaseUrl() {
  return (import.meta.env.VITE_POOL_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/** Serialize a value the relayer expects as a uint (bigint/number/hex-or-decimal string) to a string. */
function toUintString(v) {
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number') return Math.trunc(v).toString()
  return String(v)
}

/** Normalize the signed authorization (from gasless.js) into the relayer's JSON-safe shape. */
function serializeAuthorization(auth) {
  return {
    from: auth.from,
    to: auth.to,
    value: toUintString(auth.value),
    validAfter: toUintString(auth.validAfter),
    validBefore: toUintString(auth.validBefore),
    nonce: auth.nonce,
    v: Number(auth.v),
    r: auth.r,
    s: auth.s,
  }
}

/**
 * Build a relayer submit function bound to `chainId`, or null when no relayer URL is configured.
 *
 * The returned function is usable directly as the `relayer` argument to
 * `relayGaslessJoin(relayer, authorization, { pool, identityCommitment })`.
 *
 * @param {number} chainId - The chain the pool lives on (sent in the payload so the relayer picks the
 *   right RPC/signer). Required when a relayer is configured.
 * @returns {null | ((authorization: object, ctx: { pool: string, identityCommitment: bigint|string }) => Promise<{ txHash: string }>)}
 */
export function makePoolRelayer(chainId) {
  const base = relayerBaseUrl()
  if (!base) return null // no relayer operated → caller falls back to a normal join

  return async function relay(authorization, { pool, identityCommitment }) {
    if (chainId == null) throw new Error('relayerClient: chainId is required to relay a pool join')
    if (!pool) throw new Error('relayerClient: pool address is required')

    const payload = {
      chainId: Number(chainId),
      pool,
      identityCommitment: toUintString(identityCommitment),
      authorization: serializeAuthorization(authorization),
    }

    let res
    try {
      res = await fetch(`${base}/relay/pool-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      throw new Error(`Gasless relay request failed: ${e.message}`)
    }

    let data = null
    try {
      data = await res.json()
    } catch {
      // non-JSON body; fall through to status-based error
    }

    if (!res.ok) {
      const code = data?.error?.code ? ` (${data.error.code})` : ''
      const msg = data?.error?.message || `relay failed with status ${res.status}`
      throw new Error(`Gasless relay rejected${code}: ${msg}`)
    }
    if (!data || typeof data.txHash !== 'string') {
      throw new Error('Gasless relay returned no txHash')
    }
    return { txHash: data.txHash }
  }
}
