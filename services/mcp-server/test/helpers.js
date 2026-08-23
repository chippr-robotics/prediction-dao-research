/**
 * Test helpers: an in-process stub of the FairWins gateway (spec 095).
 *
 * A real `node:http` server on an ephemeral port, not a mocked `fetch`. The client under test is
 * mostly a set of decisions about HTTP — status codes, error bodies, headers, timeouts — and a
 * stubbed fetch would let every one of those decisions be wrong while the suite stayed green.
 *
 * It records every request it receives (path, method, headers) so a test can assert that the token
 * travelled in the Authorization header and that a per-request override actually won.
 */
import { createServer } from 'node:http'

/**
 * @param {Record<string, {status?: number, body?: any, headers?: object} | Function>} routes
 *   keyed `"<METHOD> <pathname>"`; a function receives `{ req, url, body }` and returns the same shape.
 */
export async function startStubGateway(routes = {}) {
  const requests = []

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let parsedBody = null
      try {
        parsedBody = raw ? JSON.parse(raw) : null
      } catch {
        parsedBody = raw
      }
      requests.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body: parsedBody,
      })

      const key = `${req.method} ${url.pathname}`
      const route = routes[key]
      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'not_found', reason: `stub has no route for ${key}` } }))
        return
      }
      // Routes may be async — a route that never resolves is how a test exercises the client's
      // timeout. `closeAllConnections` in close() is what stops that hanging the suite.
      const resolved = typeof route === 'function' ? await route({ req, url, body: parsedBody }) : route
      if (res.writableEnded) return
      const status = resolved.status ?? 200
      const headers = { 'content-type': 'application/json', ...(resolved.headers ?? {}) }
      res.writeHead(status, headers)
      res.end(typeof resolved.body === 'string' ? resolved.body : JSON.stringify(resolved.body ?? {}))
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    async close() {
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

/** Post one JSON-RPC message to a listening HTTP transport and return `{ status, body, headers }`. */
export async function postMcp(baseUrl, message, headers = {}) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof message === 'string' ? message : JSON.stringify(message),
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body, headers: res.headers }
}

/** A JSON-RPC request object. */
export const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })
