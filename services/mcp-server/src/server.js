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
 *
 * `--http` BINDS LOOPBACK UNLESS TOLD OTHERWISE. `listen(port)` with no host binds 0.0.0.0, which
 * on a laptop or a shared build machine puts a member's tools on every interface the moment
 * somebody adds `--http` to try something out. The MCP specification says a local server SHOULD
 * bind loopback; this one does, and reaching further is an explicit `--host` (or Cloud Run, which
 * cannot work any other way). See `resolveBindHost`.
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
import { createHttpTransport, normalizeOrigin } from './transport/http.js'

const PKG = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
// Versions are computed at release time (spec 076, FR-008) and this package is never published,
// so its manifest deliberately carries NO version field — the running build reports "unreleased".
const VERSION = PKG.version ?? 'unreleased'
const DEFAULT_HTTP_PORT = 8790

/** Human-facing output. stderr always — see the header. */
const logTo = (stream) => (message) => stream.write(`${message}\n`)

/** The default bind address, and the reason this file exists in its current shape. */
export const LOOPBACK_HOST = '127.0.0.1'
/** What Cloud Run requires: the platform routes to the container from outside its namespace. */
export const ALL_INTERFACES = '0.0.0.0'

/** Read a `--flag value` / `--flag=value` pair, returning the value and advancing the cursor. */
function takeValue(argv, i, arg, name) {
  const inline = arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : null
  if (inline !== null) return { value: inline, next: i }
  const candidate = argv[i + 1]
  if (candidate === undefined || candidate.startsWith('-')) {
    throw new Error(`${name} needs a value (try --help)`)
  }
  return { value: candidate, next: i + 1 }
}

/**
 * Parse the command line.
 *
 * `--http` may name a port or stand alone (then `PORT`, then 8790). An unparseable port is an
 * error worth exiting on: silently listening somewhere else is worse than refusing — and the same
 * principle governs everything added here. A `--host` with no `--http` is not a harmless no-op to
 * be swallowed; it is somebody believing they configured a bind address, so it is an error.
 */
export function parseArgs(argv = [], env = process.env) {
  const args = {
    mode: 'stdio',
    port: DEFAULT_HTTP_PORT,
    host: null,
    allowedOrigins: [],
    allowSharedToken: false,
    help: false,
    version: false,
  }
  const httpOnly = []

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
    } else if (arg === '--host' || arg.startsWith('--host=')) {
      const { value, next } = takeValue(argv, i, arg, '--host')
      i = next
      const host = value.trim()
      if (!host) throw new Error('--host needs an address, for example --host 0.0.0.0')
      args.host = host
      httpOnly.push('--host')
    } else if (arg === '--allowed-origin' || arg.startsWith('--allowed-origin=')) {
      const { value, next } = takeValue(argv, i, arg, '--allowed-origin')
      i = next
      // A wildcard is refused rather than accepted-and-ignored. Somebody typing it is asking for
      // "any origin", and the honest answer is that this endpoint will not do that — not a silent
      // entry that never matches and leaves them debugging a 403 they thought they had turned off.
      if (value.trim() === '*') {
        throw new Error(
          '--allowed-origin does not accept "*". This endpoint holds member capability tokens; ' +
            'any web page matching a wildcard could script calls at it. Name each origin instead.'
        )
      }
      const origin = normalizeOrigin(value)
      if (!origin) {
        throw new Error(`--allowed-origin needs an http(s) origin like https://studio.example, got "${value}"`)
      }
      args.allowedOrigins.push(origin)
      httpOnly.push('--allowed-origin')
    } else if (arg === '--allow-shared-token') {
      args.allowSharedToken = true
      httpOnly.push('--allow-shared-token')
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option "${arg}" (try --help)`)
    }
  }

  // Origins configured out of the environment join the ones named on the command line. Same
  // validation, and an unusable entry is named rather than dropped.
  for (const raw of (env.FAIRWINS_MCP_ALLOWED_ORIGINS ?? '').split(',')) {
    const entry = raw.trim()
    if (!entry) continue
    const origin = normalizeOrigin(entry)
    if (!origin) {
      throw new Error(`FAIRWINS_MCP_ALLOWED_ORIGINS holds "${entry}", which is not an http(s) origin`)
    }
    if (!args.allowedOrigins.includes(origin)) args.allowedOrigins.push(origin)
  }

  if (args.mode !== 'http' && httpOnly.length > 0 && !args.help && !args.version) {
    const names = [...new Set(httpOnly)].join(', ')
    throw new Error(`${names} only applies with --http; the stdio transport has no socket to bind or origin to check`)
  }

  return args
}

/**
 * Where to bind, and why — the reason travels with the address so the boot log can be honest about
 * which of the three rules applied.
 *
 * An explicit `--host` wins, always: an operator who names an address has decided. Otherwise
 * Cloud Run (`K_SERVICE`) gets 0.0.0.0, because the platform reaches the container from outside its
 * network namespace and a loopback-bound revision fails its startup probe with no useful symptom.
 * Everything else — a laptop, a build agent, a bare `--http` — gets loopback.
 *
 * The container image passes `--host 0.0.0.0` in its CMD rather than leaning on the K_SERVICE rule,
 * so `docker run -p 8790:8790` keeps working and the exposure is written where somebody reading the
 * Dockerfile can see it. K_SERVICE remains the backstop for a deployment that overrides the CMD.
 */
export function resolveBindHost({ host = null, env = process.env } = {}) {
  if (host) return { host, reason: 'explicit' }
  if (env.K_SERVICE) return { host: ALL_INTERFACES, reason: 'cloud-run' }
  return { host: LOOPBACK_HOST, reason: 'default' }
}

/** Loopback in every spelling `--host` might name it. */
const LOOPBACK_HOSTS = new Set([LOOPBACK_HOST, 'localhost', '::1', '[::1]'])

export function isLoopbackHost(host) {
  if (LOOPBACK_HOSTS.has(host)) return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

const USAGE = `fairwins-mcp ${VERSION} — the FairWins member API as an MCP server

Usage:
  node src/server.js                 speak MCP over stdio (default; what an MCP client spawns)
  node src/server.js --http [port]   serve POST /mcp and GET /healthz (default port ${DEFAULT_HTTP_PORT})

Options for --http:
  --host <address>       bind address. Default ${LOOPBACK_HOST} (${ALL_INTERFACES} on Cloud Run, where the
                         platform reaches the container from outside its network namespace).
  --allowed-origin <o>   also serve browser requests from this origin. Repeatable. Loopback origins
                         are always served; requests with no Origin header always are.
  --allow-shared-token   serve FAIRWINS_API_TOKEN to callers who send no Authorization header.
                         Without it, --http refuses to start when that variable is set.

Environment:
  FAIRWINS_API_URL               FairWins gateway base URL, e.g. https://relay.fairwins.app
  FAIRWINS_API_TOKEN             the member's own API token, created in the app under Settings > API access
  FAIRWINS_TIMEOUT_MS            per-request upstream timeout in milliseconds (default 15000)
  FAIRWINS_MCP_ALLOWED_ORIGINS   comma-separated origins, same effect as --allowed-origin

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

/**
 * The one configuration this server refuses to boot with, as text — or null when there is nothing
 * to refuse. Exported so the reasoning is testable without starting a listener.
 *
 * WHY THIS IS FATAL WHERE EVERY OTHER CONFIGURATION PROBLEM IS A WARNING.
 * `api.js` falls back to `FAIRWINS_API_TOKEN` whenever a request carries no `Authorization` header.
 * Over stdio that is exactly right and is what the variable is for: there is one caller by
 * construction — the client that spawned the process — and the token is that member's own, sitting
 * in that member's client configuration. Over HTTP the population of callers is "everything that
 * can open a socket to this port", and the fallback silently promotes every one of them to that
 * member: their scopes, their wagers, their fee data, their quotas, and on a priced gateway their
 * membership standing in place of a payment. Both Cloud Run services front this image with
 * `allow_unauthenticated = true`, so on that deployment "everything that can open a socket" is the
 * internet.
 *
 * Refusing at BOOT rather than per request is deliberate. A per-request refusal would leave a
 * misconfigured server running and turn the problem into an intermittent surprise for whichever
 * caller happened to omit a header; and the operator who most needs to hear about this is not
 * reading a response body, they are reading the log line from the deploy that just went out.
 *
 * It is a flag and not a ban because a single-member HTTP deployment is a real thing — a personal
 * server on 127.0.0.1 that an editor talks to over HTTP instead of stdio is the same one-caller
 * situation stdio has, and forbidding it outright would be telling the truth about the risk while
 * being wrong about the case. The flag is what makes it a decision instead of an accident.
 */
export function sharedTokenRefusal({ mode, allowSharedToken, api }) {
  if (mode !== 'http' || allowSharedToken || !api.hasToken) return null
  return (
    'FAIRWINS_API_TOKEN is set and --http was requested. REFUSING TO START.\n' +
    '  In HTTP mode any request that arrives without an "Authorization: Bearer" header is served ' +
    'using that token — so every caller who can reach this port acts as that one member, with that ' +
    "member's scopes and quotas. That is a shared identity, not authentication.\n" +
    '  Do one of these:\n' +
    '    - Unset FAIRWINS_API_TOKEN and have each caller send its own "Authorization: Bearer <token>". ' +
    'This is what lets one process serve several members while holding none of their credentials.\n' +
    '    - Use the stdio transport (drop --http), where the single caller is the client that spawned ' +
    'this process and the env token is exactly the right configuration.\n' +
    '    - Pass --allow-shared-token if you mean it: one member, one server, bound somewhere only ' +
    'that member can reach.'
  )
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

  // Before anything is built up or bound. The one fatal misconfiguration — see sharedTokenRefusal.
  const refusal = sharedTokenRefusal({ mode: args.mode, allowSharedToken: args.allowSharedToken, api })
  if (refusal) {
    log(`[fairwins-mcp] ${refusal}`)
    return { exitCode: 1 }
  }

  for (const warning of configurationWarnings(api)) log(`[fairwins-mcp] ${warning}`)

  const framing = {
    parse: parseMessage,
    // An unparseable message has no id to answer to, so the error is addressed to `null`.
    onParseError: (err) => toErrorResponse(null, err),
  }

  if (args.mode === 'http') {
    const { host, reason } = resolveBindHost({ host: args.host, env })
    const server = createHttpTransport({
      handle: handler.handle,
      ...framing,
      allowedOrigins: args.allowedOrigins,
      log,
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(args.port, host, () => {
        log(
          `[fairwins-mcp] listening on http://${host}:${args.port} — POST /mcp, GET /healthz` +
            `${api.configured ? ` (gateway ${api.baseUrl})` : ''}`
        )
        // Reaching past loopback is said out loud, every time, and names what it means rather than
        // reporting the address and leaving the operator to work out the consequence.
        if (!isLoopbackHost(host)) {
          const why = reason === 'cloud-run' ? 'K_SERVICE is set, so this is Cloud Run' : 'you passed --host'
          log(
            `[fairwins-mcp] bound to ${host} (${why}). This port is reachable from outside this machine, and ` +
              'every caller who can reach it can call every tool. Origin checking is on, but it only constrains ' +
              'browsers — it is not authentication. Each caller must bring its own Authorization: Bearer token.'
          )
        }
        if (args.allowSharedToken && api.hasToken) {
          log(
            '[fairwins-mcp] --allow-shared-token: requests arriving with no Authorization header are served as ' +
              'the member who owns FAIRWINS_API_TOKEN. Everyone who can reach this port shares that identity.'
          )
        }
        if (args.allowedOrigins.length > 0) {
          log(`[fairwins-mcp] browser origins allowed in addition to loopback: ${args.allowedOrigins.join(', ')}`)
        }
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
