/**
 * HTTP transport hardening: where it binds, whose Origin it serves, and the one configuration it
 * refuses to boot with.
 *
 * Each of these covers a measured behaviour of the unhardened server, not a hypothetical:
 *   - `listen(port, cb)` with no host bound 0.0.0.0 (`LISTEN 0 511 *:18790 *:*`).
 *   - `POST /mcp` with `Content-Type: text/plain` and `Origin: https://evil.example` answered 200
 *     with a full tools listing. CORS never governed whether that request was SENT or EXECUTED —
 *     only whether the page could read the answer.
 *   - `FAIRWINS_API_TOKEN` + `--http` served every anonymous caller as one member.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  buildServer,
  parseArgs,
  resolveBindHost,
  isLoopbackHost,
  sharedTokenRefusal,
  main,
  ALL_INTERFACES,
  LOOPBACK_HOST,
} from '../src/server.js'
import { createHttpTransport, normalizeOrigin, originDecision } from '../src/transport/http.js'
import { parseMessage, toErrorResponse } from '../src/jsonrpc.js'
import { rpc, startStubGateway } from './helpers.js'

/** Start the real transport in front of the real handler, on an ephemeral loopback port. */
async function withHttp(run, { allowedOrigins = [] } = {}) {
  const gateway = await startStubGateway({ 'GET /v1/member/me': { body: { account: '0xabc' } } })
  const { handler } = buildServer({ env: { FAIRWINS_API_URL: gateway.url, FAIRWINS_API_TOKEN: 'fw1.env.token' } })
  const server = createHttpTransport({
    handle: handler.handle,
    parse: parseMessage,
    onParseError: (err) => toErrorResponse(null, err),
    allowedOrigins,
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

/**
 * A port nothing is listening on.
 *
 * `--http 0` is (correctly) refused by parseArgs — a server that silently listened on an arbitrary
 * port would be worse than one that would not start — so these tests cannot ask for an ephemeral
 * one the way the transport-level tests do. Binding zero, reading the number and releasing it is
 * the next best thing.
 */
async function freePort() {
  const { createServer } = await import('node:net')
  const probe = createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  return String(port)
}

/** A CORS-safelisted POST — no preflight, sent and executed. The exact shape that got through. */
function simplePost(base, message, origin) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', ...(origin === undefined ? {} : { origin }) },
    body: JSON.stringify(message),
  })
}

// ── Origin validation ─────────────────────────────────────────────────────────────────────────

test('a CORS-safelisted POST from a foreign origin is refused, not executed', async () => {
  await withHttp(async ({ base }) => {
    const res = await simplePost(base, rpc(1, 'tools/list'), 'https://evil.example')
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error.code, 'origin_not_allowed')
    // The refusal names the origin it disliked and how to allow one on purpose.
    assert.match(body.error.reason, /evil\.example/)
    assert.match(body.error.reason, /--allowed-origin/)
    // And it is a refusal, not a redacted answer: no tool listing leaked into it.
    assert.equal(body.result, undefined)
  })
})

test('a request with NO Origin header is served — curl, an agent runtime, an editor', async () => {
  await withHttp(async ({ base }) => {
    const res = await simplePost(base, rpc(1, 'tools/list'), undefined)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.result.tools.length > 0)
  })
})

test('loopback origins are always served, so browser-based MCP tooling still works', async () => {
  await withHttp(async ({ base }) => {
    for (const origin of ['http://localhost:6274', 'http://127.0.0.1:5173', 'https://127.0.0.1', 'http://[::1]:9000']) {
      const res = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify(rpc(1, 'ping')),
      })
      assert.equal(res.status, 200, `${origin} must be served`)
      await res.arrayBuffer()
    }
  })
})

test('an allow-listed origin is served, and only that one', async () => {
  await withHttp(
    async ({ base }) => {
      const ok = await simplePost(base, rpc(1, 'ping'), 'https://studio.example')
      assert.equal(ok.status, 200)
      // Default ports fold, so the same origin spelled with :443 is the same entry.
      const folded = await simplePost(base, rpc(2, 'ping'), 'https://studio.example:443')
      assert.equal(folded.status, 200)
      // A neighbour on the same site is a different origin and is not covered.
      const other = await simplePost(base, rpc(3, 'ping'), 'https://evil.studio.example')
      assert.equal(other.status, 403)
      const scheme = await simplePost(base, rpc(4, 'ping'), 'http://studio.example')
      assert.equal(scheme.status, 403)
    },
    { allowedOrigins: ['https://studio.example'] }
  )
})

test('Origin: null is a present origin that is not allow-listed, not an absent one', async () => {
  // What a sandboxed iframe and a file:// page send. Treating it as absence would hand exactly the
  // attacker-controlled case the free pass that exists for non-browser clients.
  await withHttp(async ({ base }) => {
    const res = await simplePost(base, rpc(1, 'ping'), 'null')
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error.code, 'origin_not_allowed')
  })
})

test('the origin gate runs before routing, so /healthz and unknown paths are covered too', async () => {
  await withHttp(async ({ base }) => {
    const health = await fetch(`${base}/healthz`, { headers: { origin: 'https://evil.example' } })
    assert.equal(health.status, 403)
    assert.equal((await health.json()).error.code, 'origin_not_allowed')

    // A rejected browser is not told which paths exist.
    const unknown = await fetch(`${base}/v1/anything`, { headers: { origin: 'https://evil.example' } })
    assert.equal(unknown.status, 403)
  })
})

test('a probe with no Origin still reaches /healthz — the gate does not break liveness', async () => {
  await withHttp(async ({ base }) => {
    const res = await fetch(`${base}/healthz`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok' })
  })
})

test('normalizeOrigin folds default ports and rejects everything that is not an http(s) origin', () => {
  assert.equal(normalizeOrigin('https://a.example:443'), 'https://a.example')
  assert.equal(normalizeOrigin('http://a.example:80'), 'http://a.example')
  assert.equal(normalizeOrigin('  https://a.example  '), 'https://a.example')
  assert.equal(normalizeOrigin('HTTPS://A.example'), 'https://a.example')
  for (const bad of [
    'null',
    'file:///etc/passwd',
    'https://a.example/path',
    'https://a.example?q=1',
    'javascript:alert(1)',
    // Two Origin headers arrive comma-joined; that is not an origin and must not parse as one.
    'https://a.example, https://b.example',
    '',
    '   ',
    42,
    undefined,
  ]) {
    assert.equal(normalizeOrigin(bad), null, `${String(bad)} must not normalize`)
  }
})

test('originDecision separates absence from a rejected value', () => {
  assert.deepEqual(originDecision(undefined), { allowed: true, origin: null })
  assert.deepEqual(originDecision(null), { allowed: true, origin: null })
  assert.deepEqual(originDecision('https://evil.example'), { allowed: false, origin: 'https://evil.example' })
  assert.deepEqual(originDecision('null'), { allowed: false, origin: null })
  assert.equal(originDecision('http://127.0.0.99:81').allowed, true)
  assert.equal(originDecision('https://a.example', new Set(['https://a.example'])).allowed, true)
})

// ── Bind address ──────────────────────────────────────────────────────────────────────────────

test('resolveBindHost: loopback by default, all interfaces on Cloud Run, --host always wins', () => {
  assert.deepEqual(resolveBindHost({ env: {} }), { host: LOOPBACK_HOST, reason: 'default' })
  assert.deepEqual(resolveBindHost({ env: { K_SERVICE: 'fairwins-mcp-server' } }), {
    host: ALL_INTERFACES,
    reason: 'cloud-run',
  })
  assert.deepEqual(resolveBindHost({ host: '0.0.0.0', env: {} }), { host: '0.0.0.0', reason: 'explicit' })
  // An operator who names an address has decided, even where the platform would have chosen for them.
  assert.deepEqual(resolveBindHost({ host: '10.0.0.4', env: { K_SERVICE: 'x' } }), {
    host: '10.0.0.4',
    reason: 'explicit',
  })
})

test('isLoopbackHost recognises every spelling --host might use', () => {
  for (const host of ['127.0.0.1', '127.0.0.53', 'localhost', '::1', '[::1]']) {
    assert.equal(isLoopbackHost(host), true, `${host} is loopback`)
  }
  for (const host of ['0.0.0.0', '::', '10.0.0.4', '128.0.0.1', '1.2.3.4']) {
    assert.equal(isLoopbackHost(host), false, `${host} is not loopback`)
  }
})

test('--http with no --host actually binds loopback, and nothing else can reach it', async () => {
  // The assertion the unhardened server failed: `listen(port, cb)` bound `*:port`.
  const { exitCode, server } = await main({
    argv: ['--http', await freePort()],
    env: { FAIRWINS_API_URL: 'https://relay.example' },
    stderr: { write: () => true },
  })
  assert.equal(exitCode, 0)
  try {
    const { address, port } = server.address()
    assert.equal(address, '127.0.0.1')

    // Loopback answers.
    const local = await fetch(`http://127.0.0.1:${port}/healthz`)
    assert.equal(local.status, 200)
    await local.arrayBuffer()

    // A second socket bound to the SAME port on a different loopback address proves the listener is
    // not on 0.0.0.0: with a wildcard bind this bind would fail with EADDRINUSE.
    const { createServer } = await import('node:http')
    const rival = createServer((_req, res) => res.end('rival'))
    const bound = new Promise((resolve, reject) => {
      rival.once('error', reject)
      rival.listen(port, '127.0.0.2', resolve)
    })
    await bound
    await new Promise((resolve) => rival.close(resolve))
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('--host binds where it is told, and says out loud that the port is now reachable', async () => {
  const lines = []
  const { exitCode, server } = await main({
    argv: ['--http', await freePort(), '--host', '0.0.0.0'],
    env: { FAIRWINS_API_URL: 'https://relay.example' },
    stderr: { write: (line) => lines.push(line) },
  })
  assert.equal(exitCode, 0)
  try {
    assert.equal(server.address().address, '0.0.0.0')
    const warning = lines.find((l) => l.includes('bound to 0.0.0.0'))
    assert.ok(warning, `expected an exposure warning, got:\n${lines.join('')}`)
    assert.match(warning, /reachable from outside this machine/)
    assert.match(warning, /not authentication/)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('K_SERVICE binds all interfaces without a --host, because Cloud Run cannot work otherwise', async () => {
  const { exitCode, server } = await main({
    argv: ['--http', await freePort()],
    env: { FAIRWINS_API_URL: 'https://relay.example', K_SERVICE: 'fairwins-mcp-server' },
    stderr: { write: () => true },
  })
  assert.equal(exitCode, 0)
  try {
    assert.equal(server.address().address, '0.0.0.0')
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

// ── Flag handling ─────────────────────────────────────────────────────────────────────────────

test('parseArgs reads the new options in both spellings', () => {
  assert.equal(parseArgs(['--http', '--host', '0.0.0.0']).host, '0.0.0.0')
  assert.equal(parseArgs(['--http', '--host=0.0.0.0']).host, '0.0.0.0')
  assert.equal(parseArgs(['--http', '--allow-shared-token']).allowSharedToken, true)
  assert.deepEqual(parseArgs(['--http', '--allowed-origin', 'https://a.example:443']).allowedOrigins, [
    'https://a.example',
  ])
  assert.deepEqual(
    parseArgs(['--http', '--allowed-origin=https://a.example', '--allowed-origin=https://b.example']).allowedOrigins,
    ['https://a.example', 'https://b.example']
  )
  // The container's CMD: `--http` must not swallow `--host` as its port.
  const containerCmd = parseArgs(['--http', '--host', '0.0.0.0'], { PORT: '8790' })
  assert.equal(containerCmd.port, 8790)
  assert.equal(containerCmd.host, '0.0.0.0')
})

test('FAIRWINS_MCP_ALLOWED_ORIGINS joins the command line, and a bad entry is named', () => {
  assert.deepEqual(parseArgs(['--http'], { FAIRWINS_MCP_ALLOWED_ORIGINS: 'https://a.example, https://b.example' }).allowedOrigins, [
    'https://a.example',
    'https://b.example',
  ])
  // Already named on the command line, so it is not listed twice.
  assert.deepEqual(
    parseArgs(['--http', '--allowed-origin=https://a.example'], { FAIRWINS_MCP_ALLOWED_ORIGINS: 'https://a.example' })
      .allowedOrigins,
    ['https://a.example']
  )
  assert.throws(() => parseArgs(['--http'], { FAIRWINS_MCP_ALLOWED_ORIGINS: 'evil' }), /not an http\(s\) origin/)
})

test('a wildcard origin is refused rather than accepted and quietly never matched', () => {
  assert.throws(() => parseArgs(['--http', '--allowed-origin', '*']), /does not accept "\*"/)
  assert.throws(() => parseArgs(['--http', '--allowed-origin=nonsense']), /needs an http\(s\) origin/)
  assert.throws(() => parseArgs(['--http', '--host']), /--host needs a value/)
})

test('an http-only option without --http is an error, not a silent no-op', () => {
  // Somebody passing --host believes they configured a bind address. Swallowing it would leave them
  // certain of something untrue.
  assert.throws(() => parseArgs(['--host', '0.0.0.0']), /only applies with --http/)
  assert.throws(() => parseArgs(['--allowed-origin=https://a.example']), /only applies with --http/)
  assert.throws(() => parseArgs(['--allow-shared-token']), /only applies with --http/)
  // --help still prints help rather than erroring on the way there.
  assert.equal(parseArgs(['--help', '--host', '0.0.0.0']).help, true)
})

// ── The shared-identity token ─────────────────────────────────────────────────────────────────

test('--http with FAIRWINS_API_TOKEN refuses to start, and says exactly why', async () => {
  const lines = []
  const { exitCode, server } = await main({
    argv: ['--http', await freePort()],
    env: { FAIRWINS_API_URL: 'https://relay.example', FAIRWINS_API_TOKEN: 'fw1.env.token' },
    stderr: { write: (line) => lines.push(line) },
  })
  assert.equal(exitCode, 1)
  // Nothing was bound: a refusal that still listened would be a warning wearing an exit code.
  assert.equal(server, undefined)
  const text = lines.join('')
  assert.match(text, /REFUSING TO START/)
  assert.match(text, /every caller who can reach this port acts as that one member/)
  assert.match(text, /--allow-shared-token/)
})

test('--allow-shared-token starts, and keeps saying what was accepted', async () => {
  const lines = []
  const { exitCode, server } = await main({
    argv: ['--http', await freePort(), '--allow-shared-token'],
    env: { FAIRWINS_API_URL: 'https://relay.example', FAIRWINS_API_TOKEN: 'fw1.env.token' },
    stderr: { write: (line) => lines.push(line) },
  })
  assert.equal(exitCode, 0)
  try {
    assert.ok(server)
    const notice = lines.find((l) => l.includes('--allow-shared-token'))
    assert.ok(notice, `expected a shared-identity notice, got:\n${lines.join('')}`)
    assert.match(notice, /Everyone who can reach this port shares that identity/)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('stdio with FAIRWINS_API_TOKEN is untouched — one caller by construction', async () => {
  // The refusal is about the population of callers, not about the variable. Breaking the documented
  // stdio configuration would be fixing the wrong thing.
  const { PassThrough } = await import('node:stream')
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const lines = []
  const running = main({
    argv: [],
    env: { FAIRWINS_API_URL: 'https://relay.example', FAIRWINS_API_TOKEN: 'fw1.env.token' },
    stdin,
    stdout,
    stderr: { write: (line) => lines.push(line) },
  })
  stdin.write(`${JSON.stringify(rpc(1, 'ping'))}\n`)
  const [chunk] = await once(stdout, 'data')
  assert.equal(JSON.parse(chunk.toString('utf8')).id, 1)
  stdin.end()
  assert.equal((await running).exitCode, 0)
  assert.ok(!lines.join('').includes('REFUSING TO START'))
})

test('sharedTokenRefusal fires only for the combination that is actually dangerous', () => {
  const withToken = buildServer({ env: { FAIRWINS_API_URL: 'https://relay.example', FAIRWINS_API_TOKEN: 'fw1.a.b' } }).api
  const without = buildServer({ env: { FAIRWINS_API_URL: 'https://relay.example' } }).api

  assert.ok(sharedTokenRefusal({ mode: 'http', allowSharedToken: false, api: withToken }))
  assert.equal(sharedTokenRefusal({ mode: 'http', allowSharedToken: true, api: withToken }), null)
  assert.equal(sharedTokenRefusal({ mode: 'http', allowSharedToken: false, api: without }), null)
  assert.equal(sharedTokenRefusal({ mode: 'stdio', allowSharedToken: false, api: withToken }), null)
})
