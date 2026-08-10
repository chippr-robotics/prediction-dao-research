// Spec 069 — the member's RPC endpoint store.
//
// This file guards the two properties the rest of the feature leans on: what a member is
// allowed to save (validation), and what actually ends up persisted (normalization). The
// credential rules are the sharp edges — a stored token with no endpoint to use it on, or a
// URL echoed unredacted, are both leaks waiting for a log line.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  AUTH_MODES,
  ENDPOINTS_PREF_KEY,
  clearAllEndpointSettings,
  endpointsRevision,
  getEndpointSettings,
  isCspAllowedRpcUrl,
  isLoopbackHost,
  loadEndpointSettings,
  redactRpcUrl,
  resetEndpointSettings,
  saveEndpointSettings,
  subscribeEndpointSettings,
  validateEndpointEntry,
  validateRpcUrl,
  __resetEndpointStoreForTests,
} from '../../lib/network/endpointStore'

const ALCHEMY = 'https://polygon-mainnet.g.alchemy.com/v2/member-key'

describe('endpointStore — validation', () => {
  it('accepts an empty URL as "use the default"', () => {
    expect(validateRpcUrl('')).toEqual({ ok: true })
  })

  it('accepts an https endpoint on an allowlisted provider host', () => {
    expect(validateRpcUrl(ALCHEMY)).toEqual({ ok: true })
  })

  it('rejects a WebSocket endpoint (the read providers are HTTP)', () => {
    const result = validateRpcUrl('wss://polygon-mainnet.g.alchemy.com/v2/key')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/HTTP\(S\) endpoint/)
  })

  // Spec 069 follow-up: bring-your-own-node. Any https host is accepted — a self-hosted node
  // lives on a domain no build-time list can predict.
  it('accepts a self-hosted node on an arbitrary https host', () => {
    expect(validateRpcUrl('https://rpc.my-own-node.example/eth')).toEqual({ ok: true })
  })

  it('accepts a local node over http on loopback, with the local-node caveats stated', () => {
    for (const url of ['http://localhost:8545', 'http://127.0.0.1:8545']) {
      const result = validateRpcUrl(url)
      expect(result.ok).toBe(true)
      expect(result.warning).toMatch(/only from this device/)
      expect(result.warning).toMatch(/CORS/)
    }
  })

  it('refuses http on a non-loopback host, because the browser would block it anyway', () => {
    // Mixed content is not ours to grant — say which two options actually work.
    const result = validateRpcUrl('http://192.168.1.5:8545')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/https:\/\//)
    expect(result.error).toMatch(/SSH tunnel|localhost/)
  })

  it('rejects credentials embedded in the URL userinfo', () => {
    const result = validateRpcUrl('https://user:secret@polygon-mainnet.g.alchemy.com/v2/key')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/API key fields/)
  })

  it('requires a primary endpoint before a failover or an API key', () => {
    expect(validateEndpointEntry({ failoverUrl: ALCHEMY }).errors.url).toBeTruthy()
    expect(
      validateEndpointEntry({ authMode: AUTH_MODES.BEARER, authToken: 'tok' }).errors.url,
    ).toBeTruthy()
  })

  it('rejects a failover identical to the primary', () => {
    const result = validateEndpointEntry({ url: ALCHEMY, failoverUrl: ALCHEMY })
    expect(result.ok).toBe(false)
    expect(result.errors.failoverUrl).toMatch(/must differ/)
  })

  it('requires a token for header/bearer auth and a header name for header auth', () => {
    expect(
      validateEndpointEntry({ url: ALCHEMY, authMode: AUTH_MODES.BEARER }).errors.authToken,
    ).toBeTruthy()
    expect(
      validateEndpointEntry({ url: ALCHEMY, authMode: AUTH_MODES.HEADER, authToken: 'tok' })
        .errors.authHeaderName,
    ).toBeTruthy()
  })

  it('rejects a header name that is not a valid HTTP token', () => {
    const result = validateEndpointEntry({
      url: ALCHEMY,
      authMode: AUTH_MODES.HEADER,
      authHeaderName: 'x api key',
      authToken: 'tok',
    })
    expect(result.errors.authHeaderName).toBeTruthy()
  })

  it('rejects a token containing whitespace', () => {
    const result = validateEndpointEntry({
      url: ALCHEMY,
      authMode: AUTH_MODES.BEARER,
      authToken: 'two words',
    })
    expect(result.errors.authToken).toBeTruthy()
  })
})

describe('endpointStore — persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetEndpointStoreForTests()
  })

  it('round-trips an entry through storage', () => {
    saveEndpointSettings(137, { url: ALCHEMY, failoverUrl: 'https://polygon-rpc.drpc.org' })
    __resetEndpointStoreForTests() // force a re-read from storage
    expect(getEndpointSettings(137)).toEqual({
      url: ALCHEMY,
      failoverUrl: 'https://polygon-rpc.drpc.org',
    })
  })

  it('never persists a token without the endpoint that uses it', () => {
    saveEndpointSettings(137, { authMode: AUTH_MODES.BEARER, authToken: 'secret' })
    expect(getEndpointSettings(137)).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('secret')
  })

  it('drops a token when auth is switched back to none', () => {
    saveEndpointSettings(137, { url: ALCHEMY, authMode: AUTH_MODES.BEARER, authToken: 'secret' })
    expect(getEndpointSettings(137).authToken).toBe('secret')

    saveEndpointSettings(137, { url: ALCHEMY, authMode: AUTH_MODES.NONE, authToken: 'secret' })
    expect(getEndpointSettings(137).authToken).toBeUndefined()
    expect(JSON.stringify(localStorage)).not.toContain('secret')
  })

  it('clearing the URL removes the override entirely', () => {
    saveEndpointSettings(137, { url: ALCHEMY })
    saveEndpointSettings(137, { url: '' })
    expect(getEndpointSettings(137)).toBeNull()
  })

  it('reset returns one chain to the default and leaves the others alone', () => {
    saveEndpointSettings(137, { url: ALCHEMY })
    saveEndpointSettings(1, { url: 'https://eth-mainnet.g.alchemy.com/v2/key' })
    resetEndpointSettings(137)
    expect(getEndpointSettings(137)).toBeNull()
    expect(getEndpointSettings(1)).toBeTruthy()
  })

  it('bumps the revision and notifies subscribers on every change', () => {
    const seen = []
    const unsubscribe = subscribeEndpointSettings((rev) => seen.push(rev))
    const before = endpointsRevision()

    saveEndpointSettings(137, { url: ALCHEMY })
    resetEndpointSettings(137)

    expect(seen).toHaveLength(2)
    expect(endpointsRevision()).toBe(before + 2)
    unsubscribe()
    clearAllEndpointSettings()
    expect(seen).toHaveLength(2) // unsubscribed
  })

  it('ignores garbage in storage rather than throwing', () => {
    localStorage.setItem('fw_global_prefs', JSON.stringify({ [ENDPOINTS_PREF_KEY]: { notachain: {} } }))
    __resetEndpointStoreForTests()
    expect(loadEndpointSettings()).toEqual({})
  })
})

describe('endpointStore — disclosure helpers', () => {
  it('redacts the path and query where providers put the API key', () => {
    expect(redactRpcUrl(ALCHEMY)).toBe('https://polygon-mainnet.g.alchemy.com/…')
    expect(redactRpcUrl('https://rpc.example.com?key=abc')).toBe('https://rpc.example.com/…')
    expect(redactRpcUrl('https://rpc.example.com/')).toBe('https://rpc.example.com')
    expect(redactRpcUrl('not a url')).toBe('(unparseable endpoint)')
  })

  it('reports the policy the shipped CSP actually grants', () => {
    // https anywhere — including a member's own box.
    expect(isCspAllowedRpcUrl('https://polygon-mainnet.g.alchemy.com/v2/k')).toBe(true)
    expect(isCspAllowedRpcUrl('https://rpc.some-random-host.example')).toBe(true)
    // http only on loopback; everything else on http is browser-blocked regardless of policy.
    expect(isCspAllowedRpcUrl('http://localhost:8545')).toBe(true)
    expect(isCspAllowedRpcUrl('http://127.0.0.1:8545')).toBe(true)
    expect(isCspAllowedRpcUrl('http://192.168.1.5:8545')).toBe(false)
    expect(isCspAllowedRpcUrl('ftp://rpc.example.com')).toBe(false)
    expect(isCspAllowedRpcUrl('not a url')).toBe(false)
    // IPv6 loopback is a real local node but CSP cannot express a bracketed literal, so the
    // browser blocks it — answering true here would promise a route that never works.
    expect(isCspAllowedRpcUrl('http://[::1]:8545')).toBe(false)
  })

  it('recognises the loopback hostnames', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    // `URL` keeps the brackets on an IPv6 literal, so callers passing `parsed.hostname`
    // straight through get the same answer.
    expect(isLoopbackHost('[::1]')).toBe(true)
    expect(isLoopbackHost('192.168.1.5')).toBe(false)
  })

  it('refuses an IPv6 loopback endpoint rather than saving an unreachable one', () => {
    const result = validateRpcUrl('http://[::1]:8545')
    expect(result.ok).toBe(false)
    // The message has to point somewhere that works, not just say no.
    expect(result.error).toMatch(/localhost|127\.0\.0\.1/)
  })
})
