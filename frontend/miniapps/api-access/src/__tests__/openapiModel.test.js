import { describe, it, expect } from 'vitest'

import { documentInfo, groupByTag, listOperations, queryParameterNames, scopeForOperation, tryableOperations } from '../openapiModel'
import { MEMBER_API_DOC } from './_fixtures'

// Spec 095 — reading the gateway's own description. This module is deliberately tolerant: the
// document comes from whatever gateway the member pointed at, which may be newer than this frozen
// package, so anything unrecognised has to degrade to "not stated" rather than to a thrown render.

describe('scopeForOperation', () => {
  it('prefers the x-fairwins-scope extension', () => {
    expect(scopeForOperation({ 'x-fairwins-scope': 'read:fees', security: [{ memberToken: ['other'] }] }))
      .toBe('read:fees')
  })

  it('falls back to a standard security requirement', () => {
    expect(scopeForOperation({ security: [{ memberToken: ['read:wagers'] }] })).toBe('read:wagers')
  })

  it('reports null for an operation declared public', () => {
    expect(scopeForOperation({ security: [] })).toBeNull()
  })

  it('reports null rather than guessing when nothing is stated', () => {
    expect(scopeForOperation({})).toBeNull()
  })
})

describe('listOperations', () => {
  it('finds every method across every path', () => {
    const keys = listOperations(MEMBER_API_DOC).map((op) => op.key)
    expect(keys).toEqual([
      'GET /v1/member/openapi.json',
      'GET /v1/member/me',
      'GET /v1/member/wagers',
      'POST /v1/member/intents/build',
    ])
  })

  it('survives a document with no paths at all', () => {
    expect(listOperations({})).toEqual([])
    expect(listOperations(null)).toEqual([])
  })
})

describe('groupByTag', () => {
  it('keeps the document’s own tag order, then appends tags it did not declare', () => {
    const groups = groupByTag(MEMBER_API_DOC)
    // discovery/identity/reads are declared in that order; `build` is used but not declared.
    expect(groups.map((g) => g.name)).toEqual(['discovery', 'identity', 'reads', 'build'])
    expect(groups[0].description).toMatch(/No credential required/)
  })

  it('collects untagged operations into a final "Other" group', () => {
    const groups = groupByTag({ paths: { '/x': { get: { summary: 'x' } } } })
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Other')
  })
})

describe('tryableOperations', () => {
  it('offers GET endpoints only — a POST here would be the console acting for the member', () => {
    expect(tryableOperations(MEMBER_API_DOC).map((op) => op.path)).toEqual([
      '/v1/member/openapi.json',
      '/v1/member/me',
      '/v1/member/wagers',
    ])
  })

  it('excludes a templated path, because there is no UI to fill one in', () => {
    const doc = { paths: { '/v1/member/wagers/{id}': { get: {} } } }
    expect(tryableOperations(doc)).toEqual([])
  })
})

describe('queryParameterNames', () => {
  it('names the query parameters an operation declares, marking the required ones', () => {
    const wagers = listOperations(MEMBER_API_DOC).find((op) => op.path === '/v1/member/wagers')
    expect(queryParameterNames(wagers)).toEqual(['chainId', 'first'])
  })
})

describe('documentInfo', () => {
  it('never renders undefined for a missing field', () => {
    expect(documentInfo({})).toEqual({ title: 'API', version: '', summary: '', openapi: '' })
  })

  it('reads the real fields when present', () => {
    expect(documentInfo(MEMBER_API_DOC)).toEqual({
      title: 'FairWins Member API',
      version: '1.0.0',
      summary: 'Custody-free, member-signed programmatic access.',
      openapi: '3.1.0',
    })
  })
})
