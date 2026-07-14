/**
 * Relay-gateway configuration, loaded once at boot.
 *
 * Version-pinned target set (FR-025): the per-chain target contract addresses are read from
 * the repo's `deployments/*-chain<ID>-v2.json` files — the platform's source of truth for
 * on-chain addresses. Startup performs a consistency check: every enabled chain MUST have a
 * deployment record with `wagerRegistry`, `membershipManager`, and `sanctionsGuard` addresses,
 * or the process exits non-zero (fail loudly — never run against a stale/unknown target).
 *
 * Env:
 *   ENABLED_CHAIN_IDS          comma list (default "137,80002,63" — 61 has no deployment record yet;
 *                              enabling it without one fails the startup check by design)
 *   RPC_URLS_<chainId>         comma list, failover order (default: built-in public pair, FR-007)
 *   ORIGIN_AUTH_SECRET         origin-lock shared secret (X-Origin-Auth). Unset => lock DISABLED
 *                              (dev only; production must set it — research.md §4 / SC-016)
 *   WEBHOOK_SHARED_SECRET      engine webhook shared secret. Unset => webhook rejects everything (fail closed)
 *   ENGINE_URL                 OpenZeppelin Relayer base URL (default http://localhost:8080)
 *   ENGINE_API_KEY             optional bearer token for the engine API
 *   ENGINE_RELAYER_ID_<id>     engine relayer id per chain (default "<name>-<chainId>", e.g. polygon-137)
 *   KILL_SWITCH                'true' => boot with the kill switch active (FR-015)
 *   SIGNER_QUOTA_PER_MIN       per-signer intents/min (default 12)
 *   GLOBAL_QUOTA_PER_MIN       global intents/min (default 120)
 *   MAX_QUEUE_DEPTH            bounded in-flight queue (default 100) — back-pressure past this (FR-009)
 *   GAS_SPEND_CAP_WEI_<id>     per-chain per-window gas spend cap (default 0.5 native / hour, FR-014)
 *   SPEND_WINDOW_MS            spend-cap window (default 3600000)
 *   DEFAULT_GAS_LIMIT          fallback gas limit for estimates (default 300000)
 *   GAS_WALLET_<id>            hot gas wallet address (healthz runway only; the KEY lives in the engine)
 *   PEAK_BURN_WEI_PER_HR_<id>  runway divisor for healthz gasWalletRunwayHrs (default 0.05 native/hr)
 *   PORT                       HTTP port (default 8788)
 *   OPENSEA_API_KEY            OpenSea API v2 key for the read-only /v1/opensea/* proxy (spec 055).
 *                              Unset => those routes fail CLOSED with 503 collectibles_unconfigured
 *                              (the collectibles feature hides; nothing else is affected)
 *   OPENSEA_BASE_URL           OpenSea API base (default https://api.opensea.io)
 *   OPENSEA_TIMEOUT_MS         upstream request timeout (default 5000)
 *   OPENSEA_RETRIES            upstream retries on 5xx/transport (default 1)
 *   OPENSEA_CACHE_TTL_MS       list/detail response cache TTL (default 60000)
 *   OPENSEA_STATS_CACHE_TTL_MS collection-stats cache TTL (default 300000)
 *   OPENSEA_QUOTA_PER_ADDRESS  reads/min counted per requested address|contract|slug (default 60)
 *   OPENSEA_QUOTA_GLOBAL       reads/min across all callers (default 300)
 *   OPENSEA_QUOTA_WINDOW_MS    quota window (default 60000)
 *   OPENSEA_WRITE_QUOTA_PER_ADDRESS  sell-side writes/min per seller address (spec 056; default 20)
 *   OPENSEA_WRITE_QUOTA_GLOBAL       sell-side writes/min across all callers (default 100)
 *   OPENSEA_REFERRAL_ADDRESS   FairWins beneficiary of OpenSea's referral/affiliate reward (spec 056,
 *                              public address; unset => attribution off, a safe default). Never a surcharge.
 *   OPENSEA_REFERRAL_ADDRESS_<chainId>  per-network referral beneficiary override
 *
 * The gateway NEVER holds the gas key — that is the engine's (Secret-Manager-held) concern.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAIN_DEFS } from './chains.js'
import { actionsForContract } from '../intent/intentTypes.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DEPLOYMENTS_DIR = path.resolve(__dirname, '../../../../deployments')

function opt(env, name, fallback) {
  const v = env[name]
  return v == null || String(v).trim() === '' ? fallback : String(v).trim()
}

function int(env, name, fallback) {
  const v = opt(env, name, undefined)
  if (v == null) return fallback
  const n = Number.parseInt(v, 10)
  if (!Number.isInteger(n) || n < 0) throw new Error(`[relay-gateway] invalid integer env ${name}=${v}`)
  return n
}

function bigInt(env, name, fallback) {
  const v = opt(env, name, undefined)
  if (v == null) return fallback
  try {
    return BigInt(v)
  } catch {
    throw new Error(`[relay-gateway] invalid bigint env ${name}=${v}`)
  }
}

/** Locate + parse the deployment record for a chain (source of truth for addresses). */
function loadDeployment(deploymentsDir, chainId) {
  let entries
  try {
    entries = fs.readdirSync(deploymentsDir)
  } catch (e) {
    throw new Error(`[relay-gateway] cannot read deployments dir ${deploymentsDir}: ${e.message}`)
  }
  const file = entries.find((f) => f.endsWith(`-chain${chainId}-v2.json`))
  if (!file) return null
  const parsed = JSON.parse(fs.readFileSync(path.join(deploymentsDir, file), 'utf8'))
  return { file: path.join(deploymentsDir, file), ...parsed }
}

/**
 * Build the validated config. Throws (=> non-zero exit at boot) on any inconsistency between
 * the enabled chains and the deployments records — FR-025's startup consistency check.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{deploymentsDir?: string}} [opts]
 */
export function loadConfig(env = process.env, opts = {}) {
  const deploymentsDir = opts.deploymentsDir || opt(env, 'DEPLOYMENTS_DIR', DEFAULT_DEPLOYMENTS_DIR)

  const enabledChainIds = opt(env, 'ENABLED_CHAIN_IDS', '137,80002,63')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number.parseInt(s, 10)
      if (!Number.isInteger(n) || n <= 0) throw new Error(`[relay-gateway] invalid chainId in ENABLED_CHAIN_IDS: ${s}`)
      return n
    })
  if (enabledChainIds.length === 0) throw new Error('[relay-gateway] ENABLED_CHAIN_IDS must list at least one chainId')

  const chains = {}
  for (const chainId of enabledChainIds) {
    const def = CHAIN_DEFS[chainId]
    if (!def) {
      throw new Error(
        `[relay-gateway] chainId ${chainId} is not a supported network (supported: ${Object.keys(CHAIN_DEFS).join(', ')})`
      )
    }

    // --- FR-025 startup consistency check: pin targets to the recorded deployment ---
    const deployment = loadDeployment(deploymentsDir, chainId)
    if (!deployment) {
      throw new Error(
        `[relay-gateway] no deployment record (*-chain${chainId}-v2.json) in ${deploymentsDir} for enabled chain ${chainId}. ` +
          'Refusing to start: target addresses must be version-pinned to deployments/ (FR-025).'
      )
    }
    if (Number(deployment.chainId) !== chainId) {
      throw new Error(`[relay-gateway] ${deployment.file} declares chainId ${deployment.chainId}, expected ${chainId}`)
    }
    const c = deployment.contracts || {}
    for (const key of ['wagerRegistry', 'membershipManager', 'sanctionsGuard']) {
      if (!ADDRESS_RE.test(c[key] || '')) {
        throw new Error(
          `[relay-gateway] deployment record for chain ${chainId} (${deployment.file}) is missing a valid "${key}" address — ` +
            'cannot pin the target set (FR-025).'
        )
      }
    }
    if (def.paymentSupported && !ADDRESS_RE.test(deployment.paymentToken || '')) {
      throw new Error(
        `[relay-gateway] chain ${chainId} is payment-enabled but the deployment record has no paymentToken address`
      )
    }

    // Version-pinned target map: address (lowercase) -> { key, allowedActions }
    const targets = {
      [c.wagerRegistry.toLowerCase()]: { key: 'wagerRegistry', address: c.wagerRegistry, allowedActions: actionsForContract('wagerRegistry') },
      [c.membershipManager.toLowerCase()]: { key: 'membershipManager', address: c.membershipManager, allowedActions: actionsForContract('membershipManager') },
    }
    const targetsByKey = { wagerRegistry: c.wagerRegistry, membershipManager: c.membershipManager }

    // Tier-2 group pools (spec 035/036) are OPTIONAL per chain: only pin the WagerPoolFactory where the
    // deployment record has one (Mordor/Polygon), so chains without pools still boot (pool actions there
    // just self-submit). The factory is the only pool target the engine whitelists — clones are reached
    // via its forwarders and proven on-chain (poolAddressToId), so no clone address is ever pinned.
    if (ADDRESS_RE.test(c.wagerPoolFactory || '')) {
      targets[c.wagerPoolFactory.toLowerCase()] = {
        key: 'wagerPoolFactory',
        address: c.wagerPoolFactory,
        allowedActions: actionsForContract('wagerPoolFactory'),
      }
      targetsByKey.wagerPoolFactory = c.wagerPoolFactory
    }

    const rpcUrls = opt(env, `RPC_URLS_${chainId}`, def.defaultRpcUrls.join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (rpcUrls.length === 0) throw new Error(`[relay-gateway] RPC_URLS_${chainId} must list at least one endpoint`)
    if (rpcUrls.length < 2) {
      // FR-007 wants >=2 independent endpoints; tolerate 1 for local dev but say so loudly.
      console.warn(`[relay-gateway] WARN chain ${chainId}: only 1 RPC endpoint configured; FR-007 expects >=2 for failover`)
    }

    const gasWallet = opt(env, `GAS_WALLET_${chainId}`, null)
    if (gasWallet && !ADDRESS_RE.test(gasWallet)) throw new Error(`[relay-gateway] GAS_WALLET_${chainId} is not an address`)

    chains[chainId] = {
      chainId,
      name: def.name,
      gasType: def.gasType,
      noBatch: def.noBatch,
      paymentSupported: def.paymentSupported,
      tokenDomain: def.paymentSupported
        ? {
            name: opt(env, `TOKEN_DOMAIN_NAME_${chainId}`, def.tokenDomain.name),
            version: opt(env, `TOKEN_DOMAIN_VERSION_${chainId}`, def.tokenDomain.version),
          }
        : null,
      paymentToken: deployment.paymentToken || null,
      sanctionsGuard: c.sanctionsGuard,
      targets,
      targetsByKey,
      rpcUrls,
      fundingMode: opt(env, `FUNDING_MODE_${chainId}`, 'sponsored'), // 'sponsored' | 'fee-netted'
      gasSpendCapWei: bigInt(env, `GAS_SPEND_CAP_WEI_${chainId}`, 500_000_000_000_000_000n), // 0.5 native / window
      gasPriceFallbackWei: def.gasPriceFallbackWei,
      gasWallet,
      peakBurnWeiPerHour: bigInt(env, `PEAK_BURN_WEI_PER_HR_${chainId}`, 50_000_000_000_000_000n), // 0.05 native/hr
      engineRelayerId: opt(env, `ENGINE_RELAYER_ID_${chainId}`, `${def.name}-${chainId}`),
      deploymentFile: deployment.file,
      // Sponsored-paymaster (spec 050): set PER CHAIN, so sponsorship is enabled ONLY where a
      // paymaster is deployed (e.g. Polygon-only = set PAYMASTER_ADDRESS_137 alone). null => the
      // /v1/paymaster endpoint refuses this chain and the SPA self-funds (never-stranded).
      paymaster: (() => {
        const addr = opt(env, `PAYMASTER_ADDRESS_${chainId}`, null)
        if (!addr) return null
        if (!ADDRESS_RE.test(addr)) throw new Error(`[relay-gateway] PAYMASTER_ADDRESS_${chainId} is not an address`)
        return {
          address: addr,
          entryPoint: opt(env, `ENTRYPOINT_V06_${chainId}`, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
        }
      })(),
    }
  }

  return {
    enabledChainIds,
    chains,
    port: int(env, 'PORT', 8788),
    originAuthSecret: opt(env, 'ORIGIN_AUTH_SECRET', null),
    webhookSecret: opt(env, 'WEBHOOK_SHARED_SECRET', null),
    // Browser origins allowed to call the gateway cross-origin (CORS). The SPA lives on a different
    // host than the relay subdomain (fairwins.app -> relay.fairwins.app), so it needs an explicit
    // allow-list. Comma-separated; unset => no CORS headers (same-origin / server-to-server only).
    allowedOrigins: opt(env, 'ALLOWED_ORIGINS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    engine: {
      url: opt(env, 'ENGINE_URL', 'http://localhost:8080'),
      apiKey: opt(env, 'ENGINE_API_KEY', null),
      timeoutMs: int(env, 'ENGINE_TIMEOUT_MS', 5000),
      retries: int(env, 'ENGINE_RETRIES', 2),
    },
    killSwitch: opt(env, 'KILL_SWITCH', 'false').toLowerCase() === 'true',
    quotas: {
      signerPerWindow: int(env, 'SIGNER_QUOTA_PER_MIN', 12),
      globalPerWindow: int(env, 'GLOBAL_QUOTA_PER_MIN', 120),
      windowMs: int(env, 'QUOTA_WINDOW_MS', 60_000),
    },
    // Sponsored-paymaster (spec 050): sponsorship signer + per-op ceilings + burst quotas. The
    // killswitch and sanctions screen are shared with the intent path; these are the paymaster-only
    // knobs. Signer: dev/CI uses PM_SIGNER_PRIVATE_KEY (never a prod secret); prod uses the KMS key.
    paymaster: {
      signerPrivateKey: opt(env, 'PM_SIGNER_PRIVATE_KEY', null),
      kmsKeyName: opt(env, 'PM_SIGNER_KMS_KEY', null),
      maxCostWei: bigInt(env, 'PM_MAX_COST_WEI', 2_000_000_000_000_000_000n), // 2 native / op ceiling
      maxGas: BigInt(int(env, 'PM_MAX_GAS', 3_000_000)),
      approvalTtlSec: int(env, 'PM_APPROVAL_TTL_SEC', 180),
      accountPerWindow: int(env, 'PM_ACCOUNT_QUOTA_PER_MIN', 6),
      globalPerWindow: int(env, 'PM_GLOBAL_QUOTA_PER_MIN', 60),
      windowMs: int(env, 'PM_QUOTA_WINDOW_MS', 60_000),
      runwayWarnHrs: int(env, 'PM_RUNWAY_WARN_HRS', 48),
    },
    // OpenSea proxy (spec 055 read-only + spec 056 sell-side): optional like the paymaster — no key
    // means the /v1/opensea/* routes 503 fail-closed and the SPA hides the feature; boot is unaffected
    // (the collectibles surface must never couple to the value paths).
    opensea: {
      apiKey: opt(env, 'OPENSEA_API_KEY', null),
      baseUrl: opt(env, 'OPENSEA_BASE_URL', 'https://api.opensea.io'),
      timeoutMs: int(env, 'OPENSEA_TIMEOUT_MS', 5000),
      retries: int(env, 'OPENSEA_RETRIES', 1),
      cacheTtlMs: int(env, 'OPENSEA_CACHE_TTL_MS', 60_000),
      statsCacheTtlMs: int(env, 'OPENSEA_STATS_CACHE_TTL_MS', 300_000),
      quotaPerAddress: int(env, 'OPENSEA_QUOTA_PER_ADDRESS', 60),
      quotaGlobal: int(env, 'OPENSEA_QUOTA_GLOBAL', 300),
      quotaWindowMs: int(env, 'OPENSEA_QUOTA_WINDOW_MS', 60_000),
      // Sell-side writes (spec 056): tighter, separate quota so publishing a listing can't drain the
      // shared key's read budget; keyed by the seller's account address.
      writeQuotaPerAddress: int(env, 'OPENSEA_WRITE_QUOTA_PER_ADDRESS', 20),
      writeQuotaGlobal: int(env, 'OPENSEA_WRITE_QUOTA_GLOBAL', 100),
      // FairWins referral/affiliate beneficiary (spec 056). Public address (validated if set); a
      // per-chain override wins over the global. Unset => attribution disabled (safe default). This is
      // OpenSea's own reward, never a FairWins surcharge (FR-013/FR-015).
      referralAddress: (() => {
        const a = opt(env, 'OPENSEA_REFERRAL_ADDRESS', null)
        if (a && !ADDRESS_RE.test(a)) throw new Error(`[relay-gateway] OPENSEA_REFERRAL_ADDRESS is not an address`)
        return a
      })(),
      referralAddressByChain: (() => {
        const map = {}
        for (const chainId of [1, 137]) {
          const a = opt(env, `OPENSEA_REFERRAL_ADDRESS_${chainId}`, null)
          if (a && !ADDRESS_RE.test(a)) throw new Error(`[relay-gateway] OPENSEA_REFERRAL_ADDRESS_${chainId} is not an address`)
          if (a) map[chainId] = a
        }
        return map
      })(),
    },
    maxQueueDepth: int(env, 'MAX_QUEUE_DEPTH', 100),
    spendWindowMs: int(env, 'SPEND_WINDOW_MS', 3_600_000),
    defaultGasLimit: bigInt(env, 'DEFAULT_GAS_LIMIT', 300_000n),
    rpcTimeoutMs: int(env, 'RPC_TIMEOUT_MS', 4000),
    // /healthz + /status cache window: caps upstream RPC fan-out from the origin-lock-exempt health
    // route so it can't be looped to amplify load onto the operator's public RPCs.
    healthCacheMs: int(env, 'HEALTH_CACHE_MS', 5000),
  }
}
