/**
 * Per-chain read providers with ordered failover (FR-007: >=2 independent endpoints, no single
 * provider is a hard dependency). The gateway only READS (sanctions screen, gas estimate,
 * health probe, balance) — all writes go through the engine, which has its own rpc_urls failover.
 *
 * ETC/Mordor (61/63): batchMaxCount: 1 — their Caddy-fronted endpoints return batch responses
 * ethers v6 cannot decode (mirrors frontend/src/utils/rpcProvider.js NO_BATCH_CHAIN_IDS).
 */
import { ethers } from 'ethers'

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * A minimal failover wrapper exposing only the read methods the gateway uses.
 * Tries endpoints in configured order; first success wins; throws the last error if all fail.
 */
export function makeFailoverProvider(chainCfg, { timeoutMs = 4000 } = {}) {
  const inner = chainCfg.rpcUrls.map(
    (url) =>
      new ethers.JsonRpcProvider(url, chainCfg.chainId, {
        staticNetwork: ethers.Network.from(chainCfg.chainId),
        ...(chainCfg.noBatch ? { batchMaxCount: 1 } : {}),
      })
  )

  async function attempt(fnName, args) {
    let lastErr
    for (const provider of inner) {
      try {
        return await withTimeout(provider[fnName](...args), timeoutMs, `${fnName}@chain${chainCfg.chainId}`)
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr ?? new Error(`no RPC endpoints configured for chain ${chainCfg.chainId}`)
  }

  return {
    chainId: chainCfg.chainId,
    call: (tx) => attempt('call', [tx]),
    estimateGas: (tx) => attempt('estimateGas', [tx]),
    getFeeData: () => attempt('getFeeData', []),
    getBalance: (address) => attempt('getBalance', [address]),
    getBlockNumber: () => attempt('getBlockNumber', []),
  }
}

/** Build the default provider map { chainId -> failover provider }. Injectable in tests. */
export function buildProviders(config) {
  const providers = {}
  for (const chainId of config.enabledChainIds) {
    providers[chainId] = makeFailoverProvider(config.chains[chainId], { timeoutMs: config.rpcTimeoutMs })
  }
  return providers
}

/**
 * Display-safe form of an RPC endpoint: `https://<host>/<redacted>`.
 *
 * Some endpoints carry their credential IN THE PATH (QuickNode, Alchemy and Infura all do), so the
 * URL itself is a secret and every log, error and status line has to go through here. Mirrors
 * `frontend/src/lib/network/rpcEndpoints.js#redactRpcUrl`, for the same reason.
 */
export function redactRpcUrl(url) {
  try {
    const u = new URL(url)
    return u.pathname === '/' && !u.search ? `${u.protocol}//${u.host}` : `${u.protocol}//${u.host}/<redacted>`
  } catch {
    return '(unparseable endpoint)'
  }
}

/**
 * Ask every configured endpoint which chain it serves, and refuse to boot on a mismatch.
 *
 * WHY THIS EXISTS. `makeFailoverProvider` above builds each `JsonRpcProvider` with `staticNetwork`,
 * which tells ethers to TRUST the configured chain id and never verify it. That is a deliberate
 * latency choice, and it is exactly what makes a wrong endpoint silent: the gateway would screen
 * sanctions, estimate gas and read paymaster deposits against another chain's state while
 * reporting rpc:"up" the whole time.
 *
 * The credential shape in use makes that easy to do by accident. A QuickNode Multi-Chain endpoint
 * picks the chain from a hostname infix on ONE shared token — `<name>.matic.quiknode.pro` is
 * Polygon, `<name>.matic-amoy.quiknode.pro` is Amoy — so a mis-set variable returns HTTP 200 with
 * valid data from the wrong chain instead of a 401. There is no in-band signal at all.
 *
 * THREE OUTCOMES, NOT TWO — the same distinction the SPA draws in
 * `frontend/src/lib/network/rpcEndpoints.js#probeRpcEndpoint`:
 *
 *   ok           the endpoint answered with the chain id we configured it for.
 *   mismatch     it answered with a DIFFERENT one. Not transient, not fixed by retrying, and
 *                strictly worse than being down — so this is FATAL at boot.
 *   unreachable  it could not be asked (timeout, non-2xx, malformed body). This is NOT a mismatch
 *                and must never be promoted to one: an RPC being down is the ordinary case the
 *                failover list exists for, and refusing to boot over it would take the gasless
 *                path down for a condition that resolves itself. Warned, loudly, and named.
 *
 * Every endpoint is checked, not just the first — a wrong entry sitting second in the list is
 * invisible until the primary fails, which is the worst possible moment to discover it.
 *
 * @returns {Promise<{ok: boolean, mismatches: object[], unreachable: object[]}>}
 */
export async function assertChainEndpoints(config, { fetchImpl, timeoutMs = 5000, log = console } = {}) {
  const doFetch = fetchImpl || fetch
  const mismatches = []
  const unreachable = []

  const probe = async (chainId, url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: controller.signal,
      })
      if (!res.ok) return { code: 'unreachable', detail: `HTTP ${res.status}` }
      const body = await res.json()
      const reported = body?.result != null ? Number(body.result) : Number.NaN
      if (!Number.isFinite(reported)) return { code: 'unreachable', detail: 'no chain id in response' }
      if (reported !== Number(chainId)) return { code: 'mismatch', detail: `serves chain ${reported}` }
      return { code: 'ok', detail: `chain ${reported}` }
    } catch {
      // Never echo the caught error: a thrown fetch error can carry the full URL, credential included.
      return { code: 'unreachable', detail: 'request failed or timed out' }
    } finally {
      clearTimeout(timer)
    }
  }

  for (const chainId of config.enabledChainIds) {
    const urls = config.chains[chainId]?.rpcUrls ?? []
    const results = await Promise.all(urls.map(async (url) => ({ url, ...(await probe(chainId, url)) })))
    for (const r of results) {
      const entry = { chainId, endpoint: redactRpcUrl(r.url), detail: r.detail }
      if (r.code === 'mismatch') mismatches.push(entry)
      else if (r.code === 'unreachable') unreachable.push(entry)
    }
    if (results.length > 0 && results.every((r) => r.code !== 'ok')) {
      log.warn?.(
        `[relay-gateway] WARN chain ${chainId}: no configured endpoint answered eth_chainId. ` +
          'Booting anyway — /status reports rpc:"down" for this chain until one recovers.'
      )
    }
  }

  for (const u of unreachable) {
    log.warn?.(`[relay-gateway] WARN chain ${u.chainId}: ${u.endpoint} could not be checked (${u.detail})`)
  }
  for (const m of mismatches) {
    log.error?.(`[relay-gateway] FATAL chain ${m.chainId}: ${m.endpoint} ${m.detail}`)
  }

  return { ok: mismatches.length === 0, mismatches, unreachable }
}
