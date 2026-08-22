/**
 * x402 pay-per-request, as this server sees it (spec 096).
 *
 * Two behaviours are under test and neither of them is "pay":
 *
 *   1. A `402` answer is surfaced WHOLE — the offer an agent has to sign against, plus the sentence
 *      saying this process cannot sign it. The failure this guards against is the offer being
 *      flattened into "http_402", which leaves an agent holding a price it cannot read and reporting
 *      an outage about a resource that is available for a fraction of a cent.
 *   2. An inbound `X-PAYMENT` header is forwarded upstream unaltered, and the settlement receipt
 *      comes back to the caller as the gateway's own bytes.
 *
 * The stub gateway is a real `node:http` server, as everywhere else in this suite: the whole subject
 * here is HTTP — a status code, two headers and a body — and a stubbed `fetch` would let every one
 * of those be wrong while the suite stayed green.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildServer } from '../src/server.js'
import { createHttpTransport, paymentFrom } from '../src/transport/http.js'
import { parseMessage, toErrorResponse } from '../src/jsonrpc.js'
import { decodeSettlement } from '../src/api.js'
import { postMcp, rpc, startStubGateway } from './helpers.js'

const TOKEN = 'fw1.env.token'

/** The 402 body shape of x402 protocol v2, as the gateway writes it. */
const OFFER = {
  x402Version: 2,
  error: 'payment_required',
  resource: {
    url: 'https://relay.fairwins.app/v1/member/fees',
    description: 'Live platform fee rates',
    mimeType: 'application/json',
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:137',
      amount: '10000',
      asset: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      payTo: '0x00000000000000000000000000000000000dEaD1',
      maxTimeoutSeconds: 300,
      extra: { assetTransferMethod: 'eip3009', name: 'USD Coin', version: '2' },
    },
  ],
}

const SETTLEMENT = {
  success: true,
  transaction: `0x${'ab'.repeat(32)}`,
  transactionId: 'engine-sub-1',
  network: 'eip155:137',
  payer: '0x00000000000000000000000000000000000BEEF1',
  amount: '10000',
  // The gateway states this out loud, and so does everything downstream of it.
  settlement: 'broadcast',
}
const SETTLEMENT_HEADER = Buffer.from(JSON.stringify(SETTLEMENT), 'utf8').toString('base64')

const PAYMENT_HEADER = Buffer.from(
  JSON.stringify({ x402Version: 2, accepted: OFFER.accepts[0], payload: { signature: `0x${'11'.repeat(65)}` } }),
  'utf8'
).toString('base64')

const call = (handler, name, args = {}, ctx) => handler.handle(rpc(1, 'tools/call', { name, arguments: args }), ctx)
const textOf = (res) => res.result.content.map((c) => c.text).join('\n')

async function withGateway(routes, run, env = {}) {
  const gateway = await startStubGateway(routes)
  try {
    const { handler } = buildServer({
      env: { FAIRWINS_API_URL: gateway.url, FAIRWINS_API_TOKEN: TOKEN, ...env },
    })
    await run({ handler, gateway })
  } finally {
    await gateway.close()
  }
}

/** The real transport in front of the real handler, on an ephemeral port. */
async function withHttp(routes, run, env = {}) {
  const gateway = await startStubGateway(routes)
  const { handler } = buildServer({ env: { FAIRWINS_API_URL: gateway.url, ...env } })
  const server = createHttpTransport({
    handle: handler.handle,
    parse: parseMessage,
    onParseError: (err) => toErrorResponse(null, err),
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await run({ base, gateway })
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
    await gateway.close()
  }
}

test('a 402 hands the agent the whole offer, and says this server cannot pay it', async () => {
  await withGateway({ 'GET /v1/member/fees': { status: 402, body: OFFER } }, async ({ handler }) => {
    const res = await call(handler, 'get_fees')
    assert.equal(res.result.isError, true)

    const text = textOf(res)
    // Everything the agent must sign against survives verbatim — an amount or an address that were
    // paraphrased here would produce an authorization the gateway refuses.
    assert.match(text, /"amount": "10000"/)
    assert.match(text, /0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359/)
    assert.match(text, /0x00000000000000000000000000000000000dEaD1/)
    assert.match(text, /eip155:137/)
    assert.match(text, /"assetTransferMethod": "eip3009"/)
    assert.match(text, /"name": "USD Coin"/)
    assert.match(text, /"version": "2"/)

    // And the two facts that keep an agent from doing something wrong with it.
    assert.match(text, /THIS SERVER CANNOT PAY/)
    assert.match(text, /X-PAYMENT/)
    // A price is not an outage. It must not read like one.
    assert.doesNotMatch(text, /UNKNOWN, not an empty result/)
  })
})

test('a 402 that is not an x402 offer stays an ordinary error rather than an empty offer', async () => {
  // Some other proxy answering 402 with its own body must not be reported as "here is what to pay",
  // with nothing under it.
  const routes = {
    'GET /v1/member/me': { status: 402, body: { error: { code: 'payment_required', reason: 'upstream says pay' } } },
  }
  await withGateway(routes, async ({ handler }) => {
    const res = await call(handler, 'get_profile')
    assert.equal(res.result.isError, true)
    assert.match(textOf(res), /upstream says pay/)
    assert.doesNotMatch(textOf(res), /THIS SERVER CANNOT PAY/)
  })
})

test('the 402 surfacing does not need an HTTP context — stdio gets the same offer', async () => {
  await withGateway({ 'GET /v1/member/me': { status: 402, body: OFFER } }, async ({ handler }) => {
    // No ctx at all: this is the stdio path, where there is no per-call header to carry a payment.
    const res = await call(handler, 'get_profile')
    assert.equal(res.result.isError, true)
    assert.match(textOf(res), /THIS SERVER CANNOT PAY/)
  })
})

test('an X-PAYMENT header is forwarded upstream unaltered, and replaces the bearer for that call', async () => {
  const seen = []
  const routes = {
    'GET /v1/member/fees': ({ req }) => {
      seen.push({ payment: req.headers['x-payment'], auth: req.headers.authorization })
      return { body: { rates: { 'earn.lend': { bps: 25, source: 'chain' } } }, headers: { 'x-payment-response': SETTLEMENT_HEADER } }
    },
  }
  await withHttp(
    routes,
    async ({ base }) => {
      const { status, body, headers } = await postMcp(
        base,
        rpc(1, 'tools/call', { name: 'get_fees', arguments: {} }),
        { 'x-payment': PAYMENT_HEADER }
      )
      assert.equal(status, 200)
      assert.equal(body.result.isError, false)

      // Forwarded byte-for-byte. A re-encoded payload is a different signature payload.
      assert.equal(seen[0].payment, PAYMENT_HEADER)
      // The payment IS the credential on this call: the process token is not sent alongside it.
      assert.equal(seen[0].auth, undefined)

      // The receipt goes back to whoever paid, as the gateway's own bytes.
      assert.equal(headers.get('x-payment-response'), SETTLEMENT_HEADER)
      assert.deepEqual(decodeSettlement(headers.get('x-payment-response')), SETTLEMENT)

      // And the tool result says a payment was spent, honestly about what that means.
      const text = body.result.content.map((c) => c.text).join('\n')
      assert.match(text, /"earn.lend"/)
      assert.match(text, new RegExp(SETTLEMENT.transaction))
      assert.match(text, /BROADCAST, not confirmed/)
    },
    { FAIRWINS_API_TOKEN: TOKEN }
  )
})

test('a call with no payment sends no X-PAYMENT header and no receipt comes back', async () => {
  await withHttp(
    { 'GET /v1/member/fees': ({ req }) => ({ body: { rates: {}, sawPayment: 'x-payment' in req.headers } }) },
    async ({ base }) => {
      const { body, headers } = await postMcp(base, rpc(1, 'tools/call', { name: 'get_fees', arguments: {} }))
      assert.equal(body.result.isError, false)
      assert.match(body.result.content[0].text, /"sawPayment": false/)
      assert.equal(body.result.content.length, 1)
      assert.equal(headers.get('x-payment-response'), null)
    },
    { FAIRWINS_API_TOKEN: TOKEN }
  )
})

test('a payment that the gateway rejects comes back as the offer again, with the reason named', async () => {
  const routes = {
    'GET /v1/member/fees': {
      status: 402,
      body: { ...OFFER, error: 'payment_expired' },
    },
  }
  await withHttp(
    routes,
    async ({ base }) => {
      const { body } = await postMcp(base, rpc(1, 'tools/call', { name: 'get_fees', arguments: {} }), {
        'x-payment': PAYMENT_HEADER,
      })
      const text = body.result.content.map((c) => c.text).join('\n')
      assert.equal(body.result.isError, true)
      assert.match(text, /payment_expired/)
      // Nothing was served, so nothing may look like a receipt.
      assert.doesNotMatch(text, /BROADCAST/)
    },
    { FAIRWINS_API_TOKEN: TOKEN }
  )
})

test('a payment reaches a tool that needs no token, without inventing one', async () => {
  // The paid rail exists precisely for callers with no membership. `token_missing` must not be
  // raised locally in front of a request that carries its own payment.
  const routes = {
    'GET /v1/member/wagers': ({ req }) => ({ body: { chains: {}, sawPayment: Boolean(req.headers['x-payment']) } }),
  }
  await withHttp(routes, async ({ base }) => {
    const { body } = await postMcp(base, rpc(1, 'tools/call', { name: 'get_wagers', arguments: {} }), {
      'x-payment': PAYMENT_HEADER,
    })
    assert.equal(body.result.isError, false)
    assert.match(body.result.content[0].text, /"sawPayment": true/)
  })
})

test('with neither a token nor a payment, the refusal names the paid rail and where to price it', async () => {
  await withGateway({}, async ({ handler }) => {
    const res = await call(handler, 'get_fees')
    assert.equal(res.result.isError, true)
    const text = textOf(res)
    assert.match(text, /token_missing/)
    assert.match(text, /x402/)
    assert.match(text, /get_gateway_status/)
  }, { FAIRWINS_API_TOKEN: '' })
})

test('paymentFrom takes a header value as-is and treats a malformed one as absent', () => {
  assert.equal(paymentFrom({ 'x-payment': PAYMENT_HEADER }), PAYMENT_HEADER)
  assert.equal(paymentFrom({ 'x-payment': `  ${PAYMENT_HEADER}  ` }), PAYMENT_HEADER)
  assert.equal(paymentFrom({}), null)
  assert.equal(paymentFrom({ 'x-payment': '' }), null)
  assert.equal(paymentFrom({ 'x-payment': '   ' }), null)
  assert.equal(paymentFrom({ 'x-payment': 42 }), null)
  // A header value that never was one: dropped, not smuggled into the upstream request.
  assert.equal(paymentFrom({ 'x-payment': 'abc\ndef' }), null)
})

test('decodeSettlement reports an unreadable receipt as absent rather than throwing', () => {
  assert.deepEqual(decodeSettlement(SETTLEMENT_HEADER), SETTLEMENT)
  assert.equal(decodeSettlement('not base64 json'), null)
  assert.equal(decodeSettlement(''), null)
  assert.equal(decodeSettlement(null), null)
})
