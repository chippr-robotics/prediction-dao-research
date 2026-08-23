/**
 * Coarse per-IP route limiters (spec 095 hardening — express-rate-limit).
 *
 * These sit in FRONT of the fine-grained quota layer, which remains the real per-member control:
 * the quotas key on the recovered signer, while these bound the routes that do work before any
 * quota can key (the health snapshot's edge-auth comparison, the intent pipeline's signature
 * recovery). What is asserted here:
 *   - the Nth+1 request inside a window answers 429 with the gateway's nested error body,
 *   - draft-7 RateLimit headers are present and the legacy X-RateLimit ones are not,
 *   - a limit of 0 disables that limiter entirely (the registration site stays uniform),
 *   - the default limits are generous enough that the rest of this suite never trips them.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

function build(envOverrides = {}) {
  const config = testConfig(envOverrides)
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => TEST_NOW,
  })
  return app
}

describe('coarse route limiters (spec 095)', () => {
  it('answers 429 with the house error body once the health window is spent', async () => {
    const app = build({ RATE_LIMIT_HEALTH_PER_MIN: '3' })
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).get('/healthz')
      expect(ok.status).toBe(200)
    }
    const limited = await request(app).get('/status') // shares the handler AND the limiter window
    expect(limited.status).toBe(429)
    expect(limited.body).toEqual({
      error: { code: 'rate_limited', reason: expect.stringContaining('health rate limit') },
    })
    // draft-7 headers, never the legacy pair.
    expect(limited.headers['ratelimit']).toBeDefined()
    expect(limited.headers['x-ratelimit-limit']).toBeUndefined()
  })

  it('bounds POST /v1/intents before any body work happens', async () => {
    const app = build({ RATE_LIMIT_INTENTS_PER_MIN: '1' })
    // First request enters the pipeline (and fails validation — that is fine, it was COUNTED).
    await request(app).post('/v1/intents').set('X-Origin-Auth', ORIGIN_SECRET).send({})
    const limited = await request(app).post('/v1/intents').set('X-Origin-Auth', ORIGIN_SECRET).send({})
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('rate_limited')
  })

  it('a limit of 0 disables the limiter rather than blocking everything', async () => {
    const app = build({ RATE_LIMIT_HEALTH_PER_MIN: '0' })
    for (let i = 0; i < 8; i++) {
      const res = await request(app).get('/healthz')
      expect(res.status).toBe(200)
    }
  })
})
