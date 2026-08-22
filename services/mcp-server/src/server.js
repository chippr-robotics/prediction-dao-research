/**
 * FairWins MCP server — entrypoint (spec 095).
 *
 *   node src/server.js                 stdio transport (what an MCP client spawns)
 *   node src/server.js --http 8790     HTTP transport: POST /mcp, GET /healthz (what the container runs)
 *
 * ZERO DEPENDENCIES, ON PURPOSE. Node built-ins only, and this service is deliberately NOT an npm
 * workspace member: it adds nothing to the root lockfile, so it cannot be the reason a lockfile
 * resolution breaks a Vite build (spec 075), and an agent runtime a member installs on their own
 * machine pulls no third-party code from us at all.
 *
 * MISSING CONFIGURATION IS HONEST, NOT FATAL. With `FAIRWINS_API_URL` unset the process still boots
 * and still speaks MCP; every tool that needs the gateway answers with `api_unconfigured` and says
 * what to set. A server that exits on a missing env instead gives an MCP client a spawn failure and
 * the member a red dot with no explanation — the least useful possible way to report a typo.
 *
 * NOTHING IS EVER WRITTEN TO STDOUT except protocol messages. Every human-facing line goes to
 * stderr, which is where MCP clients collect server logs; a banner on stdout corrupts the stream.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApiClient } from './api.js'
import { createTools } from './tools.js'
import { createResources } from './resources.js'
import { createPrompts } from './prompts.js'
import { createMcpHandler } from './mcp.js'
import { parseMessage, toErrorResponse } from './jsonrpc.js'
import { startStdioTransport } from './transport/stdio.js'
import { createHttpTransport } from './transport/http.js'

const PKG = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
// Versions are computed at release time (spec 076, FR-008) and this package is never published,
// so its manifest deliberately carries NO version field — the running build reports "unreleased".
const VERSION = PKG.version ?? 'unreleased'
const DEFAULT_HTTP_PORT = 8790

/** Human-facing output. stderr always — see the header. */
const logTo = (stream) => (message) => stream.write(`${message}\n`)

/**
 * Parse the command line.
 *
 * `--http` may name a port or stand alone (then `PORT`, then 8790). An unparseable port is an
 * error worth exiting on: silently listening somewhere else is worse than refusing.
 */
export function parseArgs(argv = [], env = process.env) {
  const args = { mode: 'stdio', port: DEFAULT_HTTP_PORT, help: false, version: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--version' || arg === '-v') args.version = true
    else if (arg === '--http' || arg.startsWith('--http=')) {
      args.mode = 'http'
      const inline = arg.startsWith('--http=') ? arg.slice('--http='.length) : null
      const next = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[(i += 1)] : null)
      const chosen = next ?? env.PORT ?? String(DEFAULT_HTTP_PORT)
      const port = Number.parseInt(chosen, 10)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`--http needs a port between 1 and 65535, got "${chosen}"`)
      }
      args.port = port
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option "${arg}" (try --help)`)
    }
  }
  return args
}

const USAGE = `fairwins-mcp ${VERSION} — the FairWins member API as an MCP server

Usage:
  node src/server.js                 speak MCP over stdio (default; what an MCP client spawns)
  node src/server.js --http [port]   serve POST /mcp and GET /healthz (default port ${DEFAULT_HTTP_PORT})

Environment:
  FAIRWINS_API_URL     FairWins gateway base URL, e.g. https://relay.fairwins.app
  FAIRWINS_API_TOKEN   the member's own API token, created in the app under Settings > API access
  FAIRWINS_TIMEOUT_MS  per-request upstream timeout in milliseconds (default 15000)

This server reads and quotes. It cannot sign, submit, or move funds, and it never creates a token.`

/**
 * Build every part of the server from an environment. Exported so the tests drive the real handler
 * rather than a rehearsal of it.
 */
export function buildServer({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const timeoutRaw = Number.parseInt(env.FAIRWINS_TIMEOUT_MS ?? '', 10)
  const api = createApiClient({
    baseUrl: env.FAIRWINS_API_URL,
    token: env.FAIRWINS_API_TOKEN,
    fetchImpl,
    ...(Number.isInteger(timeoutRaw) && timeoutRaw > 0 ? { timeoutMs: timeoutRaw } : {}),
    userAgent: `fairwins-mcp/${VERSION}`,
  })

  const tools = createTools({ api })
  const resources = createResources({ api })
  const prompts = createPrompts()
  const handler = createMcpHandler({ api, tools, resources, prompts, version: VERSION })

  return { api, tools, resources, prompts, handler, version: VERSION }
}

/**
 * Configuration warnings, as text. Honest and non-fatal: each names what is unset and exactly what
 * that costs, so a member reading their client's server log can fix it without guessing.
 */
export function configurationWarnings(api) {
  const warnings = []
  if (!api.configured) {
    warnings.push(
      'FAIRWINS_API_URL is unset or is not an http(s) URL. The server is running and speaks MCP, but every ' +
        'tool will answer "api_unconfigured" until it is set (for example https://relay.fairwins.app).'
    )
  }
  if (!api.hasToken) {
    warnings.push(
      'FAIRWINS_API_TOKEN is unset. Public tools (gateway status, prediction markets, perps pairs) still work; ' +
        'the member tools need a token created in the FairWins app under Settings > API access. ' +
        'In --http mode a per-request "Authorization: Bearer <token>" header supplies one instead.'
    )
  }
  return warnings
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  stdin = process.stdin,
} = {}) {
  const log = logTo(stderr)

  let args
  try {
    args = parseArgs(argv, env)
  } catch (err) {
    log(`[fairwins-mcp] ${err.message}`)
    return { exitCode: 1 }
  }

  // --help and --version are the only things allowed to reach stdout, and only because in neither
  // case is a protocol stream being carried on it.
  if (args.help) {
    stdout.write(`${USAGE}\n`)
    return { exitCode: 0 }
  }
  if (args.version) {
    stdout.write(`${VERSION}\n`)
    return { exitCode: 0 }
  }

  const { api, handler } = buildServer({ env })
  for (const warning of configurationWarnings(api)) log(`[fairwins-mcp] ${warning}`)

  const framing = {
    parse: parseMessage,
    // An unparseable message has no id to answer to, so the error is addressed to `null`.
    onParseError: (err) => toErrorResponse(null, err),
  }

  if (args.mode === 'http') {
    const server = createHttpTransport({ handle: handler.handle, ...framing, log })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(args.port, () => {
        log(`[fairwins-mcp] listening on :${args.port} — POST /mcp, GET /healthz${api.configured ? ` (gateway ${api.baseUrl})` : ''}`)
        resolve()
      })
    })
    return { exitCode: 0, server }
  }

  log(`[fairwins-mcp] ready on stdio${api.configured ? ` (gateway ${api.baseUrl})` : ''}`)
  const transport = startStdioTransport({ handle: handler.handle, ...framing, stdin, stdout, log })
  await transport.done
  return { exitCode: 0 }
}

// `node src/server.js` boots; importing this file for tests does not.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(({ exitCode }) => {
      if (exitCode) process.exitCode = exitCode
    })
    .catch((err) => {
      process.stderr.write(`[fairwins-mcp] failed to start: ${err?.stack ?? err}\n`)
      process.exit(1)
    })
}
