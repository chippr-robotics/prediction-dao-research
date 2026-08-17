/**
 * GCP cost collector — the BigQuery billing export (spec 089, FR-005; research R4).
 *
 * THE ONLY BILLED COST SOURCE WE HAVE. Every other vendor figure on this dashboard is `modelled`
 * (research R1); this one comes from a record of what Google actually charged, which is why it is
 * the only source allowed to carry `basis="billed"`.
 *
 * Two properties must reach the dashboard rather than being smoothed over:
 *   - IT LAGS. Rows land hours after the spend. A panel showing it beside a 60-second-old chain read
 *     must say so, or the two look equally fresh. The lag is exported as its own metric.
 *   - IT IS NOT RETROACTIVE. It holds nothing from before the export was enabled. There is no
 *     backfill to write and none is faked.
 *
 * Querying it is itself billable, which is why the interval is hours and why `maximumBytesBilled` is
 * set: an unbounded scan over a wildcard table is how a cost dashboard becomes a cost centre (FR-029).
 */
import { read, notConfigured, unreadable } from '../reading.js'

/**
 * @param {object} deps
 * @param {() => Promise<{query: Function}>} deps.bigQuery lazily-constructed client (test seam)
 */
export function createGcpBillingCollector({ config, bigQuery, log = console.warn }) {
  let client = null
  /** @type {{rows: Array<{service: string, cost: number}>, lagSeconds: number|null}|null} */
  let lastGood = null

  async function collectGcpBilling(source) {
    const { projectId, billingDataset, billingTablePrefix, maxBytesBilled, lookbackDays } = config.gcp
    if (!projectId) return notConfigured('GCP_PROJECT_ID is not set')

    client ??= await bigQuery()
    if (!client) return notConfigured('BigQuery client unavailable')

    // Wildcard over the export's dated tables. `_PARTITIONTIME`-style pruning is not available on
    // the export schema, so the usage_start_time predicate is what bounds the scan.
    const sql = `
      SELECT
        service.description AS service,
        SUM(cost) AS cost,
        MAX(export_time) AS latest_export
      FROM \`${projectId}.${billingDataset}.${billingTablePrefix}*\`
      WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
      GROUP BY service
      ORDER BY cost DESC
    `

    let rows
    try {
      ;[rows] = await client.query({
        query: sql,
        params: { days: lookbackDays },
        maximumBytesBilled: String(maxBytesBilled),
      })
    } catch (err) {
      const message = String(err?.message ?? err)
      // A missing dataset is a CONFIGURATION fact, not an outage: the export has not been enabled.
      // Reporting it as unreadable would page somebody about a thing that has never existed.
      //
      // `does not match any table` is the SAME fact wearing different words, and it is the one a
      // freshly-enabled export actually returns: the dataset exists, the wildcard resolves to
      // nothing, and it stays that way for HOURS because Google populates the first table on its own
      // schedule and never backfills. Measured 2026-08-16, minutes after enabling the export:
      //
      //   chippr-bots-site-wp:billing_export.gcp_billing_export_v1_* does not match any table.
      //
      // That message matches none of the patterns above, so it fell through to `unreadable` — which
      // is `configured=1, up=0`, which fires the staleness alert 15 minutes later. Paging an
      // operator overnight because Google has not written the first row yet is exactly the
      // false-alarm class that gets an alert channel muted.
      if (/not found|does not exist|Not found: Dataset|Not found: Table|does not match any table/i.test(message)) {
        return notConfigured(
          `billing export ${billingDataset} has no tables yet — a newly enabled export takes hours to appear, and is never backfilled`,
        )
      }
      /**
       * Serving a stale-but-real total beats reporting nothing during a transient BigQuery failure —
       * but ONLY while the staleness stays visible.
       *
       * The `at` carried here is the timestamp of the read that actually SUCCEEDED, not now. An
       * earlier version stamped it `Date.now() - 1`, which made `source_last_success_timestamp`
       * advance on every failed poll: during a sustained outage the source would have looked
       * perpetually fresh and the staleness alert would never have fired. Serving old data is
       * acceptable; lying about its age is not.
       */
      if (lastGood) {
        log(`[finops] gcp: query failed, serving last good from ${new Date(lastGood.at).toISOString()} — ${message}`)
        return read(lastGood.rows.reduce((a, r) => a + r.cost, 0), 'USD', {
          labels: { basis: 'billed' },
          at: lastGood.at,
        })
      }
      return unreadable(message)
    }

    if (!rows?.length) {
      // An empty result over a 30-day window means the export exists but holds nothing yet. That is
      // genuinely "no data", not "$0 spent" — and a project with running VMs never spends $0.
      return unreadable(`billing export returned no rows for the last ${lookbackDays} days`)
    }

    const latest = rows.reduce((max, r) => {
      const t = r.latest_export?.value ? Date.parse(r.latest_export.value) : Number(r.latest_export)
      return Number.isFinite(t) && t > max ? t : max
    }, 0)

    lastGood = {
      rows: rows.map((r) => ({ service: r.service ?? 'unknown', cost: Number(r.cost) || 0 })),
      lagSeconds: latest ? Math.max(0, (Date.now() - latest) / 1000) : null,
      // When this data was actually obtained. Replayed verbatim on the fallback path above so a
      // served-stale value never claims to be fresh.
      at: Date.now(),
    }

    const total = lastGood.rows.reduce((a, r) => a + r.cost, 0)
    // Same clock read as the cache: `read()` would otherwise stamp its own Date.now(), and a
    // millisecond tick between the two makes the served-stale `at` disagree with what the live
    // reading reported for the SAME data.
    return read(total, 'USD', { labels: { basis: 'billed' }, at: lastGood.at })
  }

  // The per-service breakdown and the export lag ride alongside the aggregate Reading rather than
  // inside it: a Reading carries one value by design, and widening it to carry a table would give
  // every other collector a field it has no use for.
  collectGcpBilling._lastGood = () => lastGood

  return collectGcpBilling
}

/**
 * Per-service breakdown and the export's lag, emitted after the aggregate read.
 *
 * The lag is a first-class metric because a dashboard that shows a 6-hour-old billing figure next to
 * a 60-second-old balance, with no visual difference, is implying a freshness it does not have.
 */
export function emitGcpDetail(registry, collector, source) {
  const detail = collector._lastGood?.()
  if (!detail) return
  for (const row of detail.rows) {
    registry.emit(
      'cost_usd_total',
      'counter',
      'Actual charged GCP cost per service, from the BigQuery billing export.',
      { source: source.id, basis: 'billed', unit: 'USD', gcp_service: row.service },
      row.cost,
    )
  }
  if (detail.lagSeconds != null) {
    registry.emit(
      'source_lag_seconds',
      'gauge',
      'How far behind real time a source inherently is. The billing export lags hours; chain reads do not.',
      { source: source.id },
      detail.lagSeconds,
    )
  }
}
