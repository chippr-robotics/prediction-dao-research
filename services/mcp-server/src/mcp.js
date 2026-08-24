/**
 * The MCP protocol handler (spec 095).
 *
 * One function — `handle(message, ctx)` — that takes a decoded JSON-RPC message and returns the
 * response object, or `null` for a notification. It is transport-agnostic on purpose: stdio and
 * HTTP are two ways of carrying the same bytes, and a protocol bug fixed in one must not need
 * fixing in the other. It is also what the tests drive, so the suite exercises the real dispatcher
 * rather than a rehearsal of it.
 *
 * METHODS SERVED
 *   initialize                 handshake; answers with the protocol version, capabilities, identity
 *   notifications/initialized  accepted silently (a notification is never answered)
 *   ping                       empty result
 *   tools/list, tools/call
 *   resources/list, resources/read
 *   prompts/list, prompts/get
 * Anything else is -32601. An unknown NOTIFICATION is ignored rather than refused, because there is
 * no one to refuse to: a notification carries no id and therefore has no response channel.
 *
 * ONE THING THIS HANDLER DELIBERATELY DOES NOT DO: it does not refuse work before `initialize`.
 * Being strict there buys nothing — this server holds no per-session state worth protecting — and
 * costs real interoperability with clients that probe `tools/list` first.
 */
import { JsonRpcError, ERROR_CODES, successResponse, toErrorResponse, validateRequest } from './jsonrpc.js'
import { describeTool } from './tools.js'

/** Protocol revisions this server can speak, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05'])
export const PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

/** Shown to the model by most clients at connection time. Short, and about what is NOT possible too. */
const INSTRUCTIONS = [
  'FairWins is a peer-to-peer wager platform. These tools read one member’s FairWins data and can assemble',
  'unsigned EIP-712 typed data for them to sign; nothing here signs, submits, or moves funds, and this server',
  'holds no key. Never ask the member for a private key or recovery phrase.',
  '',
  'Reads are three-state. "not-configured" means the platform has no endpoint for that chain and "unreadable"',
  'means the read failed — neither is zero, none, or an empty list. When a tool returns isError, the answer is',
  'unknown: say so rather than reporting an absence. Read fairwins://guide for the custody model.',
].join('\n')

/**
 * @param {{
 *   api: ReturnType<import('./api.js').createApiClient>,
 *   tools: ReturnType<import('./tools.js').createTools>,
 *   resources: ReturnType<import('./resources.js').createResources>,
 *   prompts: ReturnType<import('./prompts.js').createPrompts>,
 *   name?: string,
 *   version: string,
 * }} deps
 */
export function createMcpHandler({ api, tools, resources, prompts, name = 'fairwins-mcp', version }) {
  const toolsByName = new Map(tools.map((t) => [t.name, t]))

  const methods = {
    initialize(params) {
      const asked = typeof params?.protocolVersion === 'string' ? params.protocolVersion : null
      return {
        // Echo a version we both speak; otherwise name ours and let the client decide. Answering
        // with the client's unknown version would be claiming a compatibility we have not checked.
        protocolVersion: asked && SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name, title: 'FairWins', version },
        instructions: INSTRUCTIONS,
      }
    },

    ping() {
      return {}
    },

    'tools/list'() {
      return { tools: tools.map(describeTool) }
    },

    async 'tools/call'(params, ctx) {
      const toolName = params?.name
      const tool = typeof toolName === 'string' ? toolsByName.get(toolName) : null
      if (!tool) {
        // -32602 rather than a tool error: the tool does not exist, which is a caller mistake about
        // the protocol, not a failed read the model should reason about.
        throw new JsonRpcError(ERROR_CODES.INVALID_PARAMS, `no such tool: ${String(toolName)}`, {
          available: tools.map((t) => t.name),
        })
      }
      const args = params?.arguments ?? {}
      if (typeof args !== 'object' || Array.isArray(args)) {
        throw new JsonRpcError(ERROR_CODES.INVALID_PARAMS, 'arguments must be an object')
      }
      return tool.call(args, ctx)
    },

    'resources/list'() {
      return { resources: resources.list() }
    },

    async 'resources/read'(params) {
      const uri = params?.uri
      if (typeof uri !== 'string' || !uri) {
        throw new JsonRpcError(ERROR_CODES.INVALID_PARAMS, 'params.uri is required')
      }
      return resources.read(uri)
    },

    'prompts/list'() {
      return { prompts: prompts.list() }
    },

    'prompts/get'(params) {
      const promptName = params?.name
      if (typeof promptName !== 'string' || !promptName) {
        throw new JsonRpcError(ERROR_CODES.INVALID_PARAMS, 'params.name is required')
      }
      return prompts.get(promptName, params?.arguments ?? {})
    },
  }

  return {
    /** For diagnostics and the HTTP transport's own reporting — never part of a protocol message. */
    describe: () => ({ name, version, protocolVersion: PROTOCOL_VERSION, configured: api.configured }),

    /**
     * @param {object} message a decoded JSON-RPC message
     * @param {{token?: string}} [ctx] per-request context (an HTTP bearer override)
     * @returns {Promise<object|null>} the response, or null when nothing may be sent
     */
    async handle(message, ctx = {}) {
      let request
      try {
        request = validateRequest(message)
      } catch (err) {
        // A malformed NOTIFICATION still gets no answer — there is no id to answer to.
        if (message && typeof message === 'object' && !Array.isArray(message) && message.id === undefined) return null
        return toErrorResponse(message?.id ?? null, err)
      }

      const method = methods[request.method]
      if (!method) {
        if (request.notification) return null // includes unknown notifications/*, ignored by design
        return toErrorResponse(request.id, new JsonRpcError(ERROR_CODES.METHOD_NOT_FOUND, `unknown method: ${request.method}`))
      }

      try {
        const result = await method(request.params, ctx)
        return request.notification ? null : successResponse(request.id, result)
      } catch (err) {
        if (request.notification) return null
        return toErrorResponse(request.id, err)
      }
    },
  }
}
