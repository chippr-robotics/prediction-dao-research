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

  // Defaulted rather than assumed. `flatSubscriptions` is read on every render (the usage emitter
  // asks whether a source is a flat subscription before publishing credits against it), so an
  // absent key here is not a quiet mis-read — it throws inside /metrics and takes the whole scrape
  // down, blanking twenty-five healthy sources over one missing config branch.
  const flat = config.flatSubscriptions ?? {}

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

    /**
     * THE VENDOR ANSWERS ERRORS WITH HTTP 200 AND AN `error` FIELD, so `res.ok` above proves only
     * that the request arrived. Reported verbatim (through the Reading's redactor), because the
     * generic "no recognisable credit field" below is a true statement that sends the reader to
     * the wrong place: this estate spent weeks with the key wired and a message that read like a
     * parser bug when the vendor was plainly saying something specific about the account.
     */
    if (body?.error) {
      const detail = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
      throw new Error(`quicknode admin API returned an error: ${detail}`)
    }

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
    if (source.id in flat) {
      const declared = flat[source.id]
      if (declared == null) {
        return notConfigured(`no plan price declared for '${source.id}' — set its FINOPS_*_PLAN_USD (0 asserts a free tier)`)
      }
      return read(declared, 'USD', { labels: { basis: 'modelled' } })
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
  collectQuickNode._isFlatSubscription = (id) => id in flat

  return collectQuickNode
}

/**
 * Emit measured credit consumption — the part of the QuickNode picture that is not a model.
 *
 * ONLY FOR THE SOURCE THAT ACTUALLY READS CREDITS. Three catalogue entries share this collector —
 * `quicknode`, `grafana-cloud` and `alphaday-news-api` — because the other two reuse its flat-
 * subscription modeller, not because they have a usage API. The caller iterates every source with
 * `collector === 'quicknode'`, so without this guard QuickNode's credit count would be published
 * three times over, labelled `source="grafana-cloud"` and `source="alphaday-news-api"`: one
 * vendor's measured usage attributed to two others that publish no usage at all. Latent only
 * because credits have never read successfully on this estate — it would have become a fabricated
 * fact the day QuickNode started answering.
 */
export function emitQuickNodeUsage(registry, collector, source) {
  if (collector._isFlatSubscription?.(source.id)) return
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
