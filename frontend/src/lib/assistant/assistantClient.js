/**
 * Assistant transport (spec 095) — the session grant, and `POST /v1/member/assistant/chat`.
 *
 * THE ASSISTANT NEEDS A BEARER TOKEN, AND THE MEMBER MINTS IT. There is no service account here and
 * no server-side session: the same member-signed capability that powers an API key powers the chat
 * panel, narrowed to a 24-hour window. On first open after opting in, the member signs one
 * `ApiKeyGrant` and the resulting token is held IN MODULE MEMORY ONLY — never `localStorage`, never
 * `sessionStorage`, never the backup — and dropped on disconnect or account change. A refresh means
 * one more signature; a stolen device yields nothing.
 *
 * That session key is deliberately NOT written to the API-keys metadata store. It is not a key the
 * member manages: it cannot be copied, it cannot leave the tab, and listing it beside the keys they
 * minted for agents would invite them to revoke something they never issued.
 *
 * EVERY FAILURE IS NAMED, AND NONE OF THEM PRODUCES A REPLY. An assistant that invents an answer
 * when its backend is down is the single worst failure this surface can have, so `sendChat` throws
 * an `AssistantError` carrying a machine `state` the panel renders as an honest sentence:
 *
 *   'unset'         no relayer is configured in this build — the feature is simply not wired up here
 *   'unreachable'   network error or timeout — could not ask, not "no answer"
 *   'unconfigured'  the gateway answered, and said the assistant is off / killed there
 *   'unavailable'   the model provider could not be reached or declined
 *   'quota'         rate limited; `retryAfterSeconds` when the gateway said
 *   'unauthorized'  the session token is expired, revoked or refused — re-authorize
 *   'rejected'      anything else the gateway refused, with its reason
 */
import { relayerBaseUrl } from '../relay/intentClient'
import { buildGrant, grantTypedData } from '../apiAccess/apiKeys'
import { encodeToken } from '../apiAccess/tokenCodec'

/** Scopes a chat session asks for: the conversational scope plus the reads that let it answer. */
export const ASSISTANT_SESSION_SCOPES = Object.freeze([
  'assistant:chat',
  'read:profile',
  'read:membership',
  'read:wagers',
  'read:fees',
])

/** Session lifetime. Short by design — the token cannot be re-minted without a fresh signature. */
export const SESSION_TTL_DAYS = 1

const CHAT_TIMEOUT_MS = 45_000
/** The availability probe runs only on the failure path, so it stays short. */
const STATUS_TIMEOUT_MS = 5_000

/** Module-memory session. One account at a time; never persisted. */
let session = null

export class AssistantError extends Error {
  constructor(message, { state, code = null, retryAfterSeconds = null } = {}) {
    super(message)
    this.name = 'AssistantError'
    this.state = state
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const norm = (account) => (account ? String(account).toLowerCase() : null)
const nowSeconds = () => Math.floor(Date.now() / 1000)

/** Drop the in-memory session. Called on disconnect, account change, and by the panel's Close-all. */
export function clearSession() {
  session = null
}

/** Whether a usable session exists for this account right now. */
export function hasSession(account) {
  const key = norm(account)
  if (!key || !session || session.account !== key) return false
  // A minute of headroom: a token that expires mid-flight reads to the member as a random failure.
  return session.expiresAt > nowSeconds() + 60
}

/** When the current session expires (unix seconds), or null. */
export function sessionExpiresAt(account) {
  return hasSession(account) ? session.expiresAt : null
}

/**
 * Authorize a chat session: build a 24-hour grant, have the member sign it, hold the token in memory.
 *
 * @param {{account: string, sign: (domain, types, message) => Promise<string>, now?: number}} args
 * @returns {Promise<{expiresAt: number, scopes: string[]}>}
 */
export async function authorizeSession({ account, sign, now }) {
  const key = norm(account)
  if (!key) throw new AssistantError('Connect a wallet to use the assistant.', { state: 'unauthorized' })
  if (typeof sign !== 'function') {
    throw new AssistantError('This account cannot sign the assistant session.', { state: 'unauthorized' })
  }

  const grant = buildGrant({
    account,
    scopes: [...ASSISTANT_SESSION_SCOPES],
    ttlDays: SESSION_TTL_DAYS,
    label: 'Assistant session',
    nowSeconds: now,
  })
  const { domain, types, message } = grantTypedData(grant)
  const signature = await sign(domain, types, message)

  session = { account: key, token: encodeToken(grant, signature), expiresAt: grant.expiresAt }
  return { expiresAt: grant.expiresAt, scopes: [...grant.scopes] }
}

/** `fetch` with a bounded budget. Any transport failure or timeout is 'unreachable', never a reply. */
async function boundedFetch(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (e) {
    throw new AssistantError('The assistant service could not be reached.', {
      state: 'unreachable',
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
    })
  } finally {
    clearTimeout(timer)
  }
}

async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Gateway 503 codes that mean "turned off here", as opposed to "briefly broken". */
const UNCONFIGURED_CODES = new Set([
  'assistant_unconfigured',
  'member_api_unconfigured',
  'member_api_killed',
  'killswitch_active',
])

/**
 * Send the conversation and return the assistant's reply.
 *
 * @param {{account: string, messages: Array<{role: 'user'|'assistant', content: string}>, surface?: string, baseUrl?: string, timeoutMs?: number}} args
 * @returns {Promise<{reply: string, model: string, usage: {inputTokens: number|null, outputTokens: number|null}}>}
 * @throws {AssistantError}
 */
export async function sendChat({ account, messages, surface = null, baseUrl, timeoutMs = CHAT_TIMEOUT_MS }) {
  const base = (baseUrl != null ? baseUrl : relayerBaseUrl()).replace(/\/$/, '')
  if (!base) {
    throw new AssistantError('This build has no assistant service configured.', { state: 'unset' })
  }
  if (!hasSession(account)) {
    throw new AssistantError('Authorize an assistant session to continue.', { state: 'unauthorized' })
  }

  let res
  try {
    res = await boundedFetch(
    `${base}/v1/member/assistant/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The credential rides in a HEADER, never in the URL (spec 069's rule, and the reason the
        // gateway had to add `Authorization` to its allowed CORS headers).
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ messages, ...(surface ? { surface } : {}) }),
    },
    timeoutMs
    )
  } catch (e) {
    // A transport failure is the one case where the browser has thrown away the distinguishing
    // fact. Spend one short request on `/status` to recover it — and keep the original error when
    // `/status` cannot answer either, because "unreachable" is then true rather than a guess.
    if (e instanceof AssistantError && e.state === 'unreachable') {
      const better = await probeAssistantAvailability(base)
      if (better) throw better
    }
    throw e
  }
  const data = await readJson(res)
  const code = data?.error?.code ?? null
  const reason = data?.error?.reason ?? null

  if (res.status === 401) {
    // The token is no longer usable. Drop it so the panel offers re-authorization rather than
    // retrying a credential that will keep failing.
    clearSession()
    throw new AssistantError(reason || 'The assistant session expired. Authorize it again.', {
      state: 'unauthorized',
      code,
    })
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers?.get?.('Retry-After'))
    throw new AssistantError(reason || 'Too many assistant requests just now. Try again shortly.', {
      state: 'quota',
      code,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
    })
  }
  if (res.status === 503) {
    throw new AssistantError(
      reason || 'The assistant is not available right now.',
      { state: UNCONFIGURED_CODES.has(code) ? 'unconfigured' : 'unavailable', code }
    )
  }
  if (!res.ok) {
    throw new AssistantError(reason || `The assistant request was refused (HTTP ${res.status}).`, {
      state: 'rejected',
      code,
    })
  }
  if (!data || typeof data.reply !== 'string' || data.reply.length === 0) {
    // An empty body is not an empty answer. Reporting it as a blank bubble would claim the
    // assistant had nothing to say, which is a different fact from "it did not answer".
    throw new AssistantError('The assistant returned no answer. Try again shortly.', {
      state: 'unavailable',
      code: 'empty_reply',
    })
  }

  return {
    reply: data.reply,
    model: typeof data.model === 'string' ? data.model : null,
    usage: {
      inputTokens: data.usage?.inputTokens ?? null,
      outputTokens: data.usage?.outputTokens ?? null,
    },
  }
}


/**
 * Why could the assistant not be reached? Ask `/status`, which can answer.
 *
 * A transport failure is ambiguous from inside the browser, and the ambiguity is not academic —
 * it is what a member saw on 2026-08-26. When the gateway does not carry the spec-095 module,
 * `POST /v1/member/assistant/chat` 404s from Express's default handler, and that response
 * additionally advertises `Access-Control-Allow-Headers: Content-Type` — without `Authorization`,
 * which this request must send. The browser therefore rejects the PREFLIGHT, `fetch` throws, and
 * every distinguishable fact is lost: "not offered on this deployment" arrives looking exactly
 * like "your network is down".
 *
 * `/status` is unauthenticated, sends no `Authorization`, needs no preflight, and is served by
 * every gateway build — so it answers where the chat request cannot. Its `memberApi` block
 * (absent entirely on a build predating the module) says which of the two is true.
 *
 * Returns null when `/status` itself cannot be read — then the original "unreachable" stands,
 * because it is then the honest answer rather than a guess.
 */
export async function probeAssistantAvailability(base, { timeoutMs = STATUS_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let status
  try {
    const res = await fetch(`${base}/status`, { signal: controller.signal })
    if (!res.ok) return null
    status = await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  if (!status || typeof status !== 'object') return null

  // The whole block is missing: this gateway build has no member API at all.
  if (status.memberApi == null) {
    return new AssistantError(
      'The assistant is not available on this deployment. The service is reachable, but this ' +
        'version of it does not offer the member API the assistant needs.',
      { state: 'unconfigured', code: 'member_api_absent' },
    )
  }
  if (status.memberApi.enabled !== true) {
    return new AssistantError(
      status.memberApi.killSwitch === true
        ? 'The assistant is switched off on this deployment right now.'
        : 'The assistant is not enabled on this deployment.',
      { state: 'unconfigured', code: 'member_api_unconfigured' },
    )
  }
  if (status.memberApi.assistant?.configured !== true) {
    return new AssistantError(
      'The assistant is enabled here but has no model provider configured, so it cannot answer.',
      { state: 'unconfigured', code: 'assistant_unconfigured' },
    )
  }
  // The module is on and configured, so the failure really was the transport.
  return null
}

/** Test seam: forget the module-memory session. */
export function __resetAssistantSessionForTests() {
  session = null
}
