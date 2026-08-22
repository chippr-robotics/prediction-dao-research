/** JSON-RPC 2.0 framing (spec 095). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ERROR_CODES,
  JsonRpcError,
  errorResponse,
  isNotification,
  parseMessage,
  successResponse,
  toErrorResponse,
  validateRequest,
} from '../src/jsonrpc.js'

test('parseMessage decodes JSON and reports a parse error with the reserved code', () => {
  assert.deepEqual(parseMessage('{"a":1}'), { a: 1 })
  try {
    parseMessage('{ not json')
    assert.fail('expected a parse error')
  } catch (err) {
    assert.ok(err instanceof JsonRpcError)
    assert.equal(err.code, ERROR_CODES.PARSE_ERROR)
  }
})

test('validateRequest accepts a request and a notification, and tells them apart', () => {
  const request = validateRequest({ jsonrpc: '2.0', id: 7, method: 'ping', params: {} })
  assert.equal(request.notification, false)
  assert.equal(request.id, 7)

  const notification = validateRequest({ jsonrpc: '2.0', method: 'notifications/initialized' })
  assert.equal(notification.notification, true)
  assert.equal(notification.id, undefined)
  assert.deepEqual(notification.params, {})
})

test('validateRequest refuses a batch, a wrong version, and a missing method', () => {
  for (const bad of [[], { id: 1, method: 'ping' }, { jsonrpc: '1.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 1 }]) {
    assert.throws(() => validateRequest(bad), (err) => err instanceof JsonRpcError && err.code === ERROR_CODES.INVALID_REQUEST)
  }
})

test('id may be null but never an object', () => {
  assert.equal(validateRequest({ jsonrpc: '2.0', id: null, method: 'ping' }).notification, false)
  assert.throws(() => validateRequest({ jsonrpc: '2.0', id: { a: 1 }, method: 'ping' }), /id must be/)
})

test('isNotification keys off the ABSENCE of id, not a falsy id', () => {
  assert.equal(isNotification({ jsonrpc: '2.0', method: 'x' }), true)
  // id 0 and id null are ids: answering them is required, and treating them as notifications would
  // silently drop a real request.
  assert.equal(isNotification({ jsonrpc: '2.0', id: 0, method: 'x' }), false)
  assert.equal(isNotification({ jsonrpc: '2.0', id: null, method: 'x' }), false)
})

test('response builders emit the 2.0 envelope', () => {
  assert.deepEqual(successResponse(1, { ok: true }), { jsonrpc: '2.0', id: 1, result: { ok: true } })
  assert.deepEqual(errorResponse(null, -32601, 'nope'), { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'nope' } })
  assert.deepEqual(errorResponse(2, -32602, 'bad', { why: 'x' }).error.data, { why: 'x' })
})

test('toErrorResponse passes a JsonRpcError through and generalises anything else', () => {
  const known = toErrorResponse(3, new JsonRpcError(ERROR_CODES.METHOD_NOT_FOUND, 'unknown method: x'))
  assert.equal(known.error.code, ERROR_CODES.METHOD_NOT_FOUND)
  assert.equal(known.error.message, 'unknown method: x')

  const unknown = toErrorResponse(4, new TypeError('undefined is not a function'))
  assert.equal(unknown.error.code, ERROR_CODES.INTERNAL_ERROR)
  assert.match(unknown.error.message, /internal error/)
  // No stack, no cause: an internal defect is reported, not exported.
  assert.equal(unknown.error.data, undefined)
})
