/**
 * Assistant proxy — the model-provider leg of `POST /v1/member/assistant/chat` (spec 095).
 *
 * WHY RAW HTTP AND NOT THE ANTHROPIC SDK
 * The official SDK is the normal choice, and it is the wrong one here: adding a dependency to this
 * service edits the ROOT lockfile, which in this repo is a byte-gate event (spec 075 — a
 * lockfile-touching change has repeatedly dropped an optional platform binary and broken every Vite
 * build). This module needs exactly one endpoint, one request shape and three response fields, so
 * it uses `fetch` against the documented Messages API instead. `fetchImpl` is injectable so tests
 * never touch the network.
 *
 * WHAT LEAVES THE DEVICE, AND WHAT IS NEVER WRITTEN DOWN
 * The member's messages go to the platform gateway and from there to the model provider, and
 * nowhere else. This module NEVER logs message content — not on success, not on failure, not in an
 * error path. The audit event the route emits carries counts only. Note that adding a content field
 * to `audit/log.js`'s FORBIDDEN_KEYS would not be a substitute for this: the guard drops keys it
 * knows about, and the actual rule is that content never reaches the logger at all.
 *
 * WHAT THE ASSISTANT MAY AND MAY NOT DO
 * The system prompt below is the whole of its instruction, it is SERVER-SIDE, and a member cannot
 * replace it — the `messages` array carries conversation only. The rules in it are not decoration:
 * an assistant that says "I've cancelled that wager for you" would be describing a capability this
 * platform deliberately does not give it, and a member acting on that sentence loses money.
 */
import { GatewayError } from '../errors.js'
import { ALL_SCOPES } from './contract.js'

const ANTHROPIC_VERSION = '2023-06-01'

/** Caps — enforced before a single byte is sent upstream. */
export const MAX_MESSAGES = 20
export const MAX_MESSAGE_CHARS = 4000
const MAX_SURFACE_CHARS = 120

/**
 * The hard ceiling on `ASSISTANT_MAX_TOKENS`, enforced at BOOT.
 *
 * A per-turn output ceiling is the only thing that bounds what a single request can cost, so it
 * must not itself be unbounded configuration: `ASSISTANT_MAX_TOKENS=1000000` would be a typo that
 * multiplies the bill by a thousand and reads, in an env file, exactly like the correct value. This
 * is a constant rather than another variable for the same reason — a cap an operator can raise is
 * not a cap. It is sized well above any answer this assistant should give (its whole job is short,
 * concrete replies) and well below anything that could be expensive on its own.
 */
export const MAX_TOKENS_CEILING = 4096

/**
 * Worst-case tokens one turn can cost, for the pre-flight budget reservation.
 *
 * An ESTIMATE, and only ever used as one: it decides how much headroom to hold while the call is in
 * flight, and is replaced by the provider's measured counts the moment they arrive. Input is
 * approximated at the conventional ~4 characters per token (English prose; other scripts run
 * denser, which is why this is a reservation and not an accounting figure), and output is charged
 * at the FULL ceiling, because that is genuinely the most the provider can return.
 *
 * @param {{messages: Array<{role: string, content: string}>, surface: string|null, maxTokens: number}} turn
 */
export function estimateTurnTokens({ messages, surface = null, maxTokens }) {
  const promptChars = buildSystemPrompt({ surface }).length
  const messageChars = messages.reduce((acc, m) => acc + m.content.length, 0)
  // ~4 chars/token, plus a few tokens of per-message envelope the wire format adds.
  const inputTokens = Math.ceil((promptChars + messageChars) / 4) + messages.length * 4
  return inputTokens + Math.max(0, Number(maxTokens) || 0)
}

/**
 * The largest reservation `estimateTurnTokens` can ever produce for a request `parseChatRequest`
 * would admit — the caps above are what make that a finite number.
 *
 * Boot uses it to refuse a token budget that is smaller than one maximal turn. Without that check
 * the budget would be a size limit in disguise: a well-formed request could be refused for being
 * long rather than for the budget being spent, which is a confusing answer to give a member and an
 * impossible one to act on from the outside.
 */
export function maxTurnTokens(maxTokens) {
  const worstMessages = Array.from({ length: MAX_MESSAGES }, () => ({ role: 'user', content: 'x'.repeat(MAX_MESSAGE_CHARS) }))
  return estimateTurnTokens({ messages: worstMessages, surface: 'x'.repeat(MAX_SURFACE_CHARS), maxTokens })
}

/**
 * The server-side system prompt.
 *
 * Written as a description of FairWins plus a short list of things the assistant must not do. The
 * "must not" list is short on purpose: every line is a failure mode with a member-visible cost, not
 * a style preference.
 */
export function buildSystemPrompt({ surface = null } = {}) {
  return [
    'You are the FairWins assistant, embedded in the FairWins app. FairWins is a peer-to-peer wager',
    'platform: members escrow stakes in smart contracts and settle them from agreed outcomes. The app',
    'also has Earn (lending and supplied liquidity), Trade (swaps and read-only perpetuals market data),',
    'Collect (NFTs via OpenSea), Predict (Polymarket prediction markets), Transfer (payments, bridging',
    'and wagers), Protect (Safe custody vaults, message signing and hardware wallets), Recovery',
    '(importing legacy keys), Apps (mini-apps) and Settings.',
    '',
    'How to help:',
    '- Answer questions about how the platform works, and explain what a screen or a fee means.',
    '- Point members at the right place with an in-app link, e.g. /wallet?tab=earn, /wallet?tab=trade,',
    '  /wallet?tab=settings, /wallet?tab=custody, /wallet?tab=security, /apps. Use these plain paths;',
    '  never invent an external URL for something that lives in the app.',
    '- State costs and risks plainly. If an action charges a platform fee, a network fee or a venue',
    '  fee, say so before describing the action as a good idea. Never describe anything as free unless',
    '  you know the fee is zero.',
    '',
    'Hard rules:',
    '- You have NOT performed any action, and you cannot. You do not sign, submit, transfer, cancel or',
    '  approve anything. Never say or imply that you have done something on the member’s behalf —',
    '  describe the steps they can take themselves.',
    '- Never ask for, accept, or repeat a private key, seed phrase, recovery phrase, passkey secret or',
    '  API token. If a member offers one, tell them to stop and to treat it as compromised.',
    '- Never give financial advice or predict an outcome. You can explain mechanics, odds as stated,',
    '  and what a contract does; you cannot tell someone what to bet.',
    '- If you do not know something, say so. Do not guess a balance, a rate, a deadline or an address.',
    '  Live figures come from the member’s own screens, not from you.',
    '- Members can grant programmatic API access with scoped keys; the scopes are:',
    `  ${ALL_SCOPES.join(', ')}. Keys are read/quote only — they can never move funds.`,
    '',
    surface ? `The member is currently on: ${surface}.` : 'The member did not say which screen they are on.',
    '',
    'Answer in plain language, briefly, and prefer a concrete next step over a long explanation.',
  ].join('\n')
}

/**
 * Validate the member's request. Throws before anything is sent upstream, so a malformed body never
 * costs a token.
 *
 * @returns {{messages: Array<{role: string, content: string}>, surface: string|null}}
 */
export function parseChatRequest(body) {
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GatewayError(400, 'bad_request', 'body.messages must be a non-empty array')
  }
  if (messages.length > MAX_MESSAGES) {
    throw new GatewayError(400, 'bad_request', `at most ${MAX_MESSAGES} messages per request; summarise older turns client-side`)
  }
  const clean = messages.map((m, i) => {
    if (!m || typeof m !== 'object') throw new GatewayError(400, 'bad_request', `messages[${i}] must be an object`)
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new GatewayError(400, 'bad_request', `messages[${i}].role must be "user" or "assistant"`)
    }
    if (typeof m.content !== 'string' || m.content.length === 0) {
      throw new GatewayError(400, 'bad_request', `messages[${i}].content must be a non-empty string`)
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      throw new GatewayError(400, 'bad_request', `messages[${i}].content exceeds ${MAX_MESSAGE_CHARS} characters`)
    }
    return { role: m.role, content: m.content }
  })
  // The API requires the conversation to start with a user turn.
  if (clean[0].role !== 'user') {
    throw new GatewayError(400, 'bad_request', 'the first message must be from the user')
  }
  const surface = typeof body?.surface === 'string' ? body.surface.slice(0, MAX_SURFACE_CHARS) : null
  return { messages: clean, surface }
}

/**
 * @param {object} config full gateway config (reads .memberApi.assistant)
 * @param {{fetchImpl?: typeof fetch}} [deps]
 */
export function createAssistantClient(config, { fetchImpl = fetch } = {}) {
  const a = config.memberApi.assistant

  return {
    /** Whether a request right now could be served at all. Public, non-secret. */
    configured: Boolean(a.enabled && a.apiKey),

    /**
     * @param {{messages: Array, surface: string|null}} req
     * @returns {Promise<{reply: string, model: string, usage: {inputTokens: number|null, outputTokens: number|null}}>}
     * @throws {GatewayError} 503 assistant_unconfigured | 503 assistant_unavailable
     */
    async chat({ messages, surface }) {
      if (!a.enabled || !a.apiKey) {
        throw new GatewayError(503, 'assistant_unconfigured', 'the assistant is not enabled on this gateway')
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), a.timeoutMs)
      let res
      try {
        res = await fetchImpl(`${a.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': a.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: a.model,
            max_tokens: a.maxTokens,
            system: buildSystemPrompt({ surface }),
            messages,
          }),
          signal: controller.signal,
        })
      } catch {
        // Timeout or transport failure. The member is told the service is unreachable — never an
        // invented reply, which is the one failure mode an assistant must not have.
        throw new GatewayError(503, 'assistant_unavailable', 'the assistant service could not be reached; try again shortly')
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        // The upstream status is operational information; its BODY may echo the member's own text,
        // so it is never read, never logged and never forwarded.
        console.warn(`[relay-gateway] assistant upstream answered HTTP ${res.status}`)
        throw new GatewayError(503, 'assistant_unavailable', 'the assistant service is temporarily unavailable; try again shortly')
      }

      let payload
      try {
        payload = await res.json()
      } catch {
        throw new GatewayError(503, 'assistant_unavailable', 'the assistant service returned an unreadable response')
      }

      const reply = Array.isArray(payload?.content)
        ? payload.content
            .filter((b) => b?.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text)
            .join('')
        : ''

      if (!reply) {
        // A declined or empty answer is reported as unavailable rather than as a blank reply: a
        // chat bubble containing nothing reads as "the assistant had nothing to say", which is a
        // different claim from "the assistant did not answer".
        throw new GatewayError(
          503,
          'assistant_unavailable',
          payload?.stop_reason === 'refusal'
            ? 'the assistant declined to answer that; rephrase, or ask a person'
            : 'the assistant returned no answer; try again shortly'
        )
      }

      return {
        reply,
        model: typeof payload?.model === 'string' ? payload.model : a.model,
        // Counts only — never content. Absent counts stay null rather than becoming 0.
        usage: {
          inputTokens: Number.isFinite(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null,
          outputTokens: Number.isFinite(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null,
        },
      }
    },
  }
}
