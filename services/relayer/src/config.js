/**
 * Relayer configuration, loaded once from the environment.
 *
 * GAS INFRASTRUCTURE ONLY. This service holds a gas-only signer (see SECURITY in README): it can pay
 * gas to submit a member's pre-signed EIP-3009 join, but the authorization binds amount + recipient and
 * is replay-protected by the token, so the relayer can censor, never steal. No user/business data is
 * stored — the service is stateless.
 *
 * Per-chain config is namespaced by chainId:
 *   RPC_URL_<chainId>            — JSON-RPC endpoint for that chain (REQUIRED per enabled chain)
 *   POOL_FACTORY_<chainId>       — ZKWagerPoolFactory address (REQUIRED; the relayer only submits to
 *                                  pools registered by this factory)
 *   SANCTIONS_GUARD_<chainId>    — SanctionsGuard address (REQUIRED on value-bearing chains; the relayer
 *                                  re-screens `from` before submitting — FR-021d)
 *
 * Global:
 *   RELAYER_PRIVATE_KEY          — gas-only signer key (REQUIRED; keep out of committed files)
 *   ENABLED_CHAIN_IDS            — comma-separated allow-list of chainIds the relayer serves
 *   PORT                         — HTTP port (default 8787)
 *   RATE_LIMIT_WINDOW_MS         — rate-limit window (default 60000)
 *   RATE_LIMIT_MAX               — max relay requests per window per IP (default 20)
 *   REQUIRE_SANCTIONS_SCREEN     — when 'true' (default), refuse to relay if screening cannot be
 *                                  performed (no guard configured / guard call fails). FR-021d.
 *   TX_CONFIRMATIONS             — confirmations to await before returning (default 0: return on send)
 */

function req(name) {
  const v = process.env[name]
  if (v == null || String(v).trim() === '') {
    throw new Error(`[relayer] missing required env: ${name}`)
  }
  return String(v).trim()
}

function opt(name, fallback) {
  const v = process.env[name]
  return v == null || String(v).trim() === '' ? fallback : String(v).trim()
}

function bool(name, fallback) {
  const v = opt(name, undefined)
  if (v == null) return fallback
  return v.toLowerCase() === 'true' || v === '1'
}

function int(name, fallback) {
  const v = opt(name, undefined)
  if (v == null) return fallback
  const n = Number.parseInt(v, 10)
  if (!Number.isInteger(n) || n < 0) throw new Error(`[relayer] invalid integer env ${name}=${v}`)
  return n
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/**
 * Build the validated config. Throws on any missing/invalid required value so the process fails fast
 * at boot rather than mid-request.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  const prev = process.env
  process.env = env
  try {
    const privateKey = req('RELAYER_PRIVATE_KEY')

    const enabledChainIds = req('ENABLED_CHAIN_IDS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = Number.parseInt(s, 10)
        if (!Number.isInteger(n) || n <= 0) throw new Error(`[relayer] invalid chainId in ENABLED_CHAIN_IDS: ${s}`)
        return n
      })
    if (enabledChainIds.length === 0) throw new Error('[relayer] ENABLED_CHAIN_IDS must list at least one chainId')

    const requireSanctionsScreen = bool('REQUIRE_SANCTIONS_SCREEN', true)

    const chains = {}
    for (const chainId of enabledChainIds) {
      const rpcUrl = req(`RPC_URL_${chainId}`)
      const poolFactory = req(`POOL_FACTORY_${chainId}`)
      if (!ADDRESS_RE.test(poolFactory)) throw new Error(`[relayer] POOL_FACTORY_${chainId} is not an address: ${poolFactory}`)

      // Sanctions guard: required when screening is enforced (FR-021d). When screening is disabled
      // (dev/test only), the guard may be absent and the relayer skips the re-screen.
      let sanctionsGuard = opt(`SANCTIONS_GUARD_${chainId}`, undefined)
      if (requireSanctionsScreen) {
        if (!sanctionsGuard) {
          throw new Error(
            `[relayer] SANCTIONS_GUARD_${chainId} required when REQUIRE_SANCTIONS_SCREEN=true (FR-021d). ` +
              'Set the guard address, or explicitly disable screening for non-value-bearing chains.'
          )
        }
        if (!ADDRESS_RE.test(sanctionsGuard)) {
          throw new Error(`[relayer] SANCTIONS_GUARD_${chainId} is not an address: ${sanctionsGuard}`)
        }
      }
      chains[chainId] = { chainId, rpcUrl, poolFactory, sanctionsGuard: sanctionsGuard || null }
    }

    return {
      privateKey,
      enabledChainIds,
      chains,
      requireSanctionsScreen,
      port: int('PORT', 8787),
      rateLimit: {
        windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
        max: int('RATE_LIMIT_MAX', 20),
      },
      txConfirmations: int('TX_CONFIRMATIONS', 0),
    }
  } finally {
    process.env = prev
  }
}
