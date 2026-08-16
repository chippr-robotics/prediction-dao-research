/**
 * Grafana alert rules, generated from the catalogue (spec 090, FR-015…FR-018).
 *
 * The estate's existing alerting is entirely about liveness — uptime checks, VM CPU, VM disk. Not
 * one alert is about money. These are.
 *
 * THREE RULES SHAPE EVERY DEFINITION HERE:
 *
 *   1. RUNWAY, NOT BALANCE (FR-015). A balance floor is only correct at the burn rate it was chosen
 *      for; at 10x traffic a "safe" floor is minutes of warning. Alerting on projected runway keeps
 *      the threshold meaningful with nobody editing a number.
 *
 *   2. STALENESS IS ITS OWN ALERT AND NEVER RESOLVES A VALUE ALERT (FR-016). A balance that cannot
 *      be read is not a healthy balance. If a staleness alert could silence a runway alert, the
 *      worst case — we lost sight of the pool AND it is draining — would page nobody.
 *
 *   3. EVERY ALERT NAMES ITS RUNBOOK (FR-018). An alert that says what is wrong but not what to do
 *      gets acknowledged and forgotten.
 */

const DATASOURCE_UID = '${datasource}'
const RUNBOOK_BASE = 'https://github.com/chippr-robotics/prediction-dao-research/blob/main/docs/runbooks/finops-operations.md'

/** A Grafana unified-alerting query stage. */
function query(refId, expr) {
  return {
    refId,
    relativeTimeRange: { from: 600, to: 0 },
    datasourceUid: DATASOURCE_UID,
    model: { refId, expr, instant: true, datasource: { type: 'prometheus', uid: DATASOURCE_UID } },
  }
}

/** Reduce + threshold stages. Grafana needs both; the threshold is what actually fires. */
function threshold(refId, input, evaluator) {
  return {
    refId,
    datasourceUid: '__expr__',
    model: {
      refId,
      type: 'threshold',
      expression: input,
      conditions: [{ evaluator, operator: { type: 'and' }, reducer: { type: 'last' } }],
      datasource: { type: '__expr__', uid: '__expr__' },
    },
  }
}

function rule({ uid, title, expr, evaluator, forDuration, severity, summary, runbookAnchor, labels = {} }) {
  return {
    uid,
    title,
    condition: 'C',
    // NoData is ALERTING, not OK. A finance alert whose data disappeared is the case we most need to
    // hear about: "the series vanished" and "everything is fine" produce the same silence otherwise.
    noDataState: 'Alerting',
    execErrState: 'Alerting',
    for: forDuration,
    data: [query('A', expr), threshold('C', 'A', evaluator)],
    labels: { severity, team: 'finops', ...labels },
    annotations: {
      summary,
      runbook_url: `${RUNBOOK_BASE}#${runbookAnchor}`,
      // Grafana templates these at fire time, so the notification names the observed value rather
      // than making somebody open the dashboard to find out what tripped.
      description: `Observed: {{ $values.A }}. Rule: ${title}.`,
    },
  }
}

export function buildAlertRules(sources) {
  const rules = []

  // ── prepaid pools: runway (FR-015) ─────────────────────────────────────────────────────────
  //
  // Two tiers. Both read `pool_runway_seconds` directly — the exporter OMITS that series when runway
  // is unknowable, and NoData=Alerting is what turns that omission into a page instead of silence.
  rules.push(
    rule({
      uid: 'finops-pool-runway-critical',
      title: 'Prepaid pool runway under 24h',
      expr: 'min by (pool) (fairwins_finops_pool_runway_seconds)',
      evaluator: { type: 'lt', params: [86_400] },
      forDuration: '10m',
      severity: 'critical',
      summary:
        'A prepaid gas pool will be exhausted in under 24 hours at the current burn rate. When it empties, ' +
        'sponsorship or relaying STOPS and members see failures.',
      runbookAnchor: 'prepaid-pools',
    }),
    rule({
      uid: 'finops-pool-runway-warning',
      title: 'Prepaid pool runway under 72h',
      expr: 'min by (pool) (fairwins_finops_pool_runway_seconds)',
      evaluator: { type: 'lt', params: [72 * 3600] },
      forDuration: '30m',
      severity: 'warning',
      summary: 'A prepaid gas pool will be exhausted in under 72 hours at the current burn rate. Top it up.',
      runbookAnchor: 'prepaid-pools',
    }),
  )

  // ── staleness, one per live source (FR-016) ────────────────────────────────────────────────
  //
  // Deliberately separate from every value alert above and below. These fire IN ADDITION, never
  // INSTEAD.
  for (const source of sources.filter((s) => s.status === 'live')) {
    rules.push(
      rule({
        uid: `finops-stale-${source.id}`,
        title: `FinOps source stale: ${source.label}`,
        // Only alerts for sources that ARE configured. A not-configured source is an unwired
        // feature, and paging about it every interval forever is how an alert channel gets muted.
        expr:
          `(time() - fairwins_finops_source_last_success_timestamp_seconds{source="${source.id}"} > ${source.interval * 4}) ` +
          `and on(source) (fairwins_finops_source_configured{source="${source.id}"} == 1)`,
        evaluator: { type: 'gt', params: [0] },
        forDuration: '15m',
        severity: source.kind === 'cost' && source.collector === 'pools' ? 'critical' : 'warning',
        summary:
          `${source.label} has not been read successfully for more than ${source.interval * 4}s. ` +
          `Its panels show no data; any total including it is PARTIAL. An unread source is not a zero.`,
        runbookAnchor: source.docs.split('#')[1] ?? 'source-health',
        labels: { source: source.id },
      }),
    )
  }

  // ── revenue stall (User Story 5) ───────────────────────────────────────────────────────────
  //
  // A fee path that silently broke looks exactly like a quiet day. Only the history distinguishes
  // them, which is why this compares a 24h window against a 14d baseline rather than using a floor.
  rules.push(
    rule({
      uid: 'finops-revenue-stall',
      title: 'Revenue stalled on a source that normally earns',
      expr:
        'increase(fairwins_finops_revenue_total[24h]) == 0 ' +
        'and on(source) (increase(fairwins_finops_revenue_total[14d]) > 0)',
      evaluator: { type: 'gt', params: [0] },
      forDuration: '1h',
      severity: 'warning',
      summary:
        'A revenue source that earned over the last 14 days has earned nothing for 24 hours. This is what a ' +
        'silently broken fee path looks like — it is indistinguishable from a quiet day without the baseline.',
      runbookAnchor: 'revenue-stall',
    }),
  )

  // ── spend anomaly (User Story 5) ───────────────────────────────────────────────────────────
  rules.push(
    rule({
      uid: 'finops-cost-anomaly',
      title: 'Daily cost above 2x the trailing 7-day mean',
      expr:
        'sum by (source) (increase(fairwins_finops_cost_usd_total[24h])) ' +
        '> 2 * sum by (source) (increase(fairwins_finops_cost_usd_total[7d]) / 7)',
      evaluator: { type: 'gt', params: [0] },
      forDuration: '30m',
      severity: 'warning',
      summary: 'A cost source spent more than twice its trailing daily average in the last 24 hours.',
      runbookAnchor: 'cost-anomaly',
    }),
  )

  // ── fees waived (a misconfiguration that costs money silently) ─────────────────────────────
  rules.push(
    rule({
      uid: 'finops-fees-waived',
      title: 'Platform fees are being waived (no treasury configured)',
      expr: 'increase(fairwins_finops_revenue_waived_total[1h])',
      evaluator: { type: 'gt', params: [0] },
      forDuration: '15m',
      severity: 'critical',
      summary:
        'FeeRouter emitted FeeSkippedNoTreasury: fees are being charged at 0 because no treasury is set. ' +
        'This is live revenue being forgone for a configuration reason, and it is invisible in every other view.',
      runbookAnchor: 'fees-waived',
    }),
  )

  // ── FX staleness (FR-013) ──────────────────────────────────────────────────────────────────
  rules.push(
    rule({
      uid: 'finops-fx-stale',
      title: 'FX rate is stale — USD figures unavailable',
      expr: 'fairwins_finops_fx_age_seconds',
      evaluator: { type: 'gt', params: [6 * 3600] },
      forDuration: '30m',
      severity: 'warning',
      summary:
        'The price feed backing every USD conversion is stale. USD cost figures stop being produced rather than ' +
        'being converted at a rate we know is old; native-unit figures are unaffected.',
      runbookAnchor: 'fx-rate',
    }),
  )

  return {
    // Grafana provisioning envelope.
    apiVersion: 1,
    groups: [
      {
        name: 'fairwins-finops',
        folder: 'FinOps',
        interval: '1m',
        rules,
      },
    ],
  }
}
