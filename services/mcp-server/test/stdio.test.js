/** The stdio transport and the entrypoint's argument/env handling (spec 095). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { startStdioTransport } from '../src/transport/stdio.js'
import { parseMessage, toErrorResponse } from '../src/jsonrpc.js'
import { buildServer, parseArgs, configurationWarnings } from '../src/server.js'
import { rpc } from './helpers.js'

/** Drive the real transport over in-memory pipes and collect whatever reaches "stdout". */
async function runStdio(lines, { env = {} } = {}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const written = []
  stdout.on('data', (chunk) => written.push(chunk.toString('utf8')))

  const { handler } = buildServer({ env })
  const transport = startStdioTransport({
    handle: handler.handle,
    parse: parseMessage,
    onParseError: (err) => toErrorResponse(null, err),
    stdin,
    stdout,
    log: () => {},
  })

  for (const line of lines) stdin.write(line)
  stdin.end()
  await transport.done

  const text = written.join('')
  return {
    text,
    messages: text
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  }
}

test('one JSON message per line, newline-delimited — no Content-Length framing', async () => {
  const { text, messages } = await runStdio([`${JSON.stringify(rpc(1, 'initialize', { protocolVersion: '2025-06-18' }))}\n`])
  assert.ok(!text.includes('Content-Length'))
  assert.ok(text.endsWith('\n'))
  assert.equal(messages.length, 1)
  assert.equal(messages[0].result.protocolVersion, '2025-06-18')
})

test('several messages in one chunk, and one message split across chunks, both decode', async () => {
  const a = JSON.stringify(rpc(1, 'ping'))
  const b = JSON.stringify(rpc(2, 'ping'))
  const c = JSON.stringify(rpc(3, 'ping'))
  const { messages } = await runStdio([`${a}\n${b}\n`, c.slice(0, 10), `${c.slice(10)}\n`])
  assert.deepEqual(messages.map((m) => m.id), [1, 2, 3])
})

test('a notification produces no line at all', async () => {
  const { text, messages } = await runStdio([
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    `${JSON.stringify(rpc(1, 'ping'))}\n`,
  ])
  assert.equal(messages.length, 1)
  assert.equal(messages[0].id, 1)
  assert.equal(text.split('\n').filter(Boolean).length, 1)
})

test('an unparseable line answers with id null and the parse-error code', async () => {
  const { messages } = await runStdio(['{ not json\n'])
  assert.equal(messages[0].id, null)
  assert.equal(messages[0].error.code, -32700)
})

test('blank lines are ignored and stdin ending resolves the transport', async () => {
  const { messages } = await runStdio(['\n', '   \n', `${JSON.stringify(rpc(1, 'ping'))}\n`])
  assert.equal(messages.length, 1)
})

test('parseArgs defaults to stdio and reads --http in both spellings', () => {
  assert.deepEqual(parseArgs([]), {
    mode: 'stdio',
    port: 8790,
    host: null,
    allowedOrigins: [],
    allowSharedToken: false,
    help: false,
    version: false,
  })
  assert.equal(parseArgs(['--http']).mode, 'http')
  assert.equal(parseArgs(['--http']).port, 8790)
  assert.equal(parseArgs(['--http', '9001']).port, 9001)
  assert.equal(parseArgs(['--http=9002']).port, 9002)
  assert.equal(parseArgs(['--http'], { PORT: '9003' }).port, 9003)
  assert.equal(parseArgs(['--help']).help, true)
})

test('a nonsense port or option is refused rather than silently listening elsewhere', () => {
  assert.throws(() => parseArgs(['--http', '0']), /port between 1 and 65535/)
  assert.throws(() => parseArgs(['--http=notaport']), /port between 1 and 65535/)
  assert.throws(() => parseArgs(['--sign-everything']), /unknown option/)
})

test('missing configuration is a warning with instructions, not a crash', () => {
  const { api } = buildServer({ env: {} })
  const warnings = configurationWarnings(api)
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /FAIRWINS_API_URL is unset/)
  assert.match(warnings[0], /running and speaks MCP/)
  assert.match(warnings[1], /FAIRWINS_API_TOKEN is unset/)
  assert.match(warnings[1], /Public tools .* still work/)
})

test('a configured server warns about nothing', () => {
  const { api } = buildServer({ env: { FAIRWINS_API_URL: 'https://relay.example', FAIRWINS_API_TOKEN: 'fw1.a.b' } })
  assert.deepEqual(configurationWarnings(api), [])
  assert.equal(api.baseUrl, 'https://relay.example')
})

test('a base URL that is not http(s) counts as unconfigured rather than being trusted', () => {
  for (const bad of ['', '   ', 'relay.fairwins.app', 'ftp://relay.fairwins.app', 'javascript:alert(1)']) {
    assert.equal(buildServer({ env: { FAIRWINS_API_URL: bad } }).api.configured, false, `${bad} must not configure`)
  }
  assert.equal(buildServer({ env: { FAIRWINS_API_URL: 'https://relay.example/' } }).api.baseUrl, 'https://relay.example')
})
