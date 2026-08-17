/**
 * Alert-rule shape (spec 089, FR-016 / FR-006).
 *
 * These assert PROPERTIES OF THE GENERATED PROMQL rather than running Prometheus. That is a real
 * limitation — they cannot prove the queries return what we think. What they CAN do is pin the two
 * decisions that were wrong once and would be silently wrong again, because both look fine in review
 * and only misbehave against live data.
 */
import { describe, it, expect } from 'vitest'
import { SOURCES } from '@fairwins/finops-catalogue'
import { buildAlertRules } from '../../../scripts/finops/lib/alerts.js'

const { groups } = buildAlertRules(SOURCES)
const rules = groups[0].rules
const staleness = rules.filter((r) => r.uid.startsWith('finops-stale-'))

describe('staleness rules never fire for a not-configured source (FR-006)', () => {
  it('has one rule per live source', () => {
    expect(staleness).toHaveLength(SOURCES.filter((s) => s.status === 'live').length)
  })

  it('produces no rule for a planned source', () => {
    // A planned source emits no `up` gauge, so a rule over it would be permanent NoData ⇒ firing.
    for (const planned of SOURCES.filter((s) => s.status === 'planned')) {
      expect(staleness.find((r) => r.uid === `finops-stale-${planned.id}`)).toBeUndefined()
    }
  })

  it('does NOT key on last_success, which is absent until the first successful read', () => {
    // THE BUG THIS PINS: `time() - last_success > N and on(source) configured == 1` yields an EMPTY
    // vector for a source never yet read. With noDataState: Alerting that means FIRING — so every
    // legitimately not-configured source (unset vendor token, unregistered referral code, blank
    // contract address) paged immediately and forever.
    for (const rule of staleness) {
      const expr = rule.data[0].model.expr
      expect(expr, `${rule.uid} still keys on last_success`).not.toContain('last_success')
    }
  })

  it('uses the always-sampled configured × (1 - up) product', () => {
    for (const rule of staleness) {
      const expr = rule.data[0].model.expr
      expect(expr).toContain('fairwins_finops_source_configured')
      expect(expr).toContain('fairwins_finops_source_up')
      // `* on(source) (1 - …)` — the join is asserted separately below.
      expect(expr).toMatch(/\*\s*on\(source\)\s*\(1 -/)
    }
  })

  it('evaluates the three states to the right verdicts', () => {
    // The arithmetic the expression relies on, asserted directly.
    const verdict = (configured, up) => configured * (1 - up)
    expect(verdict(1, 1)).toBe(0) // read           -> quiet
    expect(verdict(1, 0)).toBe(1) // unreadable     -> fires
    expect(verdict(0, 0)).toBe(0) // not-configured -> quiet
  })
})

describe('alert rules never carry a dashboard template variable as their datasource', () => {
  it('uses the resolvable sentinel, not ${datasource}', () => {
    // `${datasource}` is a DASHBOARD variable: correct on a panel, meaningless in an alert rule,
    // which has no variable scope. A rule provisioned with it resolves no datasource, returns
    // nothing, and noDataState: Alerting escalates that into a firing alert.
    //
    // Measured 2026-08-17, 17h after the first provision: ALL 29 rules were firing, every one a
    // false alarm — including both runway rules, for pools that were healthy.
    for (const rule of rules) {
      for (const stage of rule.data) {
        const uid = stage.datasourceUid
        expect(uid, `${rule.uid} stage ${stage.refId}`).not.toMatch(/^\$\{.*\}$/)
        // Expression stages legitimately use the built-in expression datasource.
        if (uid !== '__expr__') {
          expect(uid, `${rule.uid} stage ${stage.refId}`).toBe('__PROM_DATASOURCE_UID__')
        }
      }
    }
  })

  it('leaves a sentinel the provisioner can actually find', () => {
    // The provisioner refuses to push if the sentinel is absent, so a rename that misses one side
    // fails loudly instead of provisioning rules guaranteed to fire.
    const serialized = JSON.stringify(rules)
    expect(serialized).toContain('__PROM_DATASOURCE_UID__')
    expect(serialized).not.toContain('${datasource}')
  })
})

describe('NoData semantics are chosen per rule, not blanket', () => {
  /**
   * Two kinds of rule must NOT alert on NoData, and both were found firing on a healthy estate:
   *
   *   runway   — the exporter deliberately omits an unknowable runway (zero burn). On an idle estate
   *              that is a healthy pool, not a lost one.
   *   baseline — a rule defined by a 7d/14d comparison cannot judge anything before that history
   *              exists. Absence of a baseline is not evidence of an anomaly.
   *
   * In both cases "we have lost sight of this source" is covered by its own staleness rule, which
   * has independent data and fires on its own.
   */
  const NO_DATA_OK = ['runway', 'revenue-stall', 'cost-anomaly']
  const exempt = (uid) => NO_DATA_OK.some((k) => uid.includes(k))

  it('alerts on NoData except where absent data means "cannot judge"', () => {
    for (const rule of rules) {
      expect(rule.noDataState, `${rule.uid}`).toBe(exempt(rule.uid) ? 'OK' : 'Alerting')
      // An execution ERROR is always worth knowing — that is a broken rule, not absent data.
      expect(rule.execErrState, `${rule.uid}`).toBe('Alerting')
    }
  })

  it('the exemption list is not vacuous — every key matches a real rule', () => {
    for (const key of NO_DATA_OK) {
      expect(rules.some((r) => r.uid.includes(key)), `no rule matches '${key}'`).toBe(true)
    }
  })

  it('most rules still alert on NoData', () => {
    // Guards against the exemption quietly growing to cover everything.
    const alerting = rules.filter((r) => r.noDataState === 'Alerting').length
    expect(alerting).toBeGreaterThan(rules.length / 2)
  })
})

describe('baseline comparisons normalise over available history', () => {
  it('the cost anomaly rule does not divide by a hardcoded 7', () => {
    // `increase(...[7d]) / 7` assumes seven days exist. At 17h uptime it produced a baseline of
    // 17h/7, which any full day trivially exceeds — a guaranteed cold-start false positive.
    const rule = rules.find((r) => r.uid.includes('cost-anomaly'))
    const expr = rule.data[0].model.expr
    expect(expr).not.toMatch(/\[7d\]\)\s*\/\s*7/)
    expect(expr).toContain('avg_over_time')
    expect(expr).toContain('[7d:1d]')
  })
})

describe('vector matching is explicit where label sets differ', () => {
  it('joins the two honesty gauges with on(source)', () => {
    // configured{source,kind,status} vs up{source,kind}: a bare multiply matches NOTHING and returns
    // no series, which noDataState escalates. Measured 2026-08-17: bare form 0 series, on(source) 23.
    for (const rule of staleness) {
      const expr = rule.data[0].model.expr
      expect(expr, `${rule.uid} must join on(source)`).toContain('* on(source)')
    }
  })
})

describe('every alert points at a runbook section (FR-018)', () => {
  it('carries a runbook_url with an anchor', () => {
    for (const rule of rules) {
      expect(rule.annotations.runbook_url, `${rule.uid}`).toMatch(/finops-operations\.md#.+/)
    }
  })

  it('names the observed value in the description', () => {
    for (const rule of rules) {
      expect(rule.annotations.description).toContain('$values.A')
    }
  })
})

describe('runway alerts read the exporter series directly', () => {
  it('never divides balance by burn rate in PromQL', () => {
    // The exporter OMITS pool_runway_seconds when runway is unknowable. Dividing here would
    // resurrect the +Inf it went out of its way not to emit — which every threshold reads as health.
    for (const rule of rules.filter((r) => r.uid.includes('runway'))) {
      const expr = rule.data[0].model.expr
      expect(expr).toContain('fairwins_finops_pool_runway_seconds')
      expect(expr).not.toContain('pool_balance')
    }
  })
})
