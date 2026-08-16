/**
 * Exporter configuration (spec 089).
 *
 * Every credential arrives as an environment variable delivered from GCP Secret Manager into a
 * per-container tmpfs env file by `infra/vm/common/fetch-secrets.sh` (FR-024). Nothing here reads a
 * file, and nothing here has a committed default that is a secret.
 *
 * ABSENT CONFIG IS NOT AN ERROR. A missing vendor credential makes that source `not-configured`,
 * which is a first-class state that does not alert and does not count as an outage (FR-006). The
 * exporter boots and reports honestly on whatever it can reach; it does not refuse to start because
 * one of four vendors has not been wired up yet.
 */

const num = (v, dflt) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/**
 * Chainlink POL/USD on Polygon. A PUBLIC on-chain price feed, chosen over a price API on purpose:
 * it needs no credential, it is already reachable over the RPC we have, and `latestRoundData`
 * carries `updatedAt` — so the rate's AGE is a fact we can publish rather than a thing we assume
 * (FR-013). An unset feed means no USD conversion at all, never a guessed rate.
 */
const DEFAULT_POL_USD_FEED = '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'

export function loadConfig(env = process.env) {
  const cohort = list(env.FINOPS_COHORT_CHAIN_IDS).map(Number).filter(Number.isFinite)

  const rpcUrls = {}
  for (const key of Object.keys(env)) {
    const m = /^RPC_URLS_(\d+)$/.exec(key)
    if (m) rpcUrls[Number(m[1])] = list(env[key])
  }

  return {
    port: num(env.PORT, 9464),
    // Loopback only. The exporter has no member-facing surface and must not be publicly reachable
    // (FR-027); Alloy scrapes it from inside the same network namespace.
    host: env.FINOPS_BIND_HOST ?? '127.0.0.1',

    // The build's cohort. Reads never cross the testnet/mainnet boundary (FR-008, constitution III).
    cohortChainIds: cohort.length ? cohort : [137],

    rpcUrls,
    confirmations: {
      1: num(env.FINOPS_CONFIRMATIONS_1, 12),
      10: num(env.FINOPS_CONFIRMATIONS_10, 20),
      61: num(env.FINOPS_CONFIRMATIONS_61, 30),
      63: num(env.FINOPS_CONFIRMATIONS_63, 30),
      137: num(env.FINOPS_CONFIRMATIONS_137, 128), // Polygon reorgs deeper than most; R5.
      8453: num(env.FINOPS_CONFIRMATIONS_8453, 20),
      42161: num(env.FINOPS_CONFIRMATIONS_42161, 20),
    },

    // How far back a cold start scans for revenue events. Bounded so a boot cannot walk the chain
    // from genesis; the counter is cumulative-since-start, which the dashboard states.
    lookbackBlocks: num(env.FINOPS_LOOKBACK_BLOCKS, 50_000),

    contracts: {
      feeRouter: env.FEE_ROUTER_ADDRESS || null,
      membershipManager: env.MEMBERSHIP_MANAGER_ADDRESS || null,
      paymaster: env.PAYMASTER_ADDRESS_137 || null,
      entryPoint: env.ENTRYPOINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },

    /** Prepaid pool owners. Balances only — the exporter never holds a key (FR-026). */
    pools: {
      'paymaster-137': { kind: 'paymaster', chain: 137, unit: 'POL' },
      'relayer-137': { kind: 'eoa', chain: 137, unit: 'POL', address: env.GAS_WALLET_137 || null },
      'relayer-63': { kind: 'eoa', chain: 63, unit: 'ETC', address: env.GAS_WALLET_63 || null },
      'bundler-137': { kind: 'eoa', chain: 137, unit: 'POL', address: env.BUNDLER_EXECUTOR_137 || null },
    },

    fx: {
      polUsdFeed: env.FINOPS_POL_USD_FEED ?? DEFAULT_POL_USD_FEED,
      feedChain: num(env.FINOPS_FX_FEED_CHAIN, 137),
      // Beyond this the rate is published but flagged stale; a stale rate is visible, never silently applied.
      maxAgeSec: num(env.FINOPS_FX_MAX_AGE_SEC, 6 * 3600),
    },

    gcp: {
      projectId: env.GCP_PROJECT_ID || null,
      // The billing export dataset referenced by docs/runbooks/vm-migration.md.
      billingDataset: env.FINOPS_BILLING_DATASET || 'billing_export',
      billingTablePrefix: env.FINOPS_BILLING_TABLE_PREFIX || 'gcp_billing_export_v1_',
      // Querying is billable; this bounds a single query's scan (FR-029).
      maxBytesBilled: num(env.FINOPS_BQ_MAX_BYTES_BILLED, 2 * 1024 ** 3),
      lookbackDays: num(env.FINOPS_BILLING_LOOKBACK_DAYS, 30),
    },

    cloudflare: {
      apiToken: env.CLOUDFLARE_ANALYTICS_TOKEN || null,
      zoneTag: env.CLOUDFLARE_ZONE_ID || null,
      endpoint: env.CLOUDFLARE_GRAPHQL_URL || 'https://api.cloudflare.com/client/v4/graphql',
      // Research R1: Cloudflare exposes NO dollar figure. This is the declared plan price, and the
      // cost it produces is labelled basis="modelled" so it is never mistaken for an invoice.
      planMonthlyUsd: num(env.FINOPS_CLOUDFLARE_PLAN_USD, null),
    },

    quicknode: {
      apiKey: env.QUICKNODE_API_KEY || null,
      endpoint: env.QUICKNODE_API_URL || 'https://api.quicknode.com/v0',
      // Preferred when the plan includes it (research R3) — real metrics beat parsing usage JSON.
      prometheusUrl: env.QUICKNODE_PROMETHEUS_URL || null,
      planMonthlyUsd: num(env.FINOPS_QUICKNODE_PLAN_USD, null),
      // Only meaningful on a credit-metered plan. On Flat Rate RPS the subscription IS the cost and
      // credit usage is informational, which is why both numbers exist independently.
      usdPerMillionCredits: num(env.FINOPS_QUICKNODE_USD_PER_MCREDIT, null),
    },

    /** Flat, declared subscriptions with no vendor API at all. */
    flatSubscriptions: {
      'grafana-cloud': num(env.FINOPS_GRAFANA_PLAN_USD, 0),
    },

    referral: {
      openSeaAddress: env.OPENSEA_REFERRAL_ADDRESS || null,
      gainsReferrer: env.PERPS_GAINS_REFERRER || null,
      gmxRefCode: env.PERPS_GMX_REF_CODE || null,
      polymarketApiKey: env.POLYMARKET_API_KEY || null,
      polymarketBuilderCode: env.POLYMARKET_BUILDER_CODE || null,
      polymarketApiUrl: env.POLYMARKET_API_URL || 'https://clob.polymarket.com',
    },

    build: {
      version: env.FINOPS_VERSION || 'dev',
      commit: env.FINOPS_COMMIT || 'unknown',
      cohort: cohort.includes(137) || cohort.includes(1) ? 'mainnet' : 'testnet',
    },
  }
}

/**
 * A boot summary safe to log and to serve from /status.
 *
 * Reports whether each credential is PRESENT, never any part of its value (FR-025). Operators need
 * to know which sources are wired, and that question is answerable without printing anything secret.
 */
export function describeConfig(config) {
  return {
    cohort: config.build.cohort,
    chains: config.cohortChainIds,
    rpcConfigured: Object.keys(config.rpcUrls).map(Number),
    contracts: Object.fromEntries(Object.entries(config.contracts).map(([k, v]) => [k, Boolean(v)])),
    pools: Object.fromEntries(
      Object.entries(config.pools).map(([k, v]) => [k, v.kind === 'paymaster' ? Boolean(config.contracts.paymaster) : Boolean(v.address)]),
    ),
    credentials: {
      cloudflare: Boolean(config.cloudflare.apiToken && config.cloudflare.zoneTag),
      quicknode: Boolean(config.quicknode.apiKey || config.quicknode.prometheusUrl),
      gcpBilling: Boolean(config.gcp.projectId),
      polymarket: Boolean(config.referral.polymarketApiKey),
    },
    attribution: {
      opensea: Boolean(config.referral.openSeaAddress),
      gains: Boolean(config.referral.gainsReferrer),
      gmx: Boolean(config.referral.gmxRefCode),
      polymarketBuilderCode: Boolean(config.referral.polymarketBuilderCode),
    },
  }
}
