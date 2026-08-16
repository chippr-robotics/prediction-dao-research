/**
 * The honesty invariants (spec 089, FR-006 / FR-010 / FR-011 / FR-014).
 *
 * These are the tests that matter most in this service. Everything else is plumbing; this is the
 * property the whole feature rests on — that a source which could not be read NEVER renders as a
 * zero, anywhere, in any panel, under any failure mode.
 */
import { describe, it, expect } from 'vitest'
import { createRegistry } from '../src/registry.js'
import { read, notConfigured, unreadable, attempt, redact, READ } from '../src/reading.js'
import { aggregate, ratio } from '../src/aggregate.js'

const liveRevenue = {
  id: 'test-revenue',
  kind: 'revenue',
  status: 'live',
  metric: 'fairwins_finops_revenue_total',
  unit: 'USDC',
  meaning: 'test',
}
const liveCost = {
  id: 'test-cost',
  kind: 'cost',
  status: 'live',
  metric: 'fairwins_finops_cost_usd_total',
  unit: 'USD',
  basis: 'billed',
  meaning: 'test',
}

describe('Reading — a value cannot exist without a successful read', () => {
  it('read() carries a value', () => {
    const r = read(42, 'USDC')
    expect(r.state).toBe(READ)
    expect(r.value).toBe(42)
  })

  it('notConfigured() and unreadable() have a null value and no way to set one', () => {
    expect(notConfigured('no token').value).toBeNull()
    expect(unreadable('boom').value).toBeNull()
  })

  it('a non-finite value is UNREADABLE, never a reading of zero or infinity', () => {
    // An Infinity reaching a runway gauge reads to an alert rule as "infinite runway, all is well".
    expect(read(Infinity, 'POL').state).toBe('unreadable')
    expect(read(NaN, 'USD').state).toBe('unreadable')
    expect(read(undefined, 'USD').value).toBeNull()
  })

  it('attempt() converts any throw into unreadable, never into a zero', async () => {
    const r = await attempt(() => {
      throw new Error('vendor exploded')
    })
    expect(r.state).toBe('unreadable')
    expect(r.value).toBeNull()
    expect(r.reason).toContain('vendor exploded')
  })

  it('attempt() rejects a collector that returns nothing', async () => {
    expect((await attempt(() => undefined)).state).toBe('unreadable')
  })
})

describe('redact — a failure reason never leaks a credential', () => {
  it('strips bearer tokens, api keys, query-string secrets and key material', () => {
    expect(redact('failed: Bearer abc123XYZ_token')).not.toContain('abc123XYZ_token')
    expect(redact('x-api-key: qn_secretvalue')).not.toContain('qn_secretvalue')
    expect(redact('GET https://api.example.com/v1?token=hunter2&x=1')).not.toContain('hunter2')
    expect(redact(`key 0x${'a'.repeat(64)}`)).toContain('<redacted-key-material>')
  })

  it('is applied automatically by unreadable()', () => {
    expect(unreadable('auth failed for Bearer sk_live_deadbeef').reason).not.toContain('sk_live_deadbeef')
  })
})

describe('registry — the value metric is emitted ONLY on a successful read', () => {
  it('emits configured=1, up=1 and the value on read', () => {
    const r = createRegistry()
    r.record(liveRevenue, read(100, 'USDC'))
    const snap = r.snapshot()
    expect(snap.fairwins_finops_source_configured[0].value).toBe(1)
    expect(snap.fairwins_finops_source_up[0].value).toBe(1)
    expect(snap.fairwins_finops_revenue_total[0].value).toBe(100)
  })

  it('emits NO value metric when unreadable — this is the central invariant', () => {
    const r = createRegistry()
    r.record(liveCost, unreadable('cloudflare 503'))
    const snap = r.snapshot()
    expect(snap.fairwins_finops_source_configured[0].value).toBe(1)
    expect(snap.fairwins_finops_source_up[0].value).toBe(0)
    // Absent, NOT zero. A zero here would read as "this cost us nothing".
    expect(snap.fairwins_finops_cost_usd_total).toBeUndefined()
  })

  it('emits NO value metric when not-configured, and marks it distinctly from unreadable', () => {
    const r = createRegistry()
    r.record(liveCost, notConfigured('QUICKNODE_API_KEY unset'))
    const snap = r.snapshot()
    expect(snap.fairwins_finops_source_configured[0].value).toBe(0)
    expect(snap.fairwins_finops_cost_usd_total).toBeUndefined()
  })

  it('the three states are decodable from the two gauges alone', () => {
    const r = createRegistry()
    r.record({ ...liveRevenue, id: 'a' }, read(1, 'USDC'))
    r.record({ ...liveRevenue, id: 'b' }, unreadable('down'))
    r.record({ ...liveRevenue, id: 'c' }, notConfigured('unset'))
    const conf = Object.fromEntries(r.snapshot().fairwins_finops_source_configured.map((s) => [s.source, s.value]))
    const up = Object.fromEntries(r.snapshot().fairwins_finops_source_up.map((s) => [s.source, s.value]))
    expect([conf.a, up.a]).toEqual([1, 1]) // read
    expect([conf.b, up.b]).toEqual([1, 0]) // unreadable
    expect(conf.c).toBe(0) // not-configured
  })

  it('a planned source emits no value and no up gauge (FR-014)', () => {
    const r = createRegistry()
    r.record({ id: 'planned-thing', kind: 'revenue', status: 'planned', metric: null, meaning: 'x' }, notConfigured('not yet live'))
    const snap = r.snapshot()
    expect(snap.fairwins_finops_source_configured[0].value).toBe(0)
    // No `up` — a planned source is not broken, and up=0 would page forever.
    expect(snap.fairwins_finops_source_up).toBeUndefined()
    expect(snap.fairwins_finops_revenue_total).toBeUndefined()
  })

  it('renders valid Prometheus text with escaped label values', () => {
    const r = createRegistry()
    r.record(liveRevenue, read(12.5, 'USDC'))
    const text = r.render()
    expect(text).toMatch(/# TYPE fairwins_finops_revenue_total counter/)
    expect(text).toMatch(/fairwins_finops_revenue_total\{[^}]*source="test-revenue"[^}]*\} 12\.5/)
    // HELP must be one line even though catalogue `meaning` prose is long and multi-line.
    for (const line of text.split('\n').filter((l) => l.startsWith('# HELP'))) {
      expect(line.split('\n')).toHaveLength(1)
    }
  })
})

describe('aggregate — totals never lie about what is in them', () => {
  const R = (source, reading) => ({ source, reading })

  it('never sums across units', () => {
    const out = aggregate([
      R(liveRevenue, read(100, 'USDC')),
      R({ ...liveRevenue, id: 'other', unit: 'POL' }, read(5, 'POL')),
    ])
    expect(out.revenue.byUnit).toEqual({ USDC: 100, POL: 5 })
  })

  it('marks a total PARTIAL and names the missing source (FR-011)', () => {
    const out = aggregate([
      R(liveCost, read(50, 'USD')),
      R({ ...liveCost, id: 'cloudflare' }, unreadable('503')),
    ])
    expect(out.cost.partial).toBe(true)
    expect(out.cost.missingSources).toEqual(['cloudflare'])
    // The total is what we could read — and it is LABELLED as incomplete rather than presented as final.
    expect(out.cost.byUnit.USD).toBe(50)
  })

  it('does NOT mark a total partial merely because a source is not-configured', () => {
    // An unwired feature is not missing data. Conflating them makes "partial" permanent and ignored.
    const out = aggregate([R(liveCost, read(50, 'USD')), R({ ...liveCost, id: 'qn' }, notConfigured('no key'))])
    expect(out.cost.partial).toBe(false)
    expect(out.cost.notConfiguredSources).toEqual(['qn'])
  })

  it('excludes planned sources from every total (FR-014)', () => {
    const out = aggregate([
      R(liveRevenue, read(100, 'USDC')),
      R({ id: 'miniapp-licenses', kind: 'revenue', status: 'planned', metric: null }, notConfigured('not yet live')),
    ])
    expect(out.revenue.byUnit).toEqual({ USDC: 100 })
    expect(out.revenue.partial).toBe(false)
  })

  it('excludes accrued and waived revenue from the revenue total', () => {
    // Adding accrued to received double-counts every fee that has since been withdrawn.
    const out = aggregate([
      R(liveRevenue, read(100, 'USDC')),
      R({ ...liveRevenue, id: 'accrued', metric: 'fairwins_finops_revenue_accrued' }, read(40, 'USDC')),
      R({ ...liveRevenue, id: 'waived', metric: 'fairwins_finops_revenue_waived_total' }, read(7, 'USDC')),
    ])
    expect(out.revenue.byUnit.USDC).toBe(100)
  })

  it('produces no USD roll-up when any contributing unit has no rate', () => {
    const out = aggregate(
      [R(liveRevenue, read(100, 'USDC')), R({ ...liveRevenue, id: 'pol', unit: 'POL' }, read(5, 'POL'))],
      { rateFor: (u) => (u === 'USDC' ? 1 : null) },
    )
    expect(out.revenue.usd).toBeNull()
    expect(out.revenue.usdUnavailableBecause).toContain('POL')
  })

  it('produces a USD roll-up when every unit converts', () => {
    const out = aggregate(
      [R(liveRevenue, read(100, 'USDC')), R({ ...liveRevenue, id: 'pol', unit: 'POL' }, read(5, 'POL'))],
      { rateFor: (u) => (u === 'USDC' ? 1 : 0.5) },
    )
    expect(out.revenue.usd).toBe(102.5)
  })
})

describe('ratio — a KPI refuses to exist on a missing input (FR-012)', () => {
  it('computes when both inputs were read', () => {
    expect(ratio(read(10, 'USD'), read(5, 'ops'))).toBe(2)
  })

  it('returns null — not zero — when an input is unreadable', () => {
    // A cost-per-op of 0 because the op count failed to load reads as excellent news.
    expect(ratio(read(10, 'USD'), unreadable('down'))).toBeNull()
    expect(ratio(unreadable('down'), read(5, 'ops'))).toBeNull()
  })

  it('returns null on a zero denominator rather than Infinity', () => {
    expect(ratio(read(10, 'USD'), read(0, 'ops'))).toBeNull()
  })
})
