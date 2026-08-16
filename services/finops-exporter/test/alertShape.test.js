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
      expect(expr).toMatch(/\*\s*\(1 -/)
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

describe('NoData is Alerting everywhere, deliberately', () => {
  it('never silently treats a vanished series as healthy', () => {
    // With the expression fixed to always sample, NoData now means the exporter stopped being
    // scraped at all — which is the one case that genuinely should page.
    for (const rule of rules) {
      expect(rule.noDataState, `${rule.uid}`).toBe('Alerting')
      expect(rule.execErrState, `${rule.uid}`).toBe('Alerting')
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
