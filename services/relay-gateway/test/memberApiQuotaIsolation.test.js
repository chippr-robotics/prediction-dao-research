/**
 * Member API quota ISOLATION — the windows that must not be shared (spec 095 hardening).
 *
 * The defect these cover: `/v1/member/*` is not behind express-rate-limit (that middleware sits on
 * `/healthz`, `/status` and `POST /v1/intents` only), so the module's whole limiter is the
 * in-process sliding window. The two UNAUTHENTICATED routes can only key on `ip:${req.ip}`, and
 * `trust proxy` is deliberately unset — so on the VM deployment every anonymous caller is the same
 * nginx address, i.e. ONE key. While that key drew from the same `createQuotas` instance as the
 * members, it also drew from the same GLOBAL counter: roughly 600 unauthenticated requests a minute
 * answered `429 quota_exceeded` to every authenticated member on every route of the module —
 * including `POST /v1/member/keys/revoke`, the one endpoint that has to work while a token is loose.
 *
 * Each test below fails on the pre-fix code, and the comment on each says how.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { testConfig, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'
import { MEMBER_API_ENV, memberApiProviders, memberToken, revocationBody } from './memberApiHelpers.js'

function build(env = {}) {
  const config = testConfig({ ...MEMBER_API_ENV, ...env })
  config.feeRouter = { ...config.feeRouter, address: null }
  const { app } = createApp(config, {
    providers: memberApiProviders(config),
    engineClient: mockEngine(),
    now: () => TEST_NOW,
  })
  return app
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)
const post = (app, path) => request(app).post(path).set('X-Origin-Auth', ORIGIN_SECRET)

describe('unauthenticated member-API traffic draws from its OWN window', () => {
  it('a flood of the OpenAPI document does not lock members out of the module', async () => {
    // The reproduction from the finding, one order of magnitude smaller: five is the members'
    // ENTIRE global allowance for the window.
    // PRE-FIX: the openapi route hit the same instance, so these six GETs spent the members' global
    // counter and the authenticated /me below answered 429 quota_exceeded.
    const app = build({ MEMBER_API_QUOTA_GLOBAL: '5' })
    for (let i = 0; i < 6; i++) {
      const res = await get(app, '/v1/member/openapi.json')
      expect(res.status).toBe(200)
    }

    const token = await memberToken()
    const me = await get(app, '/v1/member/me').set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(200)
  })

  it('has a real ceiling of its own — separate is not unlimited', async () => {
    // PRE-FIX: MEMBER_API_PUBLIC_QUOTA did not exist, the route drew on the members' global (600 by
    // default), and the third GET answered 200.
    const app = build({ MEMBER_API_PUBLIC_QUOTA: '2' })
    expect((await get(app, '/v1/member/openapi.json')).status).toBe(200)
    expect((await get(app, '/v1/member/openapi.json')).status).toBe(200)

    const limited = await get(app, '/v1/member/openapi.json')
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('quota_exceeded')
    expect(limited.headers['retry-after']).toBeDefined()
  })

  it('spends nothing from the authenticated window on its way past', async () => {
    // The converse of the first test: having answered a public request, the members' allowance must
    // be untouched. PRE-FIX both counters moved together, so a member's own budget was being
    // consumed by strangers.
    // Two members' worth of requests fit in a global of 2; the public GETs must not have taken one.
    const app = build({ MEMBER_API_QUOTA_GLOBAL: '2' })
    for (let i = 0; i < 5; i++) await get(app, '/v1/member/openapi.json')

    const token = await memberToken()
    const authed = () => get(app, '/v1/member/me').set('Authorization', `Bearer ${token}`)
    expect((await authed()).status).toBe(200)
    expect((await authed()).status).toBe(200)
  })
})

describe('POST /v1/member/keys/revoke has a budget nothing else can spend', () => {
  it('survives a flood of unauthenticated reads', async () => {
    // Revocation is the emergency control: a member reaches for it exactly when their key is loose,
    // which is also when this module may be under load from whoever holds that key.
    // PRE-FIX: the OpenAPI GETs and the revocation shared one instance, so exhausting the former
    // refused the latter with 429.
    const app = build({ MEMBER_API_PUBLIC_QUOTA: '1', MEMBER_API_REVOKE_QUOTA: '5' })
    expect((await get(app, '/v1/member/openapi.json')).status).toBe(200)
    expect((await get(app, '/v1/member/openapi.json')).status).toBe(429) // public window spent

    const res = await post(app, '/v1/member/keys/revoke').send(await revocationBody())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ revoked: true, durable: false })
  })

  it('survives an authenticated flood too', async () => {
    // The other direction: a member (or an agent with a valid key) hot-looping reads must not be
    // able to deny anybody's revocation either.
    // PRE-FIX: the authenticated calls spent the shared global, and the revocation 429'd.
    const app = build({ MEMBER_API_QUOTA_GLOBAL: '2' })
    const token = await memberToken()
    const authed = () => get(app, '/v1/member/me').set('Authorization', `Bearer ${token}`)
    await authed()
    await authed()
    expect((await authed()).status).toBe(429) // the members' global really is spent

    const res = await post(app, '/v1/member/keys/revoke').send(await revocationBody())
    expect(res.status).toBe(200)
  })

  it('is BUDGETED, not exempted — an unmetered revoke would be its own amplifier', async () => {
    // Deliberately not unlimited: this handler does an ECDSA recovery and, for a contract account,
    // an ERC-1271 chain call per request. What matters is that the budget is unshared.
    // PRE-FIX: MEMBER_API_REVOKE_QUOTA did not exist and the second call answered 200.
    const app = build({ MEMBER_API_REVOKE_QUOTA: '1' })
    const body = await revocationBody()
    expect((await post(app, '/v1/member/keys/revoke').send(body)).status).toBe(200)

    const limited = await post(app, '/v1/member/keys/revoke').send(body)
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('quota_exceeded')
  })
})

describe('boot refuses a window nobody could use', () => {
  it('rejects MEMBER_API_PUBLIC_QUOTA=0 by name', () => {
    // PRE-FIX: unvalidated (the variable did not exist), so this loaded without complaint.
    expect(() => testConfig({ ...MEMBER_API_ENV, MEMBER_API_PUBLIC_QUOTA: '0' })).toThrow(/MEMBER_API_PUBLIC_QUOTA=0/)
  })

  it('rejects MEMBER_API_REVOKE_QUOTA=0 and says why it matters', () => {
    expect(() => testConfig({ ...MEMBER_API_ENV, MEMBER_API_REVOKE_QUOTA: '0' })).toThrow(/token compromise/)
  })

  it('validates only when the module is enabled, like every other optional block', () => {
    expect(() => testConfig({ MEMBER_API_ENABLED: 'false', MEMBER_API_REVOKE_QUOTA: '0' })).not.toThrow()
  })
})
