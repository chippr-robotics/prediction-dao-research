/**
 * OpenZeppelin Relayer REST client (contracts/engine-integration.md).
 *
 * The engine sees ONLY a built transaction ({to, value, data, speed}) — never a FairWins intent
 * or the recovered signer; all policy stays in the gateway. One engine `relayerId` exists per
 * (chainId, gasWallet); the mapping lives in config.chains[chainId].engineRelayerId.
 *
 * Written as a thin adapter interface so the engine is swappable (rrelayer/MIT fallback exposes
 * an equivalent submit + webhook surface) without touching policy.
 */
import { EngineUnavailableError } from '../errors.js'

/**
 * @param {{url: string, apiKey?: string|null, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch}} opts
 */
export function createEngineClient({ url, apiKey = null, timeoutMs = 5000, retries = 2, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '')

  async function post(path, body) {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        if (res.status >= 500) {
          lastErr = new EngineUnavailableError(`engine returned ${res.status}`)
          continue // retry on engine-side errors
        }
        if (!res.ok) {
          // 4xx from the engine is a hard error for this request (bad relayer id, paused, ...).
          const text = await res.text().catch(() => '')
          throw new EngineUnavailableError(`engine rejected submission (${res.status}): ${text.slice(0, 200)}`)
        }
        return await res.json()
      } catch (e) {
        if (e instanceof EngineUnavailableError && e.message.startsWith('engine rejected')) throw e
        lastErr = e
      } finally {
        clearTimeout(timer)
      }
    }
    throw new EngineUnavailableError(`engine unreachable after ${retries + 1} attempts`, lastErr)
  }

  return {
    /**
     * Submit a built transaction to the engine's lane for this chain.
     * @param {{relayerId: string, to: string, data: string, speed?: string}} args
     * @returns {Promise<{id: string, hash: string|null, status: string}>}
     */
    async submitTransaction({ relayerId, to, data, speed = 'fast' }) {
      const json = await post(`/api/v1/relayers/${encodeURIComponent(relayerId)}/transactions`, {
        to,
        value: '0',
        data,
        speed,
      })
      // OZ Relayer 1.x wraps payloads as { success, data: {...} }; accept both shapes.
      const tx = json?.data ?? json ?? {}
      const id = tx.id ?? tx.transaction_id ?? null
      if (!id) throw new EngineUnavailableError('engine response missing transaction id')
      return { id: String(id), hash: tx.hash ?? null, status: tx.status ?? 'pending' }
    },
  }
}
