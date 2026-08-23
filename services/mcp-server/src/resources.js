/**
 * MCP resources (spec 095).
 *
 * Three, and each earns its place by being a thing an agent should read WHOLE rather than call:
 *
 *   fairwins://openapi  the member API's own OpenAPI 3.1 document, fetched live from the gateway.
 *                       It is the authority on what exists — including the exact list of buildable
 *                       actions — so an agent that reads it cannot invent an endpoint. Fetched, not
 *                       vendored: a copy shipped in this image would describe whatever the API was
 *                       on the day the image was built, and be confidently wrong afterwards.
 *   fairwins://status   the gateway's public health and module state.
 *   fairwins://guide    the getting-started document, embedded in the image (src/guide.md) because
 *                       it must be readable when the gateway is unreachable — that is exactly the
 *                       moment an agent needs to be told what this server can and cannot do.
 *
 * A failed fetch is an ERROR, not an empty document. `resources/read` has no isError channel, so a
 * failure has to surface as a JSON-RPC error; returning an empty body would tell the agent the API
 * has no endpoints, which is a fabricated fact.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ApiError } from './api.js'
import { JsonRpcError, ERROR_CODES } from './jsonrpc.js'

/** Read once, at startup: the guide is part of the image and cannot change under a running process. */
const GUIDE_MARKDOWN = readFileSync(fileURLToPath(new URL('./guide.md', import.meta.url)), 'utf8')

export const RESOURCE_URIS = Object.freeze({
  openapi: 'fairwins://openapi',
  status: 'fairwins://status',
  guide: 'fairwins://guide',
})

/** @param {{api: ReturnType<import('./api.js').createApiClient>}} deps */
export function createResources({ api }) {
  const definitions = [
    {
      uri: RESOURCE_URIS.openapi,
      name: 'FairWins member API (OpenAPI 3.1)',
      title: 'FairWins member API specification',
      description:
        'The live OpenAPI 3.1 document served by the gateway, describing every member API endpoint, its scope ' +
        'and its error codes. The authority on what exists — read it before assuming an endpoint.',
      mimeType: 'application/json',
      read: async () => ({
        mimeType: 'application/json',
        text: JSON.stringify(await api.get('/v1/member/openapi.json', { auth: 'none' }), null, 2),
      }),
    },
    {
      uri: RESOURCE_URIS.status,
      name: 'FairWins gateway status',
      title: 'FairWins gateway status',
      description:
        'The gateway’s public /status: which optional modules are live right now and whether a killswitch is ' +
        'active. A feature being switched off is a different fact from a member having no data.',
      mimeType: 'application/json',
      read: async () => ({
        mimeType: 'application/json',
        text: JSON.stringify(await api.get('/status', { auth: 'none' }), null, 2),
      }),
    },
    {
      uri: RESOURCE_URIS.guide,
      name: 'FairWins MCP getting started',
      title: 'FairWins MCP getting started',
      description:
        'How member API tokens are created in the app, what this server can and cannot do (it never signs), ' +
        'the scopes, and how to report a failed read honestly. Embedded — readable even when the gateway is not.',
      mimeType: 'text/markdown',
      read: async () => ({ mimeType: 'text/markdown', text: GUIDE_MARKDOWN }),
    },
  ]

  const byUri = new Map(definitions.map((d) => [d.uri, d]))

  return {
    list() {
      return definitions.map(({ uri, name, title, description, mimeType }) => ({
        uri,
        name,
        title,
        description,
        mimeType,
      }))
    },
    async read(uri) {
      const found = byUri.get(uri)
      if (!found) {
        throw new JsonRpcError(ERROR_CODES.RESOURCE_NOT_FOUND, `no such resource: ${uri}`, {
          available: definitions.map((d) => d.uri),
        })
      }
      try {
        const { mimeType, text } = await found.read()
        return { contents: [{ uri, mimeType, text }] }
      } catch (err) {
        // The gateway's own code and reason, verbatim. An agent must be able to tell "the module is
        // switched off" from "the network failed" from "this resource does not exist".
        const code = err instanceof ApiError ? err.code : 'read_failed'
        const reason = err instanceof ApiError ? err.reason : (err?.message ?? String(err))
        throw new JsonRpcError(ERROR_CODES.INTERNAL_ERROR, `${uri} could not be read: ${code} — ${reason}`, { code })
      }
    },
  }
}
