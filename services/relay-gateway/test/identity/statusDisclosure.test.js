/**
 * Status disclosure (spec 105 slice 5c, #1448 / T037).
 *
 * Two rules, both already violated once in this feature's own drafts:
 *
 *   1. /status IS ORIGIN-LOCK EXEMPT. The first draft of the API contract asserted the opposite,
 *      and anything added on that belief would have been world-readable on the raw origin URL.
 *      The identity/access blocks therefore sit behind the edge gate, and the PUBLIC body test
 *      is the load-bearing one here.
 *
 *   2. DISABLED MUST BE LEGIBLE (FR-015). `enforcing: false` is present and explicit when the
 *      layer is off — a gateway running with identity checks disabled looks exactly like one
 *      enforcing them from the outside, and this field is the only place the difference exists.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server.js'
import { testConfig, mockEngine, mockProviders, ORIGIN_SECRET } from '../helpers.js'

function build(env = {}) {
  const config = testConfig(env)
  const { app } = createApp(config, { providers: mockProviders(config), engineClient: mockEngine() })
  return { app, config }
}

describe('/status — the gated identity disclosure', () => {
  it('withholds callerIdentity, upstreams and access from the PUBLIC body', async () => {
    // The load-bearing test: /status answers without the origin-lock header, so everything in
    // the public body is readable by anyone who finds the raw origin URL.
    const { app } = build({ IDENTITY_ENABLED: 'true' })
    const res = await request(app).get('/status')
    expect(res.status).toBe(200)
    expect(res.body.callerIdentity).toBeUndefined()
    expect(res.body.upstreams).toBeUndefined()
    expect(res.body.access).toBeUndefined()
  })

  it('disclosed: reports enforcing:false EXPLICITLY when the layer is off (FR-015)', async () => {
    const { app } = build({ IDENTITY_ENABLED: 'false' })
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.callerIdentity.enabled).toBe(false)
    expect(res.body.callerIdentity.enforcing).toBe(false) // present, not merely absent
  })

  it('disclosed: resolving-but-not-enforcing reads as enabled:true, enforcing:false', async () => {
    const { app } = build({ IDENTITY_ENABLED: 'true' })
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.callerIdentity).toMatchObject({ enabled: true, enforcing: false })
  })

  it('disclosed: enforcement reads the LIVE config, so a SIGHUP reload shows on the next poll', async () => {
    const { app, config } = build({ IDENTITY_ENABLED: 'true' })
    config.identity.enforce = true // what the reload handler's mutation amounts to
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.callerIdentity.enforcing).toBe(true)
  })

  it('disclosed: the killswitch reads as not-enforcing even while enabled', async () => {
    const { app } = build({ IDENTITY_ENABLED: 'true', IDENTITY_ENFORCE: 'true', IDENTITY_KILLSWITCH: 'true' })
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.callerIdentity.enforcing).toBe(false)
  })

  it('disclosed: attestation reports "not-built" — a fact about the codebase, not a switch', async () => {
    const { app } = build({ IDENTITY_ENABLED: 'true' })
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.callerIdentity.verifiers.attestation).toBe('not-built')
  })

  it('disclosed: the challenge verifier states configured / not-configured honestly', async () => {
    const off = await request(build({ IDENTITY_ENABLED: 'true' }).app)
      .get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(off.body.callerIdentity.verifiers.challenge).toBe('not-configured')

    const on = await request(build({ IDENTITY_ENABLED: 'true', CHALLENGE_SECRET: 'real-secret' }).app)
      .get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(on.body.callerIdentity.verifiers.challenge).toBe('configured')
  })

  it('disclosed: upstream labels come from the bounded table, never request content (FR-036)', async () => {
    const { app } = build({ IDENTITY_ENABLED: 'true', UPSTREAM_CEILING_OPENSEA: '100' })
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.upstreams.state).toBe('read')
    for (const key of Object.keys(res.body.upstreams.ceilings)) {
      expect(key).toMatch(/^[a-z]+$/) // module ids — never an address, wager id, or path
    }
  })

  it('disclosed: keyed access reports not-configured while dormant, as a state and not an absence', async () => {
    const { app } = build({})
    const res = await request(app).get('/status').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.body.access).toEqual({ state: 'not-configured' })
  })
})
