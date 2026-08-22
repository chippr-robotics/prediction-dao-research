/** The HTTP transport: healthz, /mcp, the per-request bearer override, and what is refused (spec 095). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildServer } from '../src/server.js'
import { createHttpTransport, bearerFrom } from '../src/transport/http.js'
import { parseMessage, toErrorResponse } from '../src/jsonrpc.js'
import { postMcp, rpc, startStubGateway } from './helpers.js'

const TOKEN = 'fw1.env.token'

/** Start the real transport in front of the real handler, on an ephemeral port. */
async function withHttp(routes, run, env = {}) {
  const gateway = await startStubGateway(routes)
  const { handler } = buildServer({
    env: { FAIRWINS_API_URL: gateway.url, FAIRWINS_API_TOKEN: TOKEN, ...env },
  })
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

test('GET /healthz answers { status: "ok" }', async () => {
  await withHttp({}, async ({ base }) => {
    const res = await fetch(`${base}/healthz`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok' })
  })
})

test('POST /mcp carries one JSON-RPC message and returns its answer', async () => {
  await withHttp({}, async ({ base }) => {
    const { status, body } = await postMcp(base, rpc(1, 'initialize', { protocolVersion: '2025-06-18' }))
    assert.equal(status, 200)
    assert.equal(body.id, 1)
    assert.equal(body.result.serverInfo.name, 'fairwins-mcp')
  })
})

test('a per-request Authorization header overrides the env token, for that request only', async () => {
  await withHttp({ 'GET /v1/member/me': { body: { account: '0xabc' } } }, async ({ base, gateway }) => {
    await postMcp(base, rpc(1, 'tools/call', { name: 'get_profile', arguments: {} }), {
      authorization: 'Bearer fw1.caller.token',
    })
    assert.equal(gateway.requests[0].headers.authorization, 'Bearer fw1.caller.token')

    await postMcp(base, rpc(2, 'tools/call', { name: 'get_profile', arguments: {} }))
    assert.equal(gateway.requests[1].headers.authorization, `Bearer ${TOKEN}`)
  })
})

test('a notification is answered with 202 and no body', async () => {
  await withHttp({}, async ({ base }) => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    assert.equal(res.status, 202)
    assert.equal(await res.text(), '')
  })
})

test('malformed JSON comes back as a JSON-RPC parse error addressed to null, not an HTTP 400', async () => {
  await withHttp({}, async ({ base }) => {
    const { status, body } = await postMcp(base, '{ not json')
    assert.equal(status, 200)
    assert.equal(body.id, null)
    assert.equal(body.error.code, -32700)
  })
})

test('an oversized body is refused with 413 and the nested error shape', async () => {
  await withHttp({}, async ({ base }) => {
    const huge = JSON.stringify(rpc(1, 'tools/call', { name: 'build_intent', arguments: { blob: 'x'.repeat(400_000) } }))
    const { status, body } = await postMcp(base, huge)
    assert.equal(status, 413)
    assert.equal(body.error.code, 'too_large')
  })
})

test('unknown paths 404 and a GET on /mcp is 405 — both with a machine-readable code', async () => {
  await withHttp({}, async ({ base }) => {
    const missing = await fetch(`${base}/v1/anything`)
    assert.equal(missing.status, 404)
    assert.equal((await missing.json()).error.code, 'not_found')

    const wrongMethod = await fetch(`${base}/mcp`)
    assert.equal(wrongMethod.status, 405)
    assert.equal((await wrongMethod.json()).error.code, 'method_not_allowed')
  })
})

test('no CORS header is ever sent — agents are not browsers, and a wildcard here would be scriptable', async () => {
  await withHttp({}, async ({ base }) => {
    const health = await fetch(`${base}/healthz`, { headers: { origin: 'https://evil.example' } })
    assert.equal(health.headers.get('access-control-allow-origin'), null)

    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(rpc(1, 'ping')),
    })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    assert.equal(res.headers.get('access-control-allow-credentials'), null)
    // And a preflight is not answered into existence either.
    const preflight = await fetch(`${base}/mcp`, { method: 'OPTIONS' })
    assert.equal(preflight.status, 405)
    assert.equal(preflight.headers.get('access-control-allow-methods'), null)
  })
})

test('bearerFrom reads the header case-insensitively and treats a malformed one as absent', () => {
  assert.equal(bearerFrom({ authorization: 'Bearer abc' }), 'abc')
  assert.equal(bearerFrom({ authorization: 'bearer   abc  ' }), 'abc')
  assert.equal(bearerFrom({ authorization: 'Basic abc' }), null)
  assert.equal(bearerFrom({}), null)
  assert.equal(bearerFrom({ authorization: 'Bearer' }), null)
})
