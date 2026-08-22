import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { apiUrl, DEFAULT_BASE_URL, normalizeBaseUrl, requestJson } from '../apiClient'
import { errorBody, htmlResponse, jsonResponse } from './_fixtures'

// Spec 095 — the package's network layer. The point under test is that THREE outcomes exist and
// stay distinguishable: an answer, a refusal, and no answer at all. Collapsing the middle one is
// what turns "your key lacks a scope" into "something went wrong".

describe('normalizeBaseUrl', () => {
  it('accepts a bare host and reads it as https', () => {
    expect(normalizeBaseUrl('relay.fairwins.app')).toEqual({ ok: true, baseUrl: 'https://relay.fairwins.app' })
  })

  it('drops a trailing slash but keeps a path prefix', () => {
    expect(normalizeBaseUrl('https://example.test/api/')).toEqual({ ok: true, baseUrl: 'https://example.test/api' })
  })

  it('allows http, for a gateway on this machine', () => {
    expect(normalizeBaseUrl('http://localhost:8787')).toEqual({ ok: true, baseUrl: 'http://localhost:8787' })
  })

  it('refuses a non-http scheme rather than coercing it', () => {
    const result = normalizeBaseUrl('ws://example.test')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/ws:\/\/ is not supported/)
  })

  it('refuses an empty value', () => {
    expect(normalizeBaseUrl('   ').ok).toBe(false)
  })

  it('exports the public default it uses as a placeholder', () => {
    expect(DEFAULT_BASE_URL).toBe('https://relay.fairwins.app')
  })
})

describe('apiUrl', () => {
  it('joins without doubling a slash', () => {
    expect(apiUrl('https://example.test/', '/v1/member/me')).toBe('https://example.test/v1/member/me')
  })
})

describe('requestJson', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('sends the token in the Authorization header and never in the URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('https://example.test/v1/member/me', { token: 'fw1.grant.sig' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.test/v1/member/me')
    expect(url).not.toContain('fw1.')
    expect(init.headers.Authorization).toBe('Bearer fw1.grant.sig')
    expect(init.credentials).toBe('omit')
  })

  it('omits the Authorization header entirely when there is no token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('https://example.test/v1/member/openapi.json')

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('reports a 2xx as state "ok" with the parsed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ account: '0xabc' })))
    await expect(requestJson('https://example.test/x')).resolves.toEqual({
      state: 'ok',
      status: 200,
      body: { account: '0xabc' },
    })
  })

  it('reports the platform error body verbatim as state "error" — not as an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      errorBody('insufficient_scope', 'this key does not carry the "read:wagers" scope'),
      { status: 403 },
    )))

    const result = await requestJson('https://example.test/x', { token: 't' })

    expect(result.state).toBe('error')
    expect(result.status).toBe(403)
    expect(result.error).toEqual({
      code: 'insufficient_scope',
      reason: 'this key does not carry the "read:wagers" scope',
    })
    // The raw body is kept so the console can print exactly what came back.
    expect(result.body).toEqual(errorBody('insufficient_scope', 'this key does not carry the "read:wagers" scope'))
  })

  it('carries Retry-After through on a 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      errorBody('quota_exceeded', 'slow down'),
      { status: 429, headers: { 'Retry-After': '30' } },
    )))
    const result = await requestJson('https://example.test/x')
    expect(result.retryAfter).toBe('30')
  })

  it('synthesises a code when an error body is not the platform shape, and says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'nope' }, { status: 500 })))
    const result = await requestJson('https://example.test/x')
    expect(result.state).toBe('error')
    expect(result.error.code).toBe('http_500')
    expect(result.error.reason).toMatch(/did not carry a FairWins error code/)
  })

  it('reports a network failure as state "unreachable" — never as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const result = await requestJson('https://example.test/x')
    expect(result.state).toBe('unreachable')
    expect(result.reason).toMatch(/could not be reached/)
    expect(result).not.toHaveProperty('body')
  })

  it('treats a 200 that is not JSON as unreachable, naming the likely cause', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse()))
    const result = await requestJson('https://example.test/x')
    expect(result.state).toBe('unreachable')
    expect(result.reason).toMatch(/not with JSON/)
  })

  it('rethrows an abort so a caller can drop the result of a mount that went away', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort }))
    await expect(requestJson('https://example.test/x')).rejects.toThrow('aborted')
  })
})
