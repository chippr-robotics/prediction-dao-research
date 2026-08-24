/**
 * JSON-RPC 2.0 framing for the FairWins MCP server (spec 095).
 *
 * MCP speaks JSON-RPC 2.0 over whichever transport is carrying it, so the framing lives here once
 * and both transports (stdio, HTTP) reuse it. There is no dependency to do this: the whole of
 * JSON-RPC 2.0 that MCP uses is a shape check and four error codes, and pulling a package in for it
 * would put a supply-chain surface on a service whose entire selling point is that it has none.
 *
 * TWO RULES THAT ARE EASY TO GET WRONG AND ARE NOT NEGOTIABLE:
 *
 *   1. A NOTIFICATION IS NEVER ANSWERED. A message with no `id` gets no response object at all —
 *      not a success, not an error. `notifications/initialized` arriving as the first thing a
 *      client sends would otherwise draw a reply the client has no request to match it to, and
 *      several clients treat that as a protocol violation and drop the session.
 *   2. AN UNPARSEABLE MESSAGE IS ANSWERED WITH `id: null`. There is no id to echo — inventing one
 *      would attach the error to somebody else's request.
 */

export const JSONRPC_VERSION = '2.0'

/** The JSON-RPC 2.0 reserved codes. MCP adds its own above -32000; -32002 is "resource not found". */
export const ERROR_CODES = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RESOURCE_NOT_FOUND: -32002,
})

/**
 * An error that is meant to reach the client as a JSON-RPC error object.
 *
 * Anything else thrown inside a handler is a bug in this server, and is reported as
 * INTERNAL_ERROR with a generic message — a stack trace is not a protocol message.
 */
export class JsonRpcError extends Error {
  constructor(code, message, data = undefined) {
    super(message)
    this.name = 'JsonRpcError'
    this.code = code
    if (data !== undefined) this.data = data
  }
}

/** Parse one JSON-RPC message. Throws `JsonRpcError(PARSE_ERROR)` on malformed JSON. */
export function parseMessage(text) {
  try {
    return JSON.parse(text)
  } catch {
    throw new JsonRpcError(ERROR_CODES.PARSE_ERROR, 'the message was not valid JSON')
  }
}

/** True when the message is a notification: a request-shaped object carrying no `id`. */
export function isNotification(message) {
  return Boolean(message) && typeof message === 'object' && !Array.isArray(message) && message.id === undefined
}

/**
 * Validate a decoded message as a JSON-RPC 2.0 request or notification.
 *
 * Returns `{ id, method, params, notification }`. Throws `JsonRpcError(INVALID_REQUEST)` for
 * anything that is not one — including a batch array, which MCP's 2025-06-18 revision removed.
 */
export function validateRequest(message) {
  if (Array.isArray(message)) {
    throw new JsonRpcError(
      ERROR_CODES.INVALID_REQUEST,
      'JSON-RPC batches are not supported (removed in MCP protocol revision 2025-06-18); send one message per request'
    )
  }
  if (!message || typeof message !== 'object') {
    throw new JsonRpcError(ERROR_CODES.INVALID_REQUEST, 'a JSON-RPC message must be an object')
  }
  if (message.jsonrpc !== JSONRPC_VERSION) {
    throw new JsonRpcError(ERROR_CODES.INVALID_REQUEST, `jsonrpc must be "${JSONRPC_VERSION}"`)
  }
  if (typeof message.method !== 'string' || message.method.length === 0) {
    throw new JsonRpcError(ERROR_CODES.INVALID_REQUEST, 'method must be a non-empty string')
  }
  const id = message.id
  if (id !== undefined && typeof id !== 'string' && typeof id !== 'number' && id !== null) {
    throw new JsonRpcError(ERROR_CODES.INVALID_REQUEST, 'id must be a string, a number, or null')
  }
  const params = message.params
  if (params !== undefined && (typeof params !== 'object' || params === null)) {
    throw new JsonRpcError(ERROR_CODES.INVALID_PARAMS, 'params must be an object or an array when present')
  }
  return { id, method: message.method, params: params ?? {}, notification: id === undefined }
}

/** A JSON-RPC success response. */
export function successResponse(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id: id ?? null, result }
}

/** A JSON-RPC error response. */
export function errorResponse(id, code, message, data = undefined) {
  const error = { code, message }
  if (data !== undefined) error.data = data
  return { jsonrpc: JSONRPC_VERSION, id: id ?? null, error }
}

/**
 * Map a thrown value onto an error response.
 *
 * A `JsonRpcError` carries its own code and is passed through verbatim; anything else is a defect
 * in this server, so it becomes INTERNAL_ERROR with the message but no stack and no cause — a
 * client is owed an honest failure, not our internals.
 */
export function toErrorResponse(id, err) {
  if (err instanceof JsonRpcError) return errorResponse(id, err.code, err.message, err.data)
  const reason = err && typeof err.message === 'string' ? err.message : String(err)
  return errorResponse(id, ERROR_CODES.INTERNAL_ERROR, `internal error: ${reason}`)
}
