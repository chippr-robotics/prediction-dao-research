/**
 * Capability-token authentication tests (spec 095) — the six-step check in
 * src/memberApi/auth.js, one failure mode at a time.
 *
 * The single most important group here is the THREE-VERDICT signature check. A contract account (a
 * passkey member) has no public key, so ECDSA recovery does not produce their address and the ERC-1271
 * leg is a network read. If that read cannot be made, the answer is UNKNOWN — 503 `auth_unverifiable`
 * — and NEVER 401, which would tell a member their own key is forged because our RPC was slow. That
 * is the spec-084 rule, and the tests below are what keep the two apart.
 *
 * This file also carries the config boot-validation cases, which cannot be exercised over HTTP.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import { testConfig, mockEngine, wallet, ORIGIN_SECRET, TEST_NOW } from './helpers.js'
import { MEMBER_API_ENV, memberApiProviders, memberToken } from './memberApiHelpers.js'
import { parseToken } from '../src/memberApi/auth.js'

/** A stand-in smart account: it has no key, so nothing ever ECDSA-recovers to it. */
const CONTRACT_ACCOUNT = '0xabc0000000000000000000000000000000000001'

function build({ env = {}, providerOpts = {}, killSwitch = createKillSwitch(false) } = {}) {
  const config = testConfig({ ...MEMBER_API_ENV, ...env })
  config.feeRouter = { ...config.feeRouter, address: null }
  const { app } = createApp(config, {
    providers: memberApiProviders(config, providerOpts),
    engineClient: mockEngine(),
    now: () => TEST_NOW,
    killSwitch,
    auditSink: () => {},
  })
  return { app, config }
}

const me = (app, token) =>
  request(app).get('/v1/member/me').set('X-Origin-Auth', ORIGIN_SECRET).set('Authorization', `Bearer ${token}`)

// ---- 1. parse + window + TTL --------------------------------------------------------------------

describe('token parsing (pure — never touches the network)', () => {
  it('rejects a missing, malformed, or wrongly-prefixed token', () => {
    for (const raw of ['', 'Bearer ', 'nope', 'fw2.a.b', 'fw1.a', 'fw1.a.b.c']) {
      expect(() => parseToken(raw), raw).toThrow(/invalid|missing|token must be/i)
    }
  })

  it('rejects a grant whose segment is not base64url JSON', () => {
    expect(() => parseToken('fw1.!!!.AAAA')).toThrow()
  })

  it('rejects an implausibly large token before parsing anything', () => {
    expect(() => parseToken('fw1.' + 'A'.repeat(9000) + '.AAAA')).toThrow(/implausibly large/)
  })

  it('accepts a well-formed token and derives the canonical scope string itself', async () => {
    const token = await memberToken({ scopes: ['read:wagers', 'read:profile'] })
    const parsed = parseToken(`Bearer ${token}`)
    // Sorted ascending, single spaces — derived, never taken from the wire.
    expect(parsed.scopeString).toBe('read:profile read:wagers')
    expect(parsed.grant.account).toBe(wallet.address)
  })
})

describe('token window and lifetime cap', () => {
  it('401 token_expired past expiresAt', async () => {
    const { app } = build()
    const token = await memberToken({ issuedAt: TEST_NOW - 7200, expiresAt: TEST_NOW - 1 })
    const res = await me(app, token)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('token_expired')
  })

  it('401 token_ttl_exceeded when the grant claims more than the gateway allows', async () => {
    const { app } = build({ env: { MEMBER_API_MAX_TTL_DAYS: '7' } })
    const token = await memberToken({ issuedAt: TEST_NOW - 60, expiresAt: TEST_NOW + 30 * 86_400 })
    const res = await me(app, token)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('token_ttl_exceeded')
    expect(res.body.error.reason).toContain('7')
  })

  it('accepts a grant exactly at the cap', async () => {
    const { app } = build({ env: { MEMBER_API_MAX_TTL_DAYS: '7' } })
    const token = await memberToken({ issuedAt: TEST_NOW, expiresAt: TEST_NOW + 7 * 86_400 })
    expect((await me(app, token)).status).toBe(200)
  })

  it('rejects a grant issued in the future beyond the skew tolerance', async () => {
    const { app } = build({ env: { MEMBER_API_CLOCK_SKEW_SEC: '60' } })
    const token = await memberToken({ issuedAt: TEST_NOW + 3600, expiresAt: TEST_NOW + 7200 })
    const res = await me(app, token)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('invalid_token')
  })
})

// ---- 2. the three-verdict signature check --------------------------------------------------------

describe('signature verification has THREE verdicts, never two', () => {
  it('accepts an ECDSA signature by the account itself', async () => {
    const { app } = build()
    expect((await me(app, await memberToken())).status).toBe(200)
  })

  it('401 invalid_signature when the grant’s fields were changed after signing', async () => {
    // The wire grant claims scopes the signature does not cover — the classic escalation attempt.
    const { app } = build()
    const token = await memberToken({
      scopes: ['read:profile'],
      grantOverrides: { scopes: ['read:profile', 'build:intents'] },
    })
    const res = await me(app, token)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('401 invalid_signature when someone else signed for the named account', async () => {
    const { app } = build()
    const impostor = new ethers.Wallet('0x' + '7'.repeat(63) + '1')
    const token = await memberToken({ signer: impostor, account: wallet.address })
    const res = await me(app, token)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('accepts a CONTRACT account via ERC-1271 when the account endorses the digest', async () => {
    const { app } = build({ providerOpts: { erc1271: { [CONTRACT_ACCOUNT.toLowerCase()]: 'magic' } } })
    // A smart account has no key: the ECDSA leg recovers the wallet, not the account.
    const token = await memberToken({ signer: wallet, account: CONTRACT_ACCOUNT })
    const res = await me(app, token)
    expect(res.status).toBe(200)
    expect(res.body.account).toBe(CONTRACT_ACCOUNT)
  })

  it('401 invalid_signature when the account itself declines the digest', async () => {
    const { app } = build({ providerOpts: { erc1271: { [CONTRACT_ACCOUNT.toLowerCase()]: 'wrong' } } })
    const token = await memberToken({ signer: wallet, account: CONTRACT_ACCOUNT })
    const res = await me(app, token)
    expect(res.status).toBe(401)
    // A KNOWN negative: the account was asked and said no. Contrast auth_unverifiable below.
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('503 auth_unverifiable — NOT 401 — when the ERC-1271 read cannot be made', async () => {
    // THE WHOLE POINT. An RPC failure is not evidence of forgery, and a smart-account signature
    // looks exactly like this from outside when the chain is unreachable.
    const { app } = build({ providerOpts: { erc1271: { [CONTRACT_ACCOUNT.toLowerCase()]: 'revert' } } })
    const token = await memberToken({ signer: wallet, account: CONTRACT_ACCOUNT })
    const res = await me(app, token)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('auth_unverifiable')
    expect(res.body.error.reason).toMatch(/try again/i)
  })
})

// ---- 4. membership: three states, and a failure is never tier 0 -----------------------------------

describe('membership gate', () => {
  it('403 membership_required when the account holds no active tier', async () => {
    const { app } = build({ providerOpts: { tier: 0 } })
    const res = await me(app, await memberToken())
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('membership_required')
  })

  it('403 membership_required when the membership has expired', async () => {
    const { app } = build({ providerOpts: { tier: 3, membershipExpiresAt: TEST_NOW - 1 } })
    const res = await me(app, await memberToken())
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('membership_required')
  })

  it('503 membership_unreadable — NOT a denial — when the chain cannot be read', async () => {
    const { app } = build({ providerOpts: { membershipError: true } })
    const res = await me(app, await memberToken())
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('membership_unreadable')
    // An unreadable tier must never be presented as the absence of one.
    expect(res.body.error.reason).toMatch(/not a decision that you lack one/i)
  })

  it('reads membership on the REFERENCE chain, not whichever chain was asked about', async () => {
    const { app } = build({ env: { MEMBER_API_SUBGRAPH_63: 'https://subgraph.test.invalid/mordor' } })
    const res = await request(app)
      .get('/v1/member/membership')
      .set('X-Origin-Auth', ORIGIN_SECRET)
      .set('Authorization', `Bearer ${await memberToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ state: 'read', chainId: 137, role: 'WAGER_PARTICIPANT', tier: 3, tierName: 'Gold', active: true })
  })
})

// ---- 5. sanctions: fail-closed, and distinguishable from a denial ---------------------------------

describe('sanctions screening', () => {
  it('403 sanctioned_signer when the guard says no', async () => {
    const { app } = build({ providerOpts: { allowed: false } })
    const res = await me(app, await memberToken())
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('sanctioned_signer')
  })

  it('503 screening_unavailable when the guard cannot be reached (fail closed, not fail open)', async () => {
    const { app } = build({ providerOpts: { screenError: true } })
    const res = await me(app, await memberToken())
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('screening_unavailable')
  })
})

// ---- 6. quotas ------------------------------------------------------------------------------------

describe('quotas', () => {
  it('429s with Retry-After once the per-account window is spent', async () => {
    const { app } = build({ env: { MEMBER_API_QUOTA_PER_ACCOUNT: '2', MEMBER_API_QUOTA_GLOBAL: '100' } })
    const token = await memberToken()
    expect((await me(app, token)).status).toBe(200)
    expect((await me(app, token)).status).toBe(200)
    const third = await me(app, token)
    expect(third.status).toBe(429)
    expect(third.body.error.code).toBe('quota_exceeded')
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('keys the quota by ACCOUNT, so one member cannot spend another’s allowance', async () => {
    const { app } = build({ env: { MEMBER_API_QUOTA_PER_ACCOUNT: '1', MEMBER_API_QUOTA_GLOBAL: '100' } })
    const other = new ethers.Wallet('0x' + '5'.repeat(63) + '3')
    expect((await me(app, await memberToken())).status).toBe(200)
    expect((await me(app, await memberToken())).status).toBe(429)
    // A different account starts with its own budget.
    expect((await me(app, await memberToken({ signer: other }))).status).toBe(200)
  })
})

// ---- config boot validation ------------------------------------------------------------------------

describe('member API boot validation', () => {
  it('fails boot loudly when the reference chain has no membership manager', () => {
    expect(() => testConfig({ ...MEMBER_API_ENV, MEMBER_API_REFERENCE_CHAIN_ID: '999' })).toThrow(/MEMBER_API_REFERENCE_CHAIN_ID/)
  })

  it('fails boot loudly on a malformed subgraph URL', () => {
    expect(() => testConfig({ ...MEMBER_API_ENV, MEMBER_API_SUBGRAPH_137: 'not-a-url' })).toThrow(/MEMBER_API_SUBGRAPH_137/)
  })

  it('fails boot loudly on a nonsensical TTL cap', () => {
    expect(() => testConfig({ ...MEMBER_API_ENV, MEMBER_API_MAX_TTL_DAYS: '0' })).toThrow(/MEMBER_API_MAX_TTL_DAYS/)
  })

  it('validates NOTHING while the module is disabled — a switched-off feature can never stop the boot', () => {
    expect(() =>
      testConfig({
        MEMBER_API_ENABLED: 'false',
        MEMBER_API_REFERENCE_CHAIN_ID: '999',
        MEMBER_API_SUBGRAPH_137: 'not-a-url',
        MEMBER_API_MAX_TTL_DAYS: '0',
        ASSISTANT_ENABLED: 'true',
        ASSISTANT_BASE_URL: 'not-a-url',
      })
    ).not.toThrow()
  })

  it('fails boot on a malformed assistant base URL only when the assistant is on', () => {
    expect(() => testConfig({ ...MEMBER_API_ENV, ASSISTANT_ENABLED: 'true', ASSISTANT_BASE_URL: 'not-a-url' })).toThrow(/ASSISTANT_BASE_URL/)
    expect(() => testConfig({ ...MEMBER_API_ENV, ASSISTANT_BASE_URL: 'not-a-url' })).not.toThrow()
  })

  it('does NOT fail boot on a missing model credential — an optional secret fails its route closed', () => {
    // Losing the assistant must never take down the gasless relay path (fetch-secrets invariant 5).
    const config = testConfig({ ...MEMBER_API_ENV, ASSISTANT_ENABLED: 'true' })
    expect(config.memberApi.assistant.enabled).toBe(true)
    expect(config.memberApi.assistant.apiKey).toBeNull()
  })

  it('defaults the reference chain to the first enabled chain with a membership manager', () => {
    const config = testConfig({ ...MEMBER_API_ENV })
    expect(config.memberApi.referenceChainId).toBe(137)
    expect(config.memberApi.maxTtlDays).toBe(90)
  })
})
