/**
 * Cloudflare collector (spec 089, FR-005; research R1 + R2).
 *
 * ⚠ CLOUDFLARE EXPOSES NO DOLLAR FIGURE. The GraphQL Analytics API returns requests, bytes, cached
 * bytes and threats. There is no public billing API for the plan. Anything this file reports in USD
 * is OUR ARITHMETIC over a plan price typed into config — which is why the cost it emits carries
 * `basis="modelled"` and why the usage it reports is emitted separately as a fact.
 *
 * Do not "improve" this by dropping the usage metrics and keeping only the dollar figure. The usage
 * is the part we actually measured.
 *
 * The token is a SCOPED API token with Zone → Analytics: Read. A Global API Key would also work and
 * is deliberately not used: it is account-wide and cannot be reduced to read-only on one zone
 * (FR-026).
 */
import { read, notConfigured, unreadable } from '../reading.js'

const QUERY = `
  query ZoneUsage($zoneTag: String!, $since: String!, $until: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(
          limit: 31
          filter: { date_geq: $since, date_leq: $until }
          orderBy: [date_DESC]
        ) {
          dimensions { date }
          sum { requests cachedRequests bytes cachedBytes threats }
        }
      }
    }
  }
`

const day = (offsetDays) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10)

export function createCloudflareCollector({ config, fetchImpl = fetch, log = console.warn }) {
  /** @type {{requests: number, bytes: number, cachedBytes: number, threats: number}|null} */
  let lastUsage = null

  async function collectCloudflare(source) {
    const { apiToken, zoneTag, endpoint, planMonthlyUsd } = config.cloudflare
    if (!apiToken || !zoneTag) {
      return notConfigured('CLOUDFLARE_ANALYTICS_TOKEN and CLOUDFLARE_ZONE_ID are required')
    }

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        // Bearer, not X-Auth-Key: the scoped-token auth scheme (research R2).
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: QUERY, variables: { zoneTag, since: day(30), until: day(0) } }),
    })

    if (!res.ok) return unreadable(`cloudflare graphql HTTP ${res.status}`)

    const body = await res.json()
    // GraphQL answers 200 with an `errors` array. Treating a 200 as success is how a permission
    // problem on the token becomes a silent zero.
    if (body.errors?.length) {
      return unreadable(`cloudflare graphql: ${body.errors.map((e) => e.message).join('; ')}`)
    }

    const groups = body?.data?.viewer?.zones?.[0]?.httpRequests1dGroups
    if (!Array.isArray(groups)) return unreadable('cloudflare graphql returned no zone data (is the token scoped to this zone?)')

    lastUsage = groups.reduce(
      (acc, g) => ({
        requests: acc.requests + (g.sum?.requests ?? 0),
        cachedRequests: acc.cachedRequests + (g.sum?.cachedRequests ?? 0),
        bytes: acc.bytes + (g.sum?.bytes ?? 0),
        cachedBytes: acc.cachedBytes + (g.sum?.cachedBytes ?? 0),
        threats: acc.threats + (g.sum?.threats ?? 0),
      }),
      { requests: 0, cachedRequests: 0, bytes: 0, cachedBytes: 0, threats: 0 },
    )

    // The usage read SUCCEEDED. Whether we can put a dollar figure on it is a separate question, and
    // conflating them would make an unpriced plan look like an API outage.
    if (planMonthlyUsd == null) {
      log('[finops] cloudflare: usage read, but FINOPS_CLOUDFLARE_PLAN_USD is unset — no cost modelled')
      return notConfigured('usage available; FINOPS_CLOUDFLARE_PLAN_USD is unset so no cost can be modelled')
    }

    return read(planMonthlyUsd, 'USD', { labels: { basis: 'modelled' } })
  }

  collectCloudflare._lastUsage = () => lastUsage

  return collectCloudflare
}

/** Emit the measured usage. A fact, even when the dollar figure beside it is a model. */
export function emitCloudflareUsage(registry, collector, source) {
  const usage = collector._lastUsage?.()
  if (!usage) return
  for (const [metric, value] of Object.entries(usage)) {
    registry.emit(
      'vendor_usage',
      'gauge',
      'Raw vendor usage over the trailing window. Measured, unlike the modelled dollar figure beside it.',
      { source: source.id, metric },
      value,
    )
  }
}
