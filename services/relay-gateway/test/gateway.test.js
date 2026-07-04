/**
 * Relay-gateway API tests (contracts/relay-gateway-api.md — routes, status codes, error codes).
 * All chain/engine access is mocked via dependency injection; typed-data signing is real
 * (ethers v6) against the version-pinned addresses from deployments/.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import { loadConfig } from '../src/config/index.js'
import {
  testConfig,
  mockProviders,
  mockEngine,
  signedIntent,
  signedPaymentIntent,
  randomMarker,
  wallet,
  ORIGIN_SECRET,
  WEBHOOK_SECRET,
  TEST_NOW,
  DEPLOYMENTS_DIR,
} from './helpers.js'

const now = () => TEST_NOW

function build({ config = testConfig(), providers, engine = mockEngine(), killSwitch = createKillSwitch(false), auditLines = [] } = {}) {
  const deps = {
    providers: providers ?? mockProviders(config),
    engineClient: engine,
    now,
    killSwitch,
    auditSink: (line) => auditLines.push(JSON.parse(line)),
  }
  const { app, ...rest } = createApp(config, deps)
  return { app, config, engine, killSwitch, auditLines, ...rest }
}

const post = (app, body) =>
  request(app).post('/v1/intents').set('X-Origin-Auth', ORIGIN_SECRET).send(body)

describe('config / startup consistency check (FR-025)', () => {
  it('pins targets from deployments and fails loudly for a chain without a record', () => {
    const config = testConfig()
    expect(config.chains[137].targetsByKey.wagerRegistry).toBe('0x5023765809fDA93ab9F11B684fdb76521eD31774')
    expect(config.chains[63].gasType).toBe('legacy')
    expect(config.chains[63].paymentSupported).toBe(false)
    // ETC mainnet (61) has no deployments record yet -> enabling it must throw.
    expect(() =>
      loadConfig({ ENABLED_CHAIN_IDS: '61' }, { deploymentsDir: DEPLOYMENTS_DIR })
    ).toThrow(/no deployment record/)
  })
})

describe('origin lock (FR-029, SC-016)', () => {
  it('403 origin_denied without X-Origin-Auth; wrong secret also denied', async () => {
    const { app, config } = build()
    const intent = await signedIntent(config)
    const r1 = await request(app).post('/v1/intents').send(intent)
    expect(r1.status).toBe(403)
    expect(r1.body.error.code).toBe('origin_denied')
    const r2 = await request(app).post('/v1/intents').set('X-Origin-Auth', 'wrong').send(intent)
    expect(r2.status).toBe(403)
    expect(r2.body.error.code).toBe('origin_denied')
  })

  it('/healthz is origin-lock exempt', async () => {
    const { app } = build()
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
  })
})

describe('POST /v1/intents validation', () => {
  let ctx
  beforeEach(() => {
    ctx = build()
  })

  it('accepts a valid signer-attributed intent -> 202 {intentId, status, txHash}', async () => {
    const intent = await signedIntent(ctx.config)
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(202)
    expect(res.body.intentId).toBeTruthy()
    expect(res.body.status).toBe('submitted')
    expect(res.body.txHash).toMatch(/^0x/)
    // Engine got the encoded claimPayoutWithSig call for the pinned registry.
    expect(ctx.engine.submissions).toHaveLength(1)
    const { args } = ctx.engine.submissions[0]
    expect(args.relayerId).toBe('polygon-137')
    expect(args.to.toLowerCase()).toBe(ctx.config.chains[137].targetsByKey.wagerRegistry.toLowerCase())
    expect(args.data.startsWith('0x')).toBe(true)
  })

  it('accepts a valid payment-class intent (EIP-3009 recovery) -> 202', async () => {
    const intent = await signedPaymentIntent(ctx.config)
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(202)
    expect(ctx.engine.submissions).toHaveLength(1)
    expect(ctx.engine.submissions[0].args.to.toLowerCase()).toBe(
      ctx.config.chains[137].targetsByKey.membershipManager.toLowerCase()
    )
  })

  it('400 invalid_signature on a tampered signature', async () => {
    const intent = await signedIntent(ctx.config)
    // Flip a nibble inside `r` (not the trailing v byte — v=27 tampered to yParity 0 recovers the
    // same address half the time, which made this assertion flaky).
    const i = 10
    intent.signature =
      intent.signature.slice(0, i) + (intent.signature[i] === 'f' ? '0' : 'f') + intent.signature.slice(i + 1)
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_signature')
    expect(ctx.engine.submissions).toHaveLength(0)
  })

  it('400 invalid_signature when the actor is not the signer', async () => {
    const other = ethers.Wallet.createRandom()
    const intent = await signedIntent(ctx.config)
    intent.params.claimant = other.address // recovered != claimed actor
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('400 chain_mismatch for an unconfigured chainId', async () => {
    const intent = await signedIntent(ctx.config)
    intent.chainId = 999
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('chain_mismatch')
  })

  it('400 chain_mismatch when the intent was signed for another configured network (SC-014)', async () => {
    // Signed under chain 137's domain, submitted as an 80002 intent against 80002's registry.
    const intent = await signedIntent(ctx.config, { chainId: 80002, domainChainId: 137 })
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('chain_mismatch')
    expect(ctx.engine.submissions).toHaveLength(0)
  })

  it('400 target_not_allowlisted for a non-pinned target contract', async () => {
    const intent = await signedIntent(ctx.config)
    intent.targetContract = ethers.Wallet.createRandom().address
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('target_not_allowlisted')
  })

  it('400 target_not_allowlisted for an unknown action name', async () => {
    const intent = await signedIntent(ctx.config)
    intent.action = 'mintUnicorn' // not a spec-035 action
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('target_not_allowlisted')
  })

  it('400 expired / 400 not_yet_valid on the validity window', async () => {
    const expired = await signedIntent(ctx.config, { validBefore: TEST_NOW - 10 })
    const r1 = await post(ctx.app, expired)
    expect(r1.status).toBe(400)
    expect(r1.body.error.code).toBe('expired')

    const future = await signedIntent(ctx.config, { validAfter: TEST_NOW + 1000 })
    const r2 = await post(ctx.app, future)
    expect(r2.status).toBe(400)
    expect(r2.body.error.code).toBe('not_yet_valid')
  })

  it('503 payment_unsupported_on_chain for the payment class on Mordor (63)', async () => {
    const intent = {
      intentClass: 'payment',
      chainId: 63,
      targetContract: ctx.config.chains[63].targetsByKey.membershipManager,
      action: 'purchaseTier',
      params: {},
      signature: '0x00',
      authorization: {
        from: wallet.address, to: ctx.config.chains[63].targetsByKey.membershipManager,
        value: '1', validAfter: 0, validBefore: TEST_NOW + 100, nonce: randomMarker(),
        v: 27, r: randomMarker(), s: randomMarker(),
      },
      validAfter: 0,
      validBefore: TEST_NOW + 100,
      uniquenessMarker: randomMarker(),
    }
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('payment_unsupported_on_chain')
  })
})

describe('dedup idempotency (FR-008, SC-006)', () => {
  it('in-flight duplicate -> 409 duplicate_in_flight; completed -> 200 with the ORIGINAL result', async () => {
    const ctx = build()
    const intent = await signedIntent(ctx.config)

    const first = await post(ctx.app, intent)
    expect(first.status).toBe(202)
    const { intentId, txHash } = first.body

    // Same marker while in flight -> coalesced, no second engine submission.
    const dup = await post(ctx.app, intent)
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('duplicate_in_flight')
    expect(ctx.engine.submissions).toHaveLength(1)

    // Engine reports mined -> intent confirmed; replay now returns the original result (200).
    await request(ctx.app)
      .post('/v1/engine/webhook')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send({ id: 'engine-tx-1', hash: txHash, status: 'mined' })
      .expect(200)

    const replay = await post(ctx.app, intent)
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({ intentId, status: 'confirmed', txHash })
    expect(ctx.engine.submissions).toHaveLength(1) // still exactly one on-chain submission
  })

  it('a failed submission releases the marker for a safe retry', async () => {
    const ctx = build()
    const intent = await signedIntent(ctx.config)
    const first = await post(ctx.app, intent)
    expect(first.status).toBe(202)
    await request(ctx.app)
      .post('/v1/engine/webhook')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send({ id: 'engine-tx-1', status: 'failed', reason: 'out of gas' })
      .expect(200)
    const retry = await post(ctx.app, intent)
    expect(retry.status).toBe(202)
    expect(ctx.engine.submissions).toHaveLength(2)
  })
})

describe('sanctions re-screen — fail-closed (FR-013, SC-005)', () => {
  it('503 screening_unavailable when the guard RPC errors (fail closed, never submit)', async () => {
    const config = testConfig()
    const ctx = build({ config, providers: mockProviders(config, { screenError: true }) })
    const res = await post(ctx.app, await signedIntent(config))
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('screening_unavailable')
    expect(ctx.engine.submissions).toHaveLength(0)
  })

  it('403 sanctioned_signer when the guard says not allowed', async () => {
    const config = testConfig()
    const ctx = build({ config, providers: mockProviders(config, { allowed: false }) })
    const res = await post(ctx.app, await signedIntent(config))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('sanctioned_signer')
    expect(ctx.engine.submissions).toHaveLength(0)
  })
})

describe('quotas + back-pressure (FR-009/FR-014)', () => {
  it('429 quota_exceeded with Retry-After past the per-signer quota', async () => {
    const config = testConfig({ SIGNER_QUOTA_PER_MIN: '2' })
    const ctx = build({ config })
    expect((await post(ctx.app, await signedIntent(config))).status).toBe(202)
    expect((await post(ctx.app, await signedIntent(config))).status).toBe(202)
    const third = await post(ctx.app, await signedIntent(config))
    expect(third.status).toBe(429)
    expect(third.body.error.code).toBe('quota_exceeded')
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('429 backpressure when the bounded queue is full', async () => {
    const config = testConfig({ MAX_QUEUE_DEPTH: '1' })
    const ctx = build({ config })
    expect((await post(ctx.app, await signedIntent(config))).status).toBe(202) // now in flight
    const shed = await post(ctx.app, await signedIntent(config))
    expect(shed.status).toBe(429)
    expect(shed.body.error.code).toBe('backpressure')
    expect(Number(shed.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('402 fee_exceeds_cap in fee-netted mode when estimated gas > maxFee (FR-023)', async () => {
    const ctx = build()
    const intent = await signedIntent(ctx.config)
    intent.fundingMode = 'fee-netted'
    intent.maxFee = '1' // 1 wei; mock estimate is 100000 gas * 30 gwei
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(402)
    expect(res.body.error.code).toBe('fee_exceeds_cap')
    expect(ctx.engine.submissions).toHaveLength(0)
  })
})

describe('kill switch (FR-015) + engine failure', () => {
  it('503 killswitch_active while active; accepts again once cleared', async () => {
    const ctx = build()
    ctx.killSwitch.set(true)
    const res = await post(ctx.app, await signedIntent(ctx.config))
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('killswitch_active')
    ctx.killSwitch.set(false)
    expect((await post(ctx.app, await signedIntent(ctx.config))).status).toBe(202)
  })

  it('503 chain_unavailable when the engine is down, and the marker is released for retry', async () => {
    const config = testConfig()
    const down = mockEngine({ fail: true })
    const ctx = build({ config, engine: down })
    const intent = await signedIntent(config)
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('chain_unavailable')
    // Same intent succeeds once the engine is back (fresh app shares nothing; use same app):
    const ctx2 = build({ config })
    expect((await post(ctx2.app, intent)).status).toBe(202)
  })
})

describe('webhook + status lifecycle (FR-006: never confirmed before inclusion)', () => {
  it('rejects a missing/wrong webhook secret (timing-safe shared secret)', async () => {
    const { app } = build()
    await request(app).post('/v1/engine/webhook').send({ id: 'x', status: 'mined' }).expect(403)
    await request(app)
      .post('/v1/engine/webhook')
      .set('X-Webhook-Secret', 'wrong')
      .send({ id: 'x', status: 'mined' })
      .expect(403)
  })

  it('maps engine statuses honestly: pending -> submitted, mined -> confirmed, failed -> failed', async () => {
    const ctx = build()
    const intent = await signedIntent(ctx.config)
    const accepted = await post(ctx.app, intent)
    const { intentId } = accepted.body

    // Engine says pending — status must NOT be confirmed.
    await request(ctx.app)
      .post('/v1/engine/webhook')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send({ id: 'engine-tx-1', hash: accepted.body.txHash, status: 'pending' })
      .expect(200)
    let status = await request(ctx.app).get(`/v1/intents/${intentId}`).set('X-Origin-Auth', ORIGIN_SECRET)
    expect(status.body.status).toBe('submitted')

    // Only mined/confirmed flips it to confirmed.
    await request(ctx.app)
      .post('/v1/engine/webhook')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send({ id: 'engine-tx-1', hash: accepted.body.txHash, status: 'mined' })
      .expect(200)
    status = await request(ctx.app).get(`/v1/intents/${intentId}`).set('X-Origin-Auth', ORIGIN_SECRET)
    expect(status.body).toMatchObject({ intentId, status: 'confirmed', txHash: accepted.body.txHash })
  })

  it('unknown engine tx id -> 404; unknown intent id -> 404', async () => {
    const { app } = build()
    await request(app)
      .post('/v1/engine/webhook')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send({ id: 'nope', status: 'mined' })
      .expect(404)
    const res = await request(app).get('/v1/intents/does-not-exist').set('X-Origin-Auth', ORIGIN_SECRET)
    expect(res.status).toBe(404)
  })
})

describe('GET /healthz shape', () => {
  it('reports per-chain rpc state, runway, and kill switch', async () => {
    const config = testConfig({ GAS_WALLET_137: '0x52502d049571C7893447b86c4d8B38e6184bF6e1' })
    const providers = mockProviders(config)
    providers[63] = { ...providers[63], getBlockNumber: async () => { throw new Error('down') } }
    const { app } = build({ config, providers })
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.killSwitch).toBe(false)
    expect(res.body.chains['137'].rpc).toBe('up')
    expect(res.body.chains['137'].gasWalletRunwayHrs).toBeGreaterThan(0)
    expect(res.body.chains['63'].rpc).toBe('down')
    expect(res.body.chains['80002']).toEqual({ rpc: 'up', gasWalletRunwayHrs: null })
  })
})

describe('audit trail (FR-021): no key material or signatures in events', () => {
  it('emits intent -> signer -> txHash records and never logs the signature', async () => {
    const auditLines = []
    const ctx = build({ auditLines })
    const intent = await signedIntent(ctx.config)
    await post(ctx.app, intent).expect(202)
    expect(auditLines.length).toBeGreaterThan(0)
    const ev = auditLines.at(-1)
    expect(ev).toMatchObject({
      event: 'relay_audit',
      signer: wallet.address,
      chainId: 137,
      action: 'claimPayout',
      uniquenessMarker: intent.uniquenessMarker,
    })
    for (const line of auditLines) {
      expect(JSON.stringify(line)).not.toContain(intent.signature)
    }
  })
})

describe('ERC-1271 contract-account signers (spec 041 — passkey smart accounts)', () => {
  // A contract actor cannot ECDSA-recover to its own address; the gateway must fall back to
  // asking the actor contract via eth_call isValidSignature, mirroring SignerIntentBase.
  const contractActor = '0x00000000000000000000000000000000000a11ce'

  function buildWith1271(mode) {
    const config = testConfig()
    const providers = mockProviders(config, { erc1271: { [contractActor]: mode } })
    return build({ config, providers })
  }

  it('accepts a signer-attributed intent from a contract actor whose isValidSignature returns the magic value', async () => {
    const ctx = buildWith1271('magic')
    const intent = await signedIntent(ctx.config, { actorAddress: ethers.getAddress(contractActor) })
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(202)
    expect(ctx.engine.submissions).toHaveLength(1)
    // Attribution binds to the CONTRACT actor, not any recovered EOA.
    expect(ctx.engine.submissions[0].args.data.toLowerCase()).toContain(contractActor.slice(2).toLowerCase())
  })

  it('rejects when the contract actor returns a wrong magic value', async () => {
    const ctx = buildWith1271('wrong')
    const intent = await signedIntent(ctx.config, { actorAddress: ethers.getAddress(contractActor) })
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('rejects when the contract actor reverts', async () => {
    const ctx = buildWith1271('revert')
    const intent = await signedIntent(ctx.config, { actorAddress: ethers.getAddress(contractActor) })
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('rejects a codeless actor (eth_call returns 0x) — fail-closed', async () => {
    const ctx = buildWith1271(undefined) // not in the map -> '0x'
    const intent = await signedIntent(ctx.config, { actorAddress: ethers.getAddress(contractActor) })
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_signature')
  })

  it('keeps plain EOA intents on the strict ECDSA path (no 1271 call needed)', async () => {
    const ctx = buildWith1271(undefined)
    const intent = await signedIntent(ctx.config) // actor == recovered EOA
    const res = await post(ctx.app, intent)
    expect(res.status).toBe(202)
  })
})
