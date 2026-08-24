/**
 * x402 pay-per-request tests (spec 096).
 *
 * Same build-the-app-with-injected-deps pattern as memberApi.test.js: real `loadConfig` against the
 * real deployments/ records, mocked providers and engine, every request carrying X-Origin-Auth.
 *
 * PAYMENTS ARE SIGNED FOR REAL. Every X-PAYMENT header below is an `ethers.Wallet` signature over
 * `TRANSFER_WITH_AUTHORIZATION_TYPES` from `@fairwins/intent-types`, under the token domain the
 * gateway's own chain config declares — the same two sources the spec-035 intent pipeline uses. A
 * hand-rolled fixture would only prove the gateway agrees with this file; this proves it agrees
 * with what a real x402 client produces.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from '@fairwins/intent-types'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import { loadConfig } from '../src/config/index.js'
import { encodeSettlement } from '../src/x402/settle.js'
import { DEPLOYMENTS_DIR, ORIGIN_SECRET, TEST_NOW, mockEngine, testConfig, wallet } from './helpers.js'
import { GET_MEMBERSHIP_SELECTOR, MEMBER_API_ENV, memberToken } from './memberApiHelpers.js'

const abi = ethers.AbiCoder.defaultAbiCoder()

/** The treasury the test gateway is configured to be paid at. Never defaulted in the product. */
const TREASURY = '0x' + 'ac'.repeat(20)
const BALANCE_OF_SELECTOR = '0x70a08231'

const X402_ENV = {
  ...MEMBER_API_ENV,
  X402_ENABLED: 'true',
  X402_CHAIN_ID: '137',
  X402_PAY_TO: TREASURY,
}

/** Prices this suite asserts against — the shipped defaults, restated so a change is visible here. */
const PRICE_READ = 10_000n
const PRICE_BUILD = 50_000n
const PRICE_ASSISTANT = 100_000n

/**
 * A provider that answers the four calls this rail makes, routed BY SELECTOR so each can fail
 * independently — `balanceOf` returning a number and `isAllowed` returning a bool are different
 * facts, and a test that cannot provoke one without the other proves nothing about either.
 */
function x402Provider({
  balance = 1_000_000n,
  balanceError = false,
  allowed = true,
  screenError = false,
  tier = 3,
  membershipError = false,
} = {}) {
  return {
    async call(tx) {
      const data = String(tx?.data ?? '')
      if (data.startsWith(BALANCE_OF_SELECTOR)) {
        if (balanceError) throw new Error('rpc unreachable')
        return abi.encode(['uint256'], [balance])
      }
      if (data.startsWith(GET_MEMBERSHIP_SELECTOR)) {
        if (membershipError) throw new Error('rpc unreachable')
        return abi.encode(['tuple(uint8,uint64,uint32,uint32,uint64)'], [[tier, TEST_NOW + 30 * 86_400, 0, 0, 0]])
      }
      if (data.startsWith('0x1626ba7e')) return '0x'
      if (screenError) throw new Error('rpc unreachable')
      return abi.encode(['bool'], [allowed])
    },
    async estimateGas() {
      return 100_000n
    },
    async getFeeData() {
      return { gasPrice: 30_000_000_000n, maxFeePerGas: 30_000_000_000n }
    },
    async getBlockNumber() {
      return 1
    },
    async getBalance() {
      return 10n ** 18n
    },
  }
}

function build({ env = {}, providerOpts = {}, engineClient, killSwitch = createKillSwitch(false), auditLines = [] } = {}) {
  const config = testConfig({ ...X402_ENV, ...env })
  config.feeRouter = { ...config.feeRouter, address: null }
  const provider = x402Provider(providerOpts)
  const providers = Object.fromEntries(config.enabledChainIds.map((id) => [id, provider]))
  const engine = engineClient ?? mockEngine()
  const { app } = createApp(config, {
    providers,
    engineClient: engine,
    now: () => TEST_NOW,
    killSwitch,
    auditSink: (line) => auditLines.push(line),
    memberApiFetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { wagers: [] } }) }),
  })
  return { app, config, engine, auditLines }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)
const post = (app, path) => request(app).post(path).set('X-Origin-Auth', ORIGIN_SECRET)

const b64 = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
const decodeReceipt = (res) => JSON.parse(Buffer.from(res.headers['x-payment-response'], 'base64').toString('utf8'))

let nonceCounter = 0
const freshNonce = () => ethers.zeroPadValue(ethers.toBeHex(++nonceCounter + 0x1000), 32)

/**
 * Sign a real EIP-3009 `TransferWithAuthorization` and encode the X-PAYMENT header.
 *
 * `accepted` defaults to the offer this gateway makes, so a test only states the ONE thing it is
 * changing — which is what makes each verification-failure case readable as the single fact it is.
 */
async function payment(config, {
  signer = wallet,
  from,
  to = TREASURY,
  value = PRICE_READ,
  validAfter = 0n,
  validBefore = BigInt(TEST_NOW + 3600),
  nonce = freshNonce(),
  chainId = 137,
  accepted,
  signature,
  x402Version = 2,
  payloadOverrides = {},
} = {}) {
  const chain = config.chains[chainId]
  const domain = {
    name: chain.tokenDomain.name,
    version: chain.tokenDomain.version,
    chainId,
    verifyingContract: chain.paymentToken,
  }
  const authorization = { from: from ?? signer.address, to, value, validAfter, validBefore, nonce }
  const sig = signature ?? (await signer.signTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES, authorization))
  return {
    header: b64({
      x402Version,
      accepted: accepted ?? {
        scheme: 'exact',
        network: `eip155:${chainId}`,
        amount: String(value),
        asset: chain.paymentToken,
        payTo: to,
      },
      payload: {
        signature: sig,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: String(authorization.value),
          validAfter: String(authorization.validAfter),
          validBefore: String(authorization.validBefore),
          nonce: authorization.nonce,
        },
        ...payloadOverrides,
      },
    }),
    authorization,
    signature: sig,
  }
}

// ---- module gating ------------------------------------------------------------------------------

describe('x402 module gating', () => {
  it('never answers 402 when the rail is disabled — the 401 is byte-identical to before spec 096', async () => {
    const { app } = build({ env: { X402_ENABLED: 'false' } })
    const res = await get(app, '/v1/member/fees')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('invalid_token')
    expect(res.headers['x-payment-response']).toBeUndefined()
  })

  it('stops OFFERING under the module killswitch, and answers 401 instead of 402', async () => {
    const { app } = build({ env: { X402_KILLSWITCH: 'true' } })
    const res = await get(app, '/v1/member/fees')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('invalid_token')
  })

  it('stops offering under the GLOBAL killswitch — but the member-API 503 comes first', async () => {
    const { app } = build({ killSwitch: createKillSwitch(true) })
    const res = await get(app, '/v1/member/fees')
    // Module liveness is decided before anything about payment: a killed gateway is not a priced one.
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('killswitch_active')
  })

  it('an op class priced at 0 is NOT OFFERED — that route 401s and never 402s', async () => {
    const { app } = build({ env: { X402_PRICE_READ: '0' } })
    const read = await get(app, '/v1/member/fees')
    expect(read.status).toBe(401)
    // …while a class that IS priced still offers, so this proves the zero is per-class.
    const built = await post(app, '/v1/member/intents/build').send({ action: 'claimPayout', chainId: 137 })
    expect(built.status).toBe(402)
  })

  it('never prices the OpenAPI document, revocation, or the token-introspection routes', async () => {
    const { app } = build()
    // Free: a client must read the specification before it can decide to pay for anything.
    expect((await get(app, '/v1/member/openapi.json')).status).toBe(200)
    // 401, never 402 — pricing these would mean inventing an identity for a caller who presented none.
    for (const path of ['/v1/member/me', '/v1/member/keys/status?keyId=0x' + '11'.repeat(32), '/v1/member/membership']) {
      const res = await get(app, path)
      expect(res.status, path).toBe(401)
    }
    // Revocation stays self-authorizing and unpriced: a price between a member and the withdrawal of
    // a leaked key would be the worst place on this API to put one.
    const rev = await post(app, '/v1/member/keys/revoke').send({})
    expect(rev.status).toBe(400)
  })
})

// ---- the 402 offer ------------------------------------------------------------------------------

describe('the 402 offer', () => {
  it('answers a priced op with a complete, machine-readable PaymentRequirements body', async () => {
    const { app, config } = build()
    const res = await get(app, '/v1/member/fees')
    expect(res.status).toBe(402)
    expect(res.body.x402Version).toBe(2)
    expect(res.body.error).toBe('payment_required')
    expect(res.body.errorReason).toBeTruthy()
    expect(res.body.resource).toMatchObject({ mimeType: 'application/json' })
    expect(res.body.resource.url).toContain('/v1/member/fees')
    expect(res.body.accepts).toHaveLength(1)
    expect(res.body.accepts[0]).toEqual({
      scheme: 'exact',
      network: 'eip155:137',
      amount: String(PRICE_READ),
      asset: config.chains[137].paymentToken,
      payTo: TREASURY,
      maxTimeoutSeconds: 300,
      extra: {
        assetTransferMethod: 'eip3009',
        // The TOKEN's own domain, from the same chain config the intent pipeline recovers
        // EIP-3009 signatures against — never a second table (issue #1038).
        name: config.chains[137].tokenDomain.name,
        version: config.chains[137].tokenDomain.version,
      },
    })
  })

  it('prices each op class separately', async () => {
    const { app } = build()
    const read = await get(app, '/v1/member/fees')
    const built = await post(app, '/v1/member/intents/build').send({ action: 'claimPayout', chainId: 137 })
    const chat = await post(app, '/v1/member/assistant/chat').send({ messages: [{ role: 'user', content: 'hi' }] })
    expect(read.body.accepts[0].amount).toBe(String(PRICE_READ))
    expect(built.body.accepts[0].amount).toBe(String(PRICE_BUILD))
    expect(chat.body.accepts[0].amount).toBe(String(PRICE_ASSISTANT))
  })

  it('keeps the AUTH diagnostic as the 402’s error when a token was presented but did not admit', async () => {
    const { app } = build()
    const expired = await memberToken({ issuedAt: TEST_NOW - 7200, expiresAt: TEST_NOW - 60 })
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${expired}`)
    expect(res.status).toBe(402)
    // The agent learns WHY its key failed as well as what it could pay instead.
    expect(res.body.error).toBe('token_expired')
    expect(res.body.accepts[0].amount).toBe(String(PRICE_READ))
  })

  it('offers payment to a member with a valid key but NO membership — that substitution is the point', async () => {
    const { app } = build({ providerOpts: { tier: 0 } })
    const token = await memberToken()
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(402)
    expect(res.body.error).toBe('membership_required')
  })

  it('never offers payment in place of a 503 — an outage of ours is not something to sell', async () => {
    const { app } = build({ providerOpts: { membershipError: true } })
    const token = await memberToken()
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('membership_unreadable')
  })

  it('never offers payment in place of a sanctions refusal', async () => {
    const { app } = build({ providerOpts: { allowed: false } })
    const token = await memberToken()
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('sanctioned_signer')
  })

  it('never offers payment in place of insufficient_scope — a wider key is free', async () => {
    const { app } = build()
    const token = await memberToken({ scopes: ['read:profile'] })
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('insufficient_scope')
  })
})

// ---- members are never charged -------------------------------------------------------------------

describe('a working member token is never charged', () => {
  it('serves the op on the bearer path, settles nothing, and sets no payment header', async () => {
    const { app, engine } = build()
    const token = await memberToken()
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['x-payment-response']).toBeUndefined()
    expect(engine.submissions).toHaveLength(0)
  })

  it('ignores an X-PAYMENT header entirely when the token works — no double charge is possible', async () => {
    const { app, config, engine } = build()
    const token = await memberToken()
    const { header } = await payment(config)
    const res = await get(app, '/v1/member/fees').set('Authorization', `Bearer ${token}`).set('X-PAYMENT', header)
    expect(res.status).toBe(200)
    expect(engine.submissions).toHaveLength(0)
    expect(res.headers['x-payment-response']).toBeUndefined()
  })
})

// ---- verification: every failure has its own code, and none of them settles ----------------------

describe('payment verification', () => {
  /** Every case here must leave the engine untouched: verification strictly precedes settlement. */
  async function refuse(overrides, { providerOpts } = {}) {
    const { app, config, engine } = build({ providerOpts })
    const { header } = await payment(config, overrides)
    const res = await get(app, '/v1/member/fees').set('X-PAYMENT', header)
    return { res, engine }
  }

  it('refuses a header that is not base64 JSON', async () => {
    const { app, engine } = build()
    const res = await get(app, '/v1/member/fees').set('X-PAYMENT', 'not-base64-json!!')
    expect(res.status).toBe(402)
    expect(res.body.error).toBe('payment_malformed')
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses an unsupported x402 version', async () => {
    const { res, engine } = await refuse({ x402Version: 1 })
    expect(res.status).toBe(402)
    expect(res.body.error).toBe('payment_version_unsupported')
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses a payload whose authorization is malformed', async () => {
    const { app, config, engine } = build()
    const { header } = await payment(config)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    decoded.payload.authorization.value = 'not-a-number'
    const res = await get(app, '/v1/member/fees').set('X-PAYMENT', b64(decoded))
    expect(res.status).toBe(402)
    expect(res.body.error).toBe('payment_malformed')
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses another scheme, network or asset', async () => {
    const scheme = await refuse({ accepted: { scheme: 'upto' } })
    expect(scheme.res.body.error).toBe('payment_scheme_unsupported')
    const network = await refuse({ accepted: { network: 'eip155:1' } })
    expect(network.res.body.error).toBe('payment_network_mismatch')
    const asset = await refuse({ accepted: { asset: '0x' + '99'.repeat(20) } })
    expect(asset.res.body.error).toBe('payment_asset_mismatch')
  })

  it('refuses an authorization paying anyone but the treasury', async () => {
    const { res, engine } = await refuse({ to: '0x' + '77'.repeat(20) })
    expect(res.body.error).toBe('payment_recipient_mismatch')
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses an under-payment, and states the price', async () => {
    const { res } = await refuse({ value: PRICE_READ - 1n })
    expect(res.body.error).toBe('payment_insufficient')
    expect(res.body.errorReason).toContain(String(PRICE_READ))
    // The offer comes back with it, so an agent can re-sign without a second round trip.
    expect(res.body.accepts[0].amount).toBe(String(PRICE_READ))
  })

  it('refuses an authorization that is not yet valid', async () => {
    const { res } = await refuse({ validAfter: BigInt(TEST_NOW + 600) })
    expect(res.body.error).toBe('payment_not_yet_valid')
  })

  it('refuses one that expires inside the settle buffer — it would be accepted here and revert at the token', async () => {
    const { res, engine } = await refuse({ validBefore: BigInt(TEST_NOW + 30) })
    expect(res.body.error).toBe('payment_expired')
    expect(res.body.errorReason).toContain('60')
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses a signature that does not recover to authorization.from, and says EOA-only', async () => {
    const other = ethers.Wallet.createRandom()
    const { res, engine } = await refuse({ signer: other, from: wallet.address })
    expect(res.body.error).toBe('payment_signature_invalid')
    expect(res.body.errorReason).toMatch(/EOA/)
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses a payer whose balance is below the price', async () => {
    const { res, engine } = await refuse({}, { providerOpts: { balance: 1n } })
    expect(res.body.error).toBe('payment_insufficient_balance')
    expect(engine.submissions).toHaveLength(0)
  })

  it('refuses an overpaying authorization the payer cannot cover — the paywall bypass', async () => {
    // The bypass this guards: sign a huge `value` while holding only the price. Step 3 passes
    // (value >= amount), and a balance check against the PRICE passes too — so verification
    // succeeded, the engine broadcast, the answer was SERVED, and the token then reverted for
    // insufficient balance. Free answer, and FairWins paid gas for a reverting transaction.
    // Repeatable at the per-account quota with fresh nonces. The balance must be checked against
    // what was SIGNED, because that is what settle.js transfers.
    const { res, engine } = await refuse(
      { value: PRICE_READ * 1_000_000n },
      { providerOpts: { balance: PRICE_READ } } // exactly the price — enough to pass the old check
    )
    expect(res.body.error).toBe('payment_insufficient_balance')
    expect(engine.submissions).toHaveLength(0)
  })

  it('reports the SETTLED value in the receipt, not the quoted price', async () => {
    // An agent may authorize more than the offer. settle.js moves `authorization.value`, so a
    // receipt naming `requirement.amount` would understate what actually left the payer's wallet.
    const overpay = PRICE_READ * 3n
    const { app, config, engine } = build({ providerOpts: { balance: overpay * 2n } })
    const { header } = await payment(config, { value: overpay })
    const res = await get(app, '/v1/member/fees').set('X-PAYMENT', header)
    expect(res.status).toBe(200)
    expect(decodeReceipt(res).amount).toBe(String(overpay))
    expect(engine.submissions).toHaveLength(1)
  })

  it('answers 503 — never a free serve — when the balance cannot be read at all', async () => {
    const { res, engine } = await refuse({}, { providerOpts: { balanceError: true } })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('settlement_unavailable')
    expect(res.body.error.reason).toMatch(/nothing was charged/i)
    expect(engine.submissions).toHaveLength(0)
  })

  it('screens the PAYER fail-closed: 403 sanctioned, 503 unscreenable, nothing settled either way', async () => {
    const sanctioned = await refuse({}, { providerOpts: { allowed: false } })
    expect(sanctioned.res.status).toBe(403)
    expect(sanctioned.res.body.error.code).toBe('sanctioned_signer')
    expect(sanctioned.engine.submissions).toHaveLength(0)

    const unscreenable = await refuse({}, { providerOpts: { screenError: true } })
    expect(unscreenable.res.status).toBe(503)
    expect(unscreenable.res.body.error.code).toBe('screening_unavailable')
    expect(unscreenable.engine.submissions).toHaveLength(0)
  })
})

// ---- settlement ---------------------------------------------------------------------------------

describe('settlement', () => {
  it('verifies, settles through the existing engine, then serves the op with X-PAYMENT-RESPONSE', async () => {
    const { app, config, engine } = build()
    const paid = await payment(config)
    const res = await get(app, '/v1/member/fees').set('X-PAYMENT', paid.header)

    expect(res.status).toBe(200)
    expect(res.body.services).toBeTruthy()

    // ONE submission, on the chain's own lane, to the TOKEN — the same engine the intent rail uses.
    expect(engine.submissions).toHaveLength(1)
    const { args } = engine.submissions[0]
    expect(args.to).toBe(config.chains[137].paymentToken)
    expect(args.relayerId).toBe(config.chains[137].engineRelayerId)
    // The calldata is exactly transferWithAuthorization over what the payer signed — not
    // receiveWithAuthorization, which would require msg.sender == the treasury.
    expect(args.data).toBe(encodeSettlement(paid.authorization, paid.signature))
    expect(args.data.startsWith(ethers.id('transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)').slice(0, 10))).toBe(true)

    const receipt = decodeReceipt(res)
    expect(receipt).toMatchObject({
      success: true,
      network: 'eip155:137',
      payer: wallet.address,
      amount: String(PRICE_READ),
      // Acceptance is BROADCAST, said out loud rather than implied by `success: true`.
      settlement: 'broadcast',
    })
    expect(receipt.transaction).toBe(engine.submissions[0].tx.hash)
  })

  it('serves the BUILD op as the payer — the actor is forced to the paying address', async () => {
    const { app, config } = build()
    const { header } = await payment(config, { value: PRICE_BUILD })
    const res = await post(app, '/v1/member/intents/build')
      .set('X-PAYMENT', header)
      .send({ action: 'claimPayout', chainId: 137, params: { wagerId: 7, claimant: '0x' + '09'.repeat(20) } })
    expect(res.status).toBe(200)
    // Custody-free as ever: an "on behalf of" address has no code path, paid rail included.
    expect(res.body.typedData.message.claimant).toBe(wallet.address)
  })

  it('answers 503 settlement_unavailable and serves NOTHING when the engine is down', async () => {
    const { app, config } = build({ engineClient: mockEngine({ fail: true }) })
    const { header } = await payment(config)
    const res = await get(app, '/v1/member/fees').set('X-PAYMENT', header)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('settlement_unavailable')
    expect(res.body.error.reason).toMatch(/nothing was charged/i)
    // No fee body leaked out alongside the error, and no receipt was invented.
    expect(res.body.services).toBeUndefined()
    expect(res.headers['x-payment-response']).toBeUndefined()
  })

  it('lets an authorization refused at settlement be retried — the nonce claim is released', async () => {
    // First attempt against a dead engine, then the same authorization against a live one.
    const config = testConfig(X402_ENV)
    const paid = await payment(config)
    const down = build({ engineClient: mockEngine({ fail: true }) })
    expect((await get(down.app, '/v1/member/fees').set('X-PAYMENT', paid.header)).status).toBe(503)

    const up = build()
    const res = await get(up.app, '/v1/member/fees').set('X-PAYMENT', paid.header)
    expect(res.status).toBe(200)
    expect(up.engine.submissions).toHaveLength(1)
  })

  it('refuses a replayed nonce in-process, and settles it only once', async () => {
    const { app, config, engine } = build()
    const { header } = await payment(config)
    const first = await get(app, '/v1/member/fees').set('X-PAYMENT', header)
    expect(first.status).toBe(200)

    const second = await get(app, '/v1/member/fees').set('X-PAYMENT', header)
    expect(second.status).toBe(402)
    expect(second.body.error).toBe('payment_replayed')
    // The point of the in-process set is that the replay costs no gas to discover; the TOKEN's own
    // authorization state is what actually prevents a double spend.
    expect(engine.submissions).toHaveLength(1)
  })
})

// ---- audit ----------------------------------------------------------------------------------------

describe('audit', () => {
  it('records the settlement without the signature or the nonce — the payment instrument never lands in a log', async () => {
    const auditLines = []
    const { app, config } = build({ auditLines })
    const paid = await payment(config)
    await get(app, '/v1/member/fees').set('X-PAYMENT', paid.header)

    const settled = auditLines.map((l) => JSON.parse(l)).find((e) => e.action === 'x402_payment_settled')
    expect(settled).toMatchObject({
      op: 'fees',
      opClass: 'read',
      payer: wallet.address,
      amount: String(PRICE_READ),
      network: 'eip155:137',
      outcome: 'settled',
    })
    const joined = auditLines.join('\n')
    expect(joined).not.toContain(paid.signature)
    expect(joined).not.toContain(paid.authorization.nonce)
    expect(joined).not.toContain(paid.header)
  })

  it('records a refusal without leaking what was presented', async () => {
    const auditLines = []
    const { app, config } = build({ auditLines })
    const paid = await payment(config, { value: PRICE_READ - 1n })
    await get(app, '/v1/member/fees').set('X-PAYMENT', paid.header)
    const refused = auditLines.map((l) => JSON.parse(l)).find((e) => e.action === 'x402_payment_refused')
    expect(refused).toMatchObject({ op: 'fees', code: 'payment_insufficient', outcome: 'refused' })
    expect(auditLines.join('\n')).not.toContain(paid.signature)
  })
})

// ---- boot validation ------------------------------------------------------------------------------

describe('boot validation (only inside if(enabled))', () => {
  const cfg = (env) => loadConfig({ ENABLED_CHAIN_IDS: '137,80002,63', ...env }, { deploymentsDir: DEPLOYMENTS_DIR })

  it('refuses to start with X402_ENABLED=true and no treasury — there is no default on purpose', () => {
    expect(() => cfg({ X402_ENABLED: 'true' })).toThrow(/X402_PAY_TO/)
  })

  it('refuses a malformed treasury address', () => {
    expect(() => cfg({ X402_ENABLED: 'true', X402_PAY_TO: 'not-an-address' })).toThrow(/not an address/)
  })

  it('refuses a chain that could never settle an EIP-3009 payment', () => {
    // 63 (Mordor) is enabled here, but its token is permit-only — no EIP-3009, nothing to settle with.
    expect(() => cfg({ X402_ENABLED: 'true', X402_PAY_TO: TREASURY, X402_CHAIN_ID: '63' })).toThrow(/EIP-3009/)
    expect(() => cfg({ X402_ENABLED: 'true', X402_PAY_TO: TREASURY, X402_CHAIN_ID: '1' })).toThrow(/not an enabled chain/)
  })

  it('refuses a module that is on with every price at 0', () => {
    expect(() =>
      cfg({ X402_ENABLED: 'true', X402_PAY_TO: TREASURY, X402_PRICE_READ: '0', X402_PRICE_BUILD: '0', X402_PRICE_ASSISTANT: '0' })
    ).toThrow(/every X402_PRICE_\* is 0/)
  })

  it('refuses an offer that promises less time than settlement demands', () => {
    expect(() =>
      cfg({ X402_ENABLED: 'true', X402_PAY_TO: TREASURY, X402_SETTLE_BUFFER_SECONDS: '600', X402_MAX_TIMEOUT_SECONDS: '300' })
    ).toThrow(/below X402_SETTLE_BUFFER_SECONDS/)
  })

  it('validates NOTHING while disabled — a bad x402 env cannot take down a gateway that does not use it', () => {
    const config = cfg({ X402_CHAIN_ID: '63', X402_PAY_TO: 'nonsense' })
    expect(config.x402.enabled).toBe(false)
    // …and it defaults to a chain that COULD settle, so turning it on later does not silently move
    // the rail onto a chain with no EIP-3009 token.
    expect(cfg({}).x402.chainId).toBe(137)
  })
})

// ---- /status + OpenAPI ----------------------------------------------------------------------------

describe('/status and the published specification', () => {
  it('publishes the public config only — never the treasury balance', async () => {
    const { app } = build()
    const res = await request(app).get('/status')
    expect(res.body.memberApi.x402).toEqual({
      enabled: true,
      killSwitch: false,
      network: 'eip155:137',
      priced: { read: String(PRICE_READ), build: String(PRICE_BUILD), assistant: String(PRICE_ASSISTANT) },
    })
    expect(JSON.stringify(res.body)).not.toMatch(/balance/i)
  })

  it('reports enabled:false under the x402 killswitch, and a class at 0 as NOT OFFERED rather than free', async () => {
    const killed = build({ env: { X402_KILLSWITCH: 'true' } })
    expect((await request(killed.app).get('/status')).body.memberApi.x402.enabled).toBe(false)
    const zeroed = build({ env: { X402_PRICE_ASSISTANT: '0' } })
    expect((await request(zeroed.app).get('/status')).body.memberApi.x402.priced.assistant).toBeNull()
  })

  it('documents the 402, the two headers and the x402 tag — on the priced ops only', async () => {
    const { app } = build()
    const doc = (await get(app, '/v1/member/openapi.json')).body

    expect(doc.tags.map((t) => t.name)).toContain('x402')
    for (const path of ['/v1/member/fees', '/v1/member/wagers']) {
      const op = doc.paths[path].get
      expect(op.responses['402'], path).toBeTruthy()
      expect(op.responses['200'].headers['X-PAYMENT-RESPONSE'], path).toBeTruthy()
      expect(op.parameters.some((p) => p.name === 'X-PAYMENT'), path).toBe(true)
    }
    // Unpriced routes must NOT advertise a 402 they can never answer.
    expect(doc.paths['/v1/member/me'].get.responses['402']).toBeUndefined()
    expect(doc.paths['/v1/member/openapi.json'].get.responses['402']).toBeUndefined()

    expect(doc.components.schemas.PaymentRequired).toBeTruthy()
    expect(doc.components.schemas.SettlementResponse.properties.settlement.const).toBe('broadcast')
    expect(doc.info.description).toContain('Paying per request')
  })

  it('publishes a document with NO trace of x402 when the rail is off', async () => {
    const { app } = build({ env: { X402_ENABLED: 'false' } })
    const doc = (await get(app, '/v1/member/openapi.json')).body
    expect(doc.tags.map((t) => t.name)).not.toContain('x402')
    expect(doc.components.schemas.PaymentRequired).toBeUndefined()
    expect(doc.components.schemas.ErrorBody.properties.error.properties.code.enum).not.toContain('settlement_unavailable')
    expect(JSON.stringify(doc)).not.toContain('X-PAYMENT')
    expect(doc.paths['/v1/member/fees'].get.responses['402']).toBeUndefined()
  })
})
