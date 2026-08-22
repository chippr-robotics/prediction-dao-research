/**
 * Member API routes — /v1/member/* (spec 095).
 *
 * Contract: specs/095-member-api-agentic-access/contracts/member-api.md, and the OpenAPI document
 * this module itself serves at /v1/member/openapi.json.
 *
 * Structured exactly like src/perps/routes.js: module killswitch -> global killswitch -> enabled
 * check -> per-route auth -> handler, with the gateway-wide nested `{ error: { code, reason } }`
 * body. Paths come from `contract.js`'s ROUTES, which `openapi.js` also reads, so the served
 * specification and the mounted server cannot drift.
 *
 * WHAT THIS MODULE CAN AND CANNOT DO. Every route here is a READ, a QUOTE, or the registration of a
 * member-signed revocation. There is no route that moves value and no credential in the process
 * that could: a capability token authorises the gateway to ANSWER QUESTIONS about a member, never
 * to act as one. Relaying a signed intent stays where it already was — the public `POST /v1/intents`
 * — because that pipeline recovers the signer itself, and duplicating it here would mean two places
 * deciding what a signature authorises.
 *
 * OPTIONAL INFRASTRUCTURE. Off unless MEMBER_API_ENABLED=true, and off means 503
 * `member_api_unconfigured` on every route including the OpenAPI document, so a client can tell
 * "the operator turned it off" from "this gateway is too old to have it". The router is mounted
 * unconditionally for exactly that reason.
 */
import express from 'express'
import { GatewayError } from '../errors.js'
import {
  MAKER_CAP_BPS as POLYMARKET_MAKER_CAP_BPS,
  PERPS_HL_BUILDER_CAP_BPS,
  TAKER_CAP_BPS as POLYMARKET_TAKER_CAP_BPS,
} from '../fees/onchain.js'
import { ERROR_CODES, ROUTES, SCOPES, routeOf } from './contract.js'
import { verifyRevocation } from './auth.js'
import { buildIntent } from './intents.js'
import { parseChatRequest } from './assistant.js'
import { buildOpenApiDocument } from './openapi.js'

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/
const DEFAULT_PAGE = 50
const MAX_PAGE = 200

/**
 * @param {object} config full gateway config (only .memberApi, .chains and .feeRouter are read)
 * @param {{
 *   auth: {authenticate: Function, referenceChainId: number},
 *   revocations: {revoke: Function, isRevoked: Function, durable: boolean},
 *   wagerReader: {read: Function},
 *   assistant: {chat: Function, configured: boolean},
 *   providers: Record<number, object>,
 *   quotas: {hit: Function},
 *   killSwitch: {isActive: () => boolean},
 *   feeRates?: object|null,
 *   audit?: (fields: object) => void,
 *   now?: () => number,   // unix SECONDS, matching the gateway-wide clock
 * }} deps
 *
 * There is deliberately no `membership` dep here: the authenticator has already performed that read
 * to decide whether the token is usable at all, and it hands the result back. A second read would
 * be a second chain call for a fact just established — and, worse, one that could disagree with the
 * one the request was admitted on.
 */
export function createMemberApiRouter(config, {
  auth,
  revocations,
  wagerReader,
  assistant,
  providers,
  quotas,
  killSwitch,
  feeRates = null,
  audit = () => {},
  now = () => Math.floor(Date.now() / 1000),
}) {
  const memberApi = config.memberApi
  const router = express.Router()

  /**
   * Mount one route BY ITS CONTRACT ID, so the method and the path can only ever come from
   * `contract.js` — the same array `openapi.js` documents. A route's path cannot be typed here at
   * all, which is what makes the specification and the server unable to disagree; the completeness
   * check at the bottom of this factory turns a forgotten route into a BOOT failure rather than a
   * 404 a member finds.
   */
  const mounted = new Set()
  const mount = (id, handler) => {
    const r = routeOf(id)
    mounted.add(`${r.method.toUpperCase()} ${r.path}`)
    router[r.method](r.path, handler)
  }

  function requireLive() {
    // Module killswitch first (the bitcoin/bridge/perps convention), then the global one.
    if (memberApi.killSwitch) {
      throw new GatewayError(503, 'member_api_killed', 'the member API is temporarily disabled; try again later')
    }
    if (killSwitch.isActive()) {
      throw new GatewayError(503, 'killswitch_active', 'the gateway is temporarily disabled; try again later')
    }
    if (!memberApi.enabled) {
      throw new GatewayError(503, 'member_api_unconfigured', 'the member API is not enabled on this gateway')
    }
  }

  /**
   * Unauthenticated guard, for the routes that carry no bearer token. Quotas here are keyed per
   * caller IP — the only key available before a signature is verified — with the caveat that
   * `req.ip` is the proxy on the VM deployment, so the GLOBAL window is the real bound.
   */
  function guardPublic(req) {
    requireLive()
    const q = quotas.hit(`ip:${req.ip ?? 'unknown'}`)
    if (!q.allowed) {
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} member API quota exceeded`, { retryAfterSec: q.retryAfterSec })
    }
  }

  /** Authenticated guard: liveness, then the full six-step token check (which also hits quotas). */
  async function guard(req, scope) {
    requireLive()
    return auth.authenticate(req, scope)
  }

  function handleError(res, err) {
    if (err instanceof GatewayError) {
      if (err.retryAfterSec != null) res.set('Retry-After', String(err.retryAfterSec))
      return res.status(err.status).json(err.toBody())
    }
    // Never leak internals. Log, then answer with the module's generic unavailable code.
    console.error('[relay-gateway] member API error', err)
    return res
      .status(ERROR_CODES.upstream_unavailable.status)
      .json({ error: { code: 'upstream_unavailable', reason: 'the member API is temporarily unavailable; try again later' } })
  }

  // The document is built once: it is a pure function of config, and rebuilding it per request
  // would let a cheap unauthenticated GET do real work.
  let openApiDoc = null
  const openApi = () => (openApiDoc ??= buildOpenApiDocument(config, { assistantConfigured: assistant.configured }))

  // ---- GET /v1/member/openapi.json -----------------------------------------------------------
  // No credential: a client must be able to read the specification before a member has minted a
  // key. The module must still be enabled, so a disabled gateway answers with a machine-readable
  // 503 rather than a bare 404.
  mount('openapi', (req, res) => {
    try {
      guardPublic(req)
      res.json(openApi())
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/member/me ---------------------------------------------------------------------
  mount('me', async (req, res) => {
    try {
      const token = await guard(req, SCOPES.readProfile)
      res.json({
        account: token.account,
        keyId: token.keyId,
        label: token.label,
        scopes: token.scopes,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
        // The membership read the authenticator already performed — re-reading it here would be a
        // second chain call for a fact we just established.
        membership: token.membership,
        revocation: { revoked: false, durable: revocations.durable },
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- POST /v1/member/keys/revoke -----------------------------------------------------------
  // SELF-AUTHORIZING. No bearer token: you revoke a key precisely when the token is the thing that
  // got out, so demanding it would make the endpoint useless exactly when it is needed. A valid
  // ApiKeyRevocation signature by the named account is the whole authorisation, and the worst a
  // forged attempt can do is fail verification.
  mount('revoke', async (req, res) => {
    try {
      guardPublic(req)
      const provider = providers?.[auth.referenceChainId] ?? null
      const { account, keyId, revokedAt } = await verifyRevocation({
        provider,
        body: req.body ?? {},
        now,
        clockSkewSec: memberApi.clockSkewSec,
      })
      revocations.revoke(account, keyId, revokedAt)
      // Metadata only: the account and key id are the member's own public identifiers, and there is
      // no token anywhere in this event.
      audit({ account, keyId, action: 'member_api_key_revoked', outcome: 'registered' })
      res.json({
        revoked: true,
        durable: false,
        reason:
          'This revocation is held in the live gateway process and does NOT survive a gateway restart. ' +
          'What does survive is the grant’s own expiry, which was signed into the key when it was created: ' +
          're-submit this revocation after a restart, or let the key expire.',
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/member/keys/status?keyId= -----------------------------------------------------
  mount('keyStatus', async (req, res) => {
    try {
      const token = await guard(req, SCOPES.readProfile)
      const keyId = typeof req.query.keyId === 'string' ? req.query.keyId : ''
      if (!BYTES32_RE.test(keyId)) {
        throw new GatewayError(400, 'bad_request', 'keyId must be a 0x-prefixed 32-byte hex value')
      }
      // An `account` query is accepted for symmetry with the signed struct, but never honoured for a
      // DIFFERENT account: this endpoint answers about the caller, and only the caller.
      const asked = typeof req.query.account === 'string' ? req.query.account : token.account
      if (asked.toLowerCase() !== token.account.toLowerCase()) {
        throw new GatewayError(403, 'insufficient_scope', 'a key’s status is only readable by the account that owns it')
      }
      res.json({
        account: token.account,
        keyId,
        revoked: revocations.isRevoked(token.account, keyId),
        durable: revocations.durable,
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/member/membership --------------------------------------------------------------
  mount('membership', async (req, res) => {
    try {
      const token = await guard(req, SCOPES.readMembership)
      // Reaching this line means the authenticator already read membership successfully — an
      // unreadable one would have 503'd there — so this serves that same read rather than making a
      // second call that could disagree with the first.
      res.json(token.membership)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/member/wagers?chainId=&first= ---------------------------------------------------
  mount('wagers', async (req, res) => {
    try {
      const token = await guard(req, SCOPES.readWagers)

      let chainIds = config.enabledChainIds
      if (req.query.chainId != null && req.query.chainId !== '') {
        const asked = Number.parseInt(String(req.query.chainId), 10)
        if (!Number.isInteger(asked)) throw new GatewayError(400, 'bad_request', 'chainId must be an integer')
        if (!config.chains[asked]) {
          // A chain outside this deployment's cohort is refused rather than answered
          // `not-configured`: that state means "enabled here but with no indexer", and using it for
          // a chain this gateway does not serve at all would blur two different facts.
          throw new GatewayError(
            400,
            'bad_request',
            `chain ${asked} is not enabled on this gateway (enabled: ${config.enabledChainIds.join(', ')})`
          )
        }
        chainIds = [asked]
      }

      let first = DEFAULT_PAGE
      if (req.query.first != null && req.query.first !== '') {
        first = Number.parseInt(String(req.query.first), 10)
        if (!Number.isInteger(first) || first < 1 || first > MAX_PAGE) {
          throw new GatewayError(400, 'bad_request', `first must be an integer between 1 and ${MAX_PAGE}`)
        }
      }

      const { chains, partial } = await wagerReader.read(token.account, { chainIds, first })
      res.json({ account: token.account, chains, partial, asOf: new Date(now() * 1000).toISOString() })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/member/fees ---------------------------------------------------------------------
  // A VIEW of the gateway's existing FeeRouter reader, never a second fee path and never a hardcoded
  // bps. Each service reports where its number came from: `chain` (the live FeeRouter value),
  // `env-fallback` (this gateway's configured default, served when no router is configured) or
  // `unreadable` (a router IS configured and could not be read). That third state matters here more
  // than anywhere else in this module, because ZERO IS A REAL RATE — it means "no fee line at all" —
  // so a failed read must never be served as 0.
  mount('fees', async (req, res) => {
    try {
      await guard(req, SCOPES.readFees)
      const routerConfigured = Boolean(feeRates?.enabled)
      const fallbackSource = routerConfigured ? 'unreadable' : 'env-fallback'
      const entry = (live, fallbackBps, capBps) =>
        live != null
          ? { bps: live, capBps, source: 'chain' }
          : { bps: routerConfigured ? null : fallbackBps, capBps, source: fallbackSource }

      const pm = feeRates ? await feeRates.getPolymarketBps() : null
      const hl = feeRates ? await feeRates.getPerpsHlBuilderBps() : null

      res.json({
        feeRouter: { address: feeRates?.address ?? null, chainId: config.feeRouter.chainId },
        // Only the services the gateway's own reader can answer for. A service it cannot read is
        // absent rather than guessed — inventing a rate here would make this a second fee store,
        // which is precisely what spec 060 exists to prevent.
        services: {
          'polymarket.taker': entry(pm?.takerBps ?? null, config.polymarket.takerFeeBps, POLYMARKET_TAKER_CAP_BPS),
          'polymarket.maker': entry(pm?.makerBps ?? null, config.polymarket.makerFeeBps, POLYMARKET_MAKER_CAP_BPS),
          'perps.hyperliquid.builder': entry(hl, config.perps.hlBuilderFeeBps, PERPS_HL_BUILDER_CAP_BPS),
        },
        asOf: new Date(now() * 1000).toISOString(),
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- POST /v1/member/intents/build -----------------------------------------------------------
  mount('buildIntent', async (req, res) => {
    try {
      const token = await guard(req, SCOPES.buildIntents)
      const body = req.body ?? {}
      const chainId = Number.parseInt(String(body.chainId), 10)
      if (!Number.isInteger(chainId)) throw new GatewayError(400, 'bad_request', 'body.chainId must be an integer')
      // `account` is the TOKEN's account. Whatever the caller put in params for the actor field is
      // discarded inside buildIntent — an "on behalf of" address has no code path here.
      const built = buildIntent(config, { action: body.action, chainId, params: body.params, account: token.account })
      res.json(built)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- POST /v1/member/assistant/chat ----------------------------------------------------------
  mount('assistantChat', async (req, res) => {
    try {
      const token = await guard(req, SCOPES.assistantChat)
      const { messages, surface } = parseChatRequest(req.body ?? {})
      const result = await assistant.chat({ messages, surface })
      // COUNTS ONLY. Not one character of the conversation reaches the log — on this path or any
      // other. Adding a content key to audit/log.js's FORBIDDEN_KEYS would not substitute for that.
      audit({
        account: token.account,
        keyId: token.keyId,
        action: 'member_api_assistant_chat',
        messageCount: messages.length,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        outcome: 'answered',
      })
      res.json(result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // Completeness: every route the contract declares (and therefore every route the OpenAPI document
  // publishes) must actually be mounted. A missing one fails the BOOT, not a member's request.
  const unmounted = ROUTES.filter((r) => !mounted.has(`${r.method.toUpperCase()} ${r.path}`))
  if (unmounted.length > 0) {
    throw new Error(
      `[relay-gateway] member API declares routes it does not mount: ${unmounted.map((r) => r.id).join(', ')}. ` +
        'The OpenAPI document would advertise endpoints this gateway answers with 404.'
    )
  }

  return router
}

/**
 * /status contribution: operational visibility, no member data.
 *
 * `enabled` is HONEST LIVENESS — the module is enabled only if a request right now would be served,
 * so either killswitch turns it false. Same rule as `perpsStatus`.
 */
export function memberApiStatus(config, { killSwitch, assistantConfigured = false }) {
  const memberApi = config.memberApi
  return {
    // "Would a request right now be served?" — so either killswitch makes this false, not just the
    // config flag. An operator reading `enabled: true` while the module is killed would be reading
    // a claim about configuration dressed as a claim about liveness.
    enabled: Boolean(memberApi.enabled) && !memberApi.killSwitch && !killSwitch.isActive(),
    killSwitch: Boolean(memberApi.killSwitch),
    // A boolean, never the credential and never the model id's provenance.
    assistant: { configured: Boolean(assistantConfigured) },
  }
}

/**
 * Every route this module mounts, as `"<METHOD> <path>"`.
 *
 * Derived from the SAME array `openapi.js` documents and `createMemberApiRouter` mounts from, which
 * is why it is not a third list: the factory's completeness check proves the mounting matches, the
 * OpenAPI builder throws on a route it has no detail for, and `test/memberApi.test.js` probes every
 * entry over HTTP to prove the paths are genuinely served.
 */
export function declaredPaths() {
  return ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort()
}
