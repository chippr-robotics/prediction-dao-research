/**
 * Fixtures shared by this package's tests (spec 095).
 *
 * `MEMBER_API_DOC` is a faithful trim of what `services/relay-gateway/src/memberApi/openapi.js`
 * produces — same `tags` array, same `x-fairwins-scope` extension alongside a real `security`
 * requirement, same paths. It is a TRIM and not a copy: a package is frozen at an immutable CID and
 * has to keep working against a gateway newer than itself, so the tests exercise the shape this
 * console actually depends on rather than the whole document.
 */

export const MEMBER_API_DOC = {
  openapi: '3.1.0',
  info: {
    title: 'FairWins Member API',
    version: '1.0.0',
    summary: 'Custody-free, member-signed programmatic access.',
  },
  tags: [
    { name: 'discovery', description: 'Describes the API itself. No credential required.' },
    { name: 'identity', description: 'The token, the key, and the membership behind them.' },
    { name: 'reads', description: 'The member’s own data. Three-state, never fabricated.' },
  ],
  security: [{ memberToken: [] }],
  paths: {
    '/v1/member/openapi.json': {
      get: {
        operationId: 'getOpenApiDocument',
        summary: 'The OpenAPI 3.1 description of this API',
        tags: ['discovery'],
        security: [],
      },
    },
    '/v1/member/me': {
      get: {
        operationId: 'getMe',
        summary: 'Introspect the presented token',
        tags: ['identity'],
        security: [{ memberToken: ['read:profile'] }],
        'x-fairwins-scope': 'read:profile',
      },
    },
    '/v1/member/wagers': {
      get: {
        operationId: 'listWagers',
        summary: 'The token account’s wagers, per chain',
        tags: ['reads'],
        security: [{ memberToken: ['read:wagers'] }],
        'x-fairwins-scope': 'read:wagers',
        parameters: [
          { name: 'chainId', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'first', in: 'query', required: false, schema: { type: 'integer' } },
        ],
      },
    },
    '/v1/member/intents/build': {
      post: {
        operationId: 'buildIntent',
        summary: 'Build unsigned EIP-712 typed data for a platform action',
        tags: ['build'],
        security: [{ memberToken: ['build:intents'] }],
        'x-fairwins-scope': 'build:intents',
      },
    },
  },
}

/** A `/v1/member/me` body with a readable membership. */
export const ME_READ = {
  account: '0xAbC0000000000000000000000000000000000028',
  keyId: '0x1111111111111111111111111111111111111111111111111111111111111111',
  label: 'my agent',
  scopes: ['read:profile', 'read:wagers'],
  issuedAt: 1750000000,
  expiresAt: 1757776000,
  membership: {
    state: 'read',
    chainId: 137,
    role: 'WAGER_PARTICIPANT',
    tier: 3,
    tierName: 'Gold',
    active: true,
    expiresAt: 1800000000,
  },
  revocation: { revoked: false, durable: false },
}

/** The same body with membership UNREADABLE — the case that must never render as tier 0. */
export const ME_UNREADABLE_MEMBERSHIP = {
  ...ME_READ,
  membership: {
    state: 'unreadable',
    chainId: 137,
    role: 'WAGER_PARTICIPANT',
    reason: 'the membership contract could not be read; try again',
  },
}

/** The platform's nested error body. */
export function errorBody(code, reason) {
  return { error: { code, reason } }
}

/** A minimal `Response` stand-in — only what `apiClient.requestJson` touches. */
export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? headers[String(name).toLowerCase()] ?? null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }
}

/** A non-JSON 200 — the "you reached a proxy, not the gateway" case. */
export function htmlResponse(text = '<!doctype html><title>hi</title>') {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => text,
  }
}
