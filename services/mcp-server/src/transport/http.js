/**
 * MCP HTTP transport (spec 095) — `node:http`, no framework.
 *
 * Routes:
 *   POST /mcp      one JSON-RPC message per request; the response is that message's answer
 *   GET  /healthz  { status: 'ok' } — liveness for the container and the platform
 *   *              404, with the gateway-style nested `{ error: { code, reason } }` body
 *
 * PER-REQUEST AUTHORIZATION. `Authorization: Bearer <token>` on the POST overrides
 * `FAIRWINS_API_TOKEN` for that request only, and is forwarded upstream — never stored, never
 * logged, never written into a URL. That is what lets ONE process serve several members without
 * holding any of their credentials: the caller brings their own token per call.
 *
 * WHY THERE IS NO CORS HEADER, AND WHY THAT IS NOT AN OVERSIGHT.
 * MCP clients are agents and editors, not browsers: they speak HTTP directly and never perform a
 * preflight, so CORS buys this endpoint nothing. What it would cost is real. An
 * `Access-Control-Allow-Origin: *` here means any web page the member happens to have open can
 * script requests at a server that is, by design, holding a member's capability token — and with an
 * env token configured, every one of those requests would be authenticated as that member. The
 * absence of the header is what keeps a browser from being able to try. If a browser surface ever
 * needs this, it belongs behind an explicit origin allow-list with the reason written down, exactly
 * as the relay gateway does it — never a wildcard.
 *
 * A NOTIFICATION IS ANSWERED WITH 202 AND NO BODY. There is no JSON-RPC response for a
 * notification, and an empty `200` with a JSON content-type is a lie about what is in the body.
 */
import { createServer } from 'node:http'

/** Request bodies are small — one JSON-RPC message. Anything larger is refused, not buffered. */
const MAX_BODY_BYTES = 256 * 1024

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // This endpoint is an API for programs. Nothing here should ever be cached or framed.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(payload)
}

function sendError(res, status, code, reason) {
  sendJson(res, status, { error: { code, reason } })
}

/**
 * Read a request body, never buffering past the cap.
 *
 * Once the cap is passed nothing more is kept — the remaining bytes are drained and discarded so the
 * request can still be ANSWERED with a 413. Destroying the socket at the moment the cap is crossed
 * would be cheaper and is what a first draft does, but the client is then still writing and sees a
 * connection reset instead of the explanation, which is indistinguishable from the server having
 * crashed. A caller that keeps going far past the cap (`HARD_MULTIPLE`) has stopped being a mistake,
 * and gets the reset.
 */
const HARD_MULTIPLE = 8

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        tooLarge = true
        chunks.length = 0
        if (size > maxBytes * HARD_MULTIPLE) {
          req.destroy()
          resolve({ text: '', tooLarge: true })
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), tooLarge }))
    req.on('error', reject)
  })
}

/** Extract a bearer token, or null. A malformed header is treated as absent, never as an error. */
export function bearerFrom(headers) {
  const raw = headers?.authorization ?? headers?.Authorization
  if (typeof raw !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return match ? match[1].trim() : null
}

/**
 * @param {{
 *   handle: (message: object, ctx: object) => Promise<object|null>,
 *   parse: (text: string) => object,
 *   onParseError: (err: unknown) => object,
 *   maxBodyBytes?: number,
 *   log?: (message: string) => void,
 * }} deps
 * @returns {import('node:http').Server}
 */
export function createHttpTransport({ handle, parse, onParseError, maxBodyBytes = MAX_BODY_BYTES, log = () => {} }) {
  return createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]

    if (path === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendError(res, 405, 'method_not_allowed', 'GET /healthz')
      }
      return sendJson(res, 200, { status: 'ok' })
    }

    if (path === '/mcp') {
      if (req.method !== 'POST') {
        // No OPTIONS handler either: without CORS there is nothing a preflight could be told that
        // would make a browser call succeed, and answering one would only imply otherwise.
        return sendError(res, 405, 'method_not_allowed', 'POST /mcp with a single JSON-RPC message')
      }

      let raw
      try {
        const read = await readBody(req, maxBodyBytes)
        if (read.tooLarge) {
          return sendError(res, 413, 'too_large', `the request body exceeded ${maxBodyBytes} bytes`)
        }
        raw = read.text
      } catch {
        return sendError(res, 400, 'bad_request', 'the request body could not be read')
      }

      let message
      try {
        message = parse(raw)
      } catch (err) {
        // A JSON-RPC parse error is a protocol-level answer, so it goes back as 200 with an error
        // object rather than as an HTTP 400: the client's JSON-RPC layer is what has to see it.
        return sendJson(res, 200, onParseError(err))
      }

      try {
        // The per-request token wins over the process's own. It travels no further than the
        // upstream call this request makes.
        const response = await handle(message, { token: bearerFrom(req.headers) })
        if (!response) return res.writeHead(202).end()
        return sendJson(res, 200, response)
      } catch (err) {
        log(`[fairwins-mcp] request failed: ${err?.message ?? String(err)}`)
        return sendError(res, 500, 'internal_error', 'the request could not be handled')
      }
    }

    return sendError(res, 404, 'not_found', 'this server serves POST /mcp and GET /healthz')
  })
}
