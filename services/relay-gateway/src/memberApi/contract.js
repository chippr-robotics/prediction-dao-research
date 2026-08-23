/**
 * Member API surface constants — the ONE declaration of what this module serves (spec 095).
 *
 * Contract: specs/095-member-api-agentic-access/contracts/member-api.md.
 *
 * WHY THIS FILE EXISTS
 * `routes.js` mounts the paths and `openapi.js` describes them. If each held its own list, the
 * published specification and the running server would drift — and an OpenAPI document that
 * describes an endpoint the gateway does not serve is worse than no document at all, because an
 * agent generated from it fails at a member's request rather than at review. So both read `ROUTES`
 * here: `routes.js` mounts `pathOf(id)` and `openapi.js` iterates the same array. A route added to
 * one is automatically present in the other, and `test/memberApi.test.js` asserts the mounted set
 * and the documented set are equal.
 *
 * Scopes and error codes are here for the same reason: the scope a handler enforces and the scope
 * the document advertises are one value, not two that agree today.
 */

/** Wire prefix of a capability token: `fw1.<base64url(grant)>.<base64url(signature)>`. */
export const TOKEN_PREFIX = 'fw1'

/**
 * Scopes v1.
 *
 * Read-shaped, quote-shaped, and one conversational scope. There is deliberately no `write:` scope
 * of any kind: the member API can never move value, because the only rail it offers for an action
 * is "here is the typed data, YOU sign it" (`build:intents`) followed by the existing public
 * `POST /v1/intents`, which recovers the signer itself. A scope that authorised a write would be a
 * claim this service can act as the member, and it cannot.
 */
export const SCOPES = Object.freeze({
  readProfile: 'read:profile',
  readWagers: 'read:wagers',
  readMembership: 'read:membership',
  readFees: 'read:fees',
  buildIntents: 'build:intents',
  assistantChat: 'assistant:chat',
})

/** Every scope, ascending — the same order `canonicalScopeString` produces. */
export const ALL_SCOPES = Object.freeze([...Object.values(SCOPES)].sort())

/** Member-facing description of each scope, rendered in the OpenAPI security scheme and the SPA. */
export const SCOPE_DESCRIPTIONS = Object.freeze({
  [SCOPES.readProfile]: 'Read the token itself: which account and key it belongs to, its scopes and expiry.',
  [SCOPES.readWagers]: 'Read the wagers this account is a party to, per chain.',
  [SCOPES.readMembership]: 'Read this account’s membership tier and expiry on the membership reference chain.',
  [SCOPES.readFees]: 'Read the live platform fee rates the FeeRouter publishes.',
  [SCOPES.buildIntents]: 'Build unsigned EIP-712 typed data for a platform action. Signing stays with the member; this never submits anything.',
  [SCOPES.assistantChat]: 'Send messages to the FairWins assistant. The assistant answers questions; it never signs or submits.',
})

/**
 * Every error code this module can return, with the status it returns it with.
 *
 * Bodies are always the gateway-wide nested shape `{ error: { code, reason } }` (errors.js
 * `GatewayError.toBody()`); Bitcoin's flat body is a pre-convention exception and is not copied
 * here. Two codes deserve their reasons stated out loud, because getting them backwards is the
 * defect this module is most able to have:
 *
 *   · `auth_unverifiable` (503) — the ERC-1271 leg could not be run. An RPC timeout is NOT a forged
 *     signature. A contract account (a passkey member) has no public key, so only the account can
 *     say whether it stands behind the bytes; when the chain cannot be reached, the honest answer
 *     is "unknown", and answering 401 would tell a legitimate member their own key is invalid.
 *   · `membership_unreadable` (503) — same shape one level up. An unreadable tier is never tier 0.
 */
export const ERROR_CODES = Object.freeze({
  member_api_unconfigured: { status: 503, summary: 'The member API is not enabled on this gateway.' },
  member_api_killed: { status: 503, summary: 'The member API is temporarily disabled by the operator.' },
  killswitch_active: { status: 503, summary: 'The whole gateway is temporarily disabled.' },
  origin_denied: { status: 403, summary: 'The request did not arrive through the platform edge.' },
  bad_request: { status: 400, summary: 'The request body or query is malformed.' },
  unsupported_action: { status: 400, summary: 'The action exists on the platform but cannot be built here — the reason is always stated.' },
  invalid_token: { status: 401, summary: 'Not an fw1 token, or the grant does not parse.' },
  invalid_signature: {
    status: 401,
    summary: 'Recovery produced another address AND the account itself declined the digest. Distinct from auth_unverifiable, which means the question could not be asked.',
  },
  token_expired: { status: 401, summary: 'The grant’s expiresAt has passed.' },
  token_ttl_exceeded: { status: 401, summary: 'The grant asks for a longer lifetime than this gateway accepts.' },
  token_revoked: { status: 401, summary: 'This key was revoked on this gateway.' },
  auth_unverifiable: { status: 503, summary: 'The signature could not be checked because the reference chain was unreachable. Unknown is not forged — retry.' },
  membership_required: { status: 403, summary: 'The account has no active paid membership.' },
  membership_unreadable: { status: 503, summary: 'Membership could not be read. An unreadable tier is never treated as no membership — retry.' },
  sanctioned_signer: { status: 403, summary: 'The account failed sanctions screening.' },
  screening_unavailable: { status: 503, summary: 'Sanctions screening could not be performed. Fail-closed — retry.' },
  insufficient_scope: { status: 403, summary: 'The token is valid but does not carry the scope this endpoint requires.' },
  quota_exceeded: { status: 429, summary: 'Per-account or global request quota exceeded. Retry-After is set.' },
  assistant_budget_exhausted: {
    status: 429,
    summary:
      'The model TOKEN budget for this account, or for this gateway, is spent for the current window. Distinct from quota_exceeded, which counts requests: this counts what was actually billed. Retry-After names the wait.',
  },
  assistant_unconfigured: { status: 503, summary: 'The assistant is not enabled, or its model credential is unset.' },
  assistant_unavailable: { status: 503, summary: 'The model provider could not be reached, or refused the request.' },
  upstream_unavailable: { status: 503, summary: 'A read this endpoint depends on is temporarily unavailable.' },
})

/**
 * The routes this module mounts, in mount order.
 *
 * `auth`:
 *   'none'      — no credential (the module must still be enabled).
 *   'bearer'    — a capability token in `Authorization: Bearer`, carrying `scope`.
 *   'signature' — the request body carries its own member signature and authorises itself; there is
 *                 no bearer token, because you revoke a key precisely when the token is compromised.
 *
 * `opClass` (spec 096) — which x402 price a request to this route would pay, when the caller has no
 * usable member token AND the paid rail is enabled. `null` means the route is NEVER priced.
 *
 * FIVE ROUTES ARE DELIBERATELY UNPRICED, for three different reasons:
 *   · `openapi` — a client must be able to read the specification before it can decide to pay for
 *     anything. Charging for the description of the price is a closed loop.
 *   · `revoke` — this is how a member withdraws a leaked key. Putting a price between a member and
 *     that action would be the single worst place on this API to put one.
 *   · `me` / `keyStatus` — these introspect a TOKEN. A paid caller has no token, so there is nothing
 *     for them to answer; pricing them would mean inventing an identity for someone who presented
 *     none. `membership` is unpriced for the same reason one level along: the paid rail exists
 *     precisely BECAUSE the payer has no membership to read, and answering it would either fabricate
 *     a state or make a chain read the payer already paid for fail after settlement.
 * What IS priced is the DATA and the WORK: the account's own wagers, the live fee rates, a typed-data
 * build, and an assistant message.
 */
export const ROUTES = Object.freeze([
  Object.freeze({
    id: 'openapi',
    method: 'get',
    path: '/v1/member/openapi.json',
    auth: 'none',
    scope: null,
    opClass: null,
    operationId: 'getOpenApiDocument',
    summary: 'The OpenAPI 3.1 description of this API',
    description:
      'Served without a credential so a client can discover the API before a member has minted a key. ' +
      'The module must still be enabled; when it is not, this answers 503 member_api_unconfigured like ' +
      'every other route here, so a client can tell "turned off" from "gateway too old".',
  }),
  Object.freeze({
    id: 'me',
    method: 'get',
    path: '/v1/member/me',
    auth: 'bearer',
    scope: SCOPES.readProfile,
    opClass: null,
    operationId: 'getMe',
    summary: 'Introspect the presented token',
    description:
      'Everything the gateway knows about this token: the account and key it names, its scopes and ' +
      'window, the account’s membership as a three-state read, and whether the key is revoked here.',
  }),
  Object.freeze({
    id: 'revoke',
    method: 'post',
    path: '/v1/member/keys/revoke',
    auth: 'signature',
    scope: null,
    opClass: null,
    operationId: 'revokeKey',
    summary: 'Withdraw a key by member signature',
    description:
      'Self-authorizing: a valid ApiKeyRevocation signature by the grant’s own account is the whole ' +
      'authorisation, and no bearer token is required — requiring the leaked credential to withdraw ' +
      'the leaked credential would be the wrong shape. The revocation is held IN THIS PROCESS ' +
      '(`durable: false`), so it does not survive a gateway restart; the response says so plainly and ' +
      'names the grant’s own expiry as the bound that does survive.',
  }),
  Object.freeze({
    id: 'keyStatus',
    method: 'get',
    path: '/v1/member/keys/status',
    auth: 'bearer',
    scope: SCOPES.readProfile,
    opClass: null,
    operationId: 'getKeyStatus',
    summary: 'Whether a key is revoked on this gateway',
    description:
      'Answers for any key belonging to the presented token’s account — never another account’s, ' +
      'which is why this needs a token at all for what is otherwise a public-ish fact.',
  }),
  Object.freeze({
    id: 'membership',
    method: 'get',
    path: '/v1/member/membership',
    auth: 'bearer',
    scope: SCOPES.readMembership,
    opClass: null,
    operationId: 'getMembership',
    summary: 'Membership tier on the reference chain',
    description:
      'Membership has one home per environment cohort, so this reads exactly one chain and names it. ' +
      'The result is `read` or `unreadable`; there is no third state where a number appears anyway.',
  }),
  Object.freeze({
    id: 'wagers',
    method: 'get',
    path: '/v1/member/wagers',
    auth: 'bearer',
    scope: SCOPES.readWagers,
    opClass: 'read',
    operationId: 'listWagers',
    summary: 'The token account’s wagers, per chain',
    description:
      'A per-chain envelope, never a flat list: each chain resolves `read` / `not-configured` / ' +
      '`unreadable` independently, and `wagers` exists only on `read`. A chain with no indexer ' +
      'configured is not a chain with no wagers, and a chain whose indexer timed out is neither.',
  }),
  Object.freeze({
    id: 'fees',
    method: 'get',
    path: '/v1/member/fees',
    auth: 'bearer',
    scope: SCOPES.readFees,
    opClass: 'read',
    operationId: 'getFees',
    summary: 'Live platform fee rates',
    description:
      'Read straight through the gateway’s existing FeeRouter reader — this endpoint is a view of ' +
      'the one fee source of truth, not a second one. Each rate names whether it came from `chain` ' +
      'or from the `env-fallback` the gateway serves when the router is unset or unreachable.',
  }),
  Object.freeze({
    id: 'buildIntent',
    method: 'post',
    path: '/v1/member/intents/build',
    auth: 'bearer',
    scope: SCOPES.buildIntents,
    opClass: 'build',
    operationId: 'buildIntent',
    summary: 'Build unsigned EIP-712 typed data for a platform action',
    description:
      'Returns the exact payload the member signs, plus where to send it once signed. The actor ' +
      'field is FORCED to the token’s account and can never be supplied by the caller — an API that ' +
      'accepted an "on behalf of" address would be describing a custody model this platform does not ' +
      'have. Nothing is submitted here; relaying a signed result is the existing public POST /v1/intents, ' +
      'and self-submitting it from the member’s own wallet always remains available.',
  }),
  Object.freeze({
    id: 'assistantChat',
    method: 'post',
    path: '/v1/member/assistant/chat',
    auth: 'bearer',
    scope: SCOPES.assistantChat,
    opClass: 'assistant',
    operationId: 'assistantChat',
    summary: 'Ask the FairWins assistant',
    description:
      'Proxies the conversation to the platform’s model provider under a server-side system prompt. ' +
      'The assistant answers and suggests in-app destinations; it never signs, never submits, and never ' +
      'asks for a key or a recovery phrase. Message content is NEVER logged — the audit event carries ' +
      'counts only.',
  }),
])

const BY_ID = new Map(ROUTES.map((r) => [r.id, r]))

/** The mounted path for a route id. Throws on an unknown id — a typo must not mount `undefined`. */
export function pathOf(id) {
  const r = BY_ID.get(id)
  if (!r) throw new Error(`[relay-gateway] unknown member-API route id: ${id}`)
  return r.path
}

/** The full route record for an id (used by the OpenAPI builder and the drift test). */
export function routeOf(id) {
  const r = BY_ID.get(id)
  if (!r) throw new Error(`[relay-gateway] unknown member-API route id: ${id}`)
  return r
}
