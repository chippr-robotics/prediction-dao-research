import { describe, it, expect, vi } from 'vitest'
import { resolvePhraseLookup, normalizePhrase } from '../resolvePhraseLookup.js'
import {
  makeDeps,
  makeChallengePayload,
  makePoolSummary,
  VALID_EN_CODE,
  NON_EN_PHRASE,
} from './_helpers.js'

const CREATOR = '0xCreator0000000000000000000000000000000001'

describe('normalizePhrase', () => {
  it('folds case, hyphens/underscores, and collapses whitespace', () => {
    expect(normalizePhrase('  River-Amber_Tiger   Kite ')).toBe('river amber tiger kite')
  })
  it('returns empty string for non-strings', () => {
    expect(normalizePhrase(null)).toBe('')
    expect(normalizePhrase(undefined)).toBe('')
  })
})

describe('resolvePhraseLookup — format validation (FR-008)', () => {
  it('rejects fewer than four words without calling any lookup', async () => {
    const deps = makeDeps()
    const res = await resolvePhraseLookup({ phrase: 'only three words', deps })
    expect(res.kind).toBe('format-error')
    expect(deps.lookupChallenge).not.toHaveBeenCalled()
    expect(deps.resolvePool).not.toHaveBeenCalled()
  })
  it('rejects more than four words', async () => {
    const deps = makeDeps()
    const res = await resolvePhraseLookup({ phrase: 'one two three four five', deps })
    expect(res.kind).toBe('format-error')
  })
})

describe('resolvePhraseLookup — single matches (FR-004/005)', () => {
  it('returns a challenge match when only the challenge lookup matches', async () => {
    const payload = makeChallengePayload()
    const deps = makeDeps({ challenge: { status: 'matched', payload } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, account: '0xViewer', deps })
    expect(res.kind).toBe('challenge')
    expect(res.actionable).toBe(true)
    expect(res.match).toBe(payload)
  })

  it('returns a pool match when only the pool lookup matches', async () => {
    const summary = makePoolSummary()
    const deps = makeDeps({ challenge: { status: 'not-found' }, pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, account: '0xViewer', deps })
    expect(res.kind).toBe('pool')
    expect(res.actionable).toBe(true)
    expect(res.match).toBe(summary)
  })
})

describe('resolvePhraseLookup — collision (FR-006)', () => {
  it('returns both when a phrase matches a challenge and a pool', async () => {
    const payload = makeChallengePayload()
    const summary = makePoolSummary()
    const deps = makeDeps({ challenge: { status: 'matched', payload }, pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('collision')
    expect(res.challenge).toBe(payload)
    expect(res.pool).toBe(summary)
  })
})

describe('resolvePhraseLookup — none vs lookup-failed (FR-007/025)', () => {
  it('returns none only when both sources completed with no match', async () => {
    const deps = makeDeps({ challenge: { status: 'not-found' }, pool: { notFound: true, reason: 'unknown' } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('none')
  })

  it('returns lookup-failed when the pool lookup throws and nothing matched', async () => {
    const deps = makeDeps({ challenge: { status: 'not-found' }, pool: new Error('RPC down') })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('lookup-failed')
    expect(res.sources).toContain('pool')
  })

  it('returns lookup-failed when the challenge lookup errored and nothing matched', async () => {
    const deps = makeDeps({ challenge: { status: 'errored', error: new Error('no provider') }, pool: { notFound: true } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('lookup-failed')
    expect(res.sources).toContain('challenge')
  })

  it('prefers a real match over a concurrent source error', async () => {
    const summary = makePoolSummary()
    const deps = makeDeps({ challenge: { status: 'errored', error: new Error('x') }, pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('pool')
  })
})

describe('resolvePhraseLookup — language gating (FR-009)', () => {
  it('skips the English challenge lookup for a non-English phrase (pool-only)', async () => {
    const summary = makePoolSummary()
    const deps = makeDeps({ pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: NON_EN_PHRASE, lang: 'es', deps })
    expect(deps.lookupChallenge).not.toHaveBeenCalled()
    expect(deps.resolvePool).toHaveBeenCalledWith(expect.any(String), 'es')
    expect(res.kind).toBe('pool')
  })
})

describe('resolvePhraseLookup — not-actionable & self (FR-011/012)', () => {
  it('marks a full pool as not-actionable', async () => {
    const summary = makePoolSummary({ slotsRemaining: 0 })
    const deps = makeDeps({ pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('not-actionable')
    expect(res.type).toBe('pool')
    expect(res.reason).toBe('full')
  })

  it('marks a closed pool as not-actionable', async () => {
    const summary = makePoolSummary({ state: 1, stateLabel: 'Joining closed' })
    const deps = makeDeps({ pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps })
    expect(res.kind).toBe('not-actionable')
  })

  it('marks a pool past its join deadline as not-actionable', async () => {
    const summary = makePoolSummary({ acceptDeadline: 1000 })
    const deps = makeDeps({ pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, now: 2000, deps })
    expect(res.kind).toBe('not-actionable')
    expect(res.reason).toBe('join-window-passed')
  })

  it('routes a pool the user already joined to self/management', async () => {
    const summary = makePoolSummary({ hasJoined: true })
    const deps = makeDeps({ pool: { summary } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, account: '0xViewer', deps })
    expect(res.kind).toBe('self')
    expect(res.type).toBe('pool')
  })

  it('routes a challenge the user created to self/management', async () => {
    const payload = makeChallengePayload({ wager: { creator: CREATOR } })
    const deps = makeDeps({ challenge: { status: 'matched', payload } })
    const res = await resolvePhraseLookup({ phrase: VALID_EN_CODE, account: CREATOR, deps })
    expect(res.kind).toBe('self')
    expect(res.type).toBe('challenge')
  })
})

describe('resolvePhraseLookup — concurrency (SC-007)', () => {
  it('runs both lookups concurrently, not sequentially', async () => {
    const order = []
    const lookupChallenge = vi.fn(async () => { order.push('c-start'); await Promise.resolve(); order.push('c-end'); return { status: 'not-found' } })
    const resolvePool = vi.fn(async () => { order.push('p-start'); await Promise.resolve(); order.push('p-end'); return { notFound: true } })
    await resolvePhraseLookup({ phrase: VALID_EN_CODE, deps: { lookupChallenge, resolvePool } })
    // Both start before either ends → interleaved, i.e. concurrent dispatch.
    expect(order.indexOf('p-start')).toBeLessThan(order.indexOf('c-end'))
  })
})
