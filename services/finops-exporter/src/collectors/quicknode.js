/**
 * QuickNode collector, and the flat-subscription modeller (spec 089, FR-005; research R1 + R3).
 *
 * ⚠ QUICKNODE REPORTS CREDITS, NOT DOLLARS. `GET /v0/usage/rpc` on the Admin API returns API-credit
 * consumption. Credits convert to dollars through plan-specific pricing, and on a Flat Rate RPS plan
 * spend is decoupled from usage entirely — the bill is the same whether we send one request or a
 * billion. So:
 *
 *   - credit usage is emitted as measured VENDOR USAGE (a fact);
 *   - the dollar figure is `basis="modelled"`, and which model applies depends on the plan:
 *       metered  → credits x FINOPS_QUICKNODE_USD_PER_MCREDIT
 *       flat RPS → FINOPS_QUICKNODE_PLAN_USD, with credits informational only.
 *
 * This collector also serves the sources that have no vendor API at all (Grafana Cloud), where the
 * declared subscription IS the whole model. FR-029: the FinOps system's own cost is catalogued,
 * because a system that hides what it costs is not credible about what anything else costs.
 */
import { read, notConfigured, unreadable } from '../reading.js'

export function createQuickNodeCollector({ config, fetchImpl = fetch, log = console.warn }) {
  /** @type {number|null} */
  let lastCredits = null

  async function readCredits() {
    const { apiKey, endpoint, prometheusUrl } = config.quicknode

    // Prefer the Prometheus exporter when the plan includes it (research R3): it is the vendor's own
    // metrics rather than our parse of a JSON shape they may change.
    if (prometheusUrl) {
      const res = await fetchImpl(prometheusUrl, { headers: apiKey ? { 'x-api-key': apiKey } : {} })
      if (!res.ok) throw new Error(`quicknode prometheus HTTP ${res.status}`)
      const text = await res.text()
      const m = /^quicknode_api_credits_used(?:\{[^}]*\})?\s+([0-9.eE+-]+)$/m.exec(text)
      if (!m) throw new Error('quicknode prometheus response had no credit metric')
      return Number(m[1])
    }

    if (!apiKey) return null

    const res = await fetchImpl(`${endpoint}/usage/rpc`, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`quicknode admin API HTTP ${res.status}`)

    const body = await res.json()
    // The Admin API's exact field naming is not pinned by public docs, so several plausible shapes
    // are accepted — and an UNRECOGNISED shape is an error, never a zero. A zero here would report
    // "no RPC usage" for an estate that is definitely making RPC calls.
    const credits =
      body?.data?.credits ?? body?.credits ?? body?.usage?.credits ?? body?.data?.apiCredits ?? body?.apiCredits
    if (typeof credits !== 'number' || !Number.isFinite(credits)) {
      throw new Error(`quicknode usage response had no recognisable credit field (keys: ${Object.keys(body ?? {}).join(',')})`)
    }
    return credits
  }

  async function collectQuickNode(source) {
    // Sources with no vendor API: the declared subscription is the entire model. An UNSET price is
    // `not-configured`, never 0 — see the note on `flatSubscriptions` in config/index.js.
    if (source.id in config.flatSubscriptions) {
      const flat = config.flatSubscriptions[source.id]
      if (flat == null) {
        return notConfigured(`no plan price declared for '${source.id}' — set its FINOPS_*_PLAN_USD (0 asserts a free tier)`)
      }
      return read(flat, 'USD', { labels: { basis: 'modelled' } })
    }

    const { planMonthlyUsd, usdPerMillionCredits } = config.quicknode

    let credits
    try {
      credits = await readCredits()
    } catch (err) {
      return unreadable(err?.message ?? err)
    }

    if (credits == null) return notConfigured('QUICKNODE_API_KEY (or QUICKNODE_PROMETHEUS_URL) is not set')
    lastCredits = credits

    // Metered plan: cost tracks usage.
    if (usdPerMillionCredits != null) {
      return read((credits / 1_000_000) * usdPerMillionCredits, 'USD', { labels: { basis: 'modelled' } })
    }
    // Flat Rate RPS: the subscription is the cost, and credits are informational.
    if (planMonthlyUsd != null) {
      return read(planMonthlyUsd, 'USD', { labels: { basis: 'modelled' } })
    }

    log('[finops] quicknode: credits read, but neither plan price nor credit rate is set — no cost modelled')
    return notConfigured('credits available; set FINOPS_QUICKNODE_PLAN_USD or FINOPS_QUICKNODE_USD_PER_MCREDIT to model a cost')
  }

  collectQuickNode._lastCredits = () => lastCredits

  return collectQuickNode
}

/** Emit measured credit consumption — the part of the QuickNode picture that is not a model. */
export function emitQuickNodeUsage(registry, collector, source) {
  const credits = collector._lastCredits?.()
  if (credits == null) return
  registry.emit(
    'vendor_usage',
    'gauge',
    'Raw vendor usage over the trailing window. Measured, unlike the modelled dollar figure beside it.',
    { source: source.id, metric: 'api_credits' },
    credits,
  )
}
