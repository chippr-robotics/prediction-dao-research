/**
 * The tools this MCP server offers (spec 095).
 *
 * Eight tools. Six read, one quotes typed data, one reports the gateway's own health. There is
 * deliberately no tool that submits anything, and there cannot be one: the member API this server
 * talks to has no write route, and this process holds no key.
 *
 * HOW A FAILURE IS REPORTED. `isError: true` with the gateway's own error code and reason in the
 * text — never an empty array, never a zero, never a cheerful "nothing found". The distinction an
 * agent needs is exactly the one a failed read destroys: "this member has no wagers on Polygon" and
 * "the Polygon indexer did not answer" are different facts, and only one of them is safe to repeat
 * to a member. The member API preserves that distinction per chain (`read` / `not-configured` /
 * `unreadable`) and these tools pass the envelope through untouched rather than flattening it.
 *
 * WHY THE SCHEMAS ARE SMALL. Every tool that needs a member's authority takes NO account
 * parameter: the account is whichever one signed the bearer token. A tool that accepted an address
 * would be inviting an agent to ask about someone else, and the gateway would refuse it anyway —
 * better that the shape make it unaskable.
 *
 * PAYMENT IS SOMETHING THESE TOOLS REPORT, NEVER SOMETHING THEY DO (spec 096). A priced operation
 * called without an accepted payment answers `402` with a machine-readable offer, and that offer is
 * handed to the agent WHOLE — this process cannot sign it. An agent that can pay retries the same
 * tool with an `X-PAYMENT` header (HTTP mode), which is forwarded upstream verbatim. No tool takes a
 * payment as an ARGUMENT: an argument is model-authored text, and the one thing a model must never
 * be able to author on its own is a transfer authorization.
 */
import { ApiError, PaymentRequiredError } from './api.js'

/**
 * A tool result: plain text content, which every MCP client can render.
 *
 * When the call spent a payment (spec 096), the receipt is a SECOND content block rather than
 * something merged into the data — the first block stays exactly what the gateway answered. The
 * receipt says "broadcast", not "final", because that is all the gateway can honestly claim at the
 * moment it serves the request: the settlement transaction has been accepted by the relay engine,
 * and a chain has not yet confirmed it.
 */
function ok(value, settlement = null) {
  const content = [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
  if (settlement) {
    content.push({
      type: 'text',
      text:
        'A payment was settled for this call (x402). Receipt, as the gateway reported it:\n' +
        `${JSON.stringify(settlement.decoded ?? { opaque: settlement.raw }, null, 2)}\n\n` +
        'The transaction has been BROADCAST, not confirmed. Do not describe it to a member as final, ' +
        'and do not retry this call on the assumption that nothing was charged.',
    })
  }
  return { content, isError: false }
}

/**
 * A `402 Payment Required` answer, said plainly (spec 096).
 *
 * The whole `accepts` list goes back verbatim, because the agent has to sign against exactly those
 * values — the amount, the asset, the recipient, the network and the token's own EIP-712 domain.
 * Summarising it would be inviting the agent to sign something slightly different, which the gateway
 * would then refuse.
 *
 * `isError: true` is correct here: no data was served. But it is a PRICE, not an outage, so the text
 * says which it is — an agent that reads this as a failed read will report "unavailable" about a
 * resource that is available for a tenth of a cent.
 */
function paymentRequired(err) {
  const why = err.paymentError ? `\nThe gateway named this reason: ${err.paymentError}.` : ''
  return {
    content: [
      {
        type: 'text',
        text:
          'This operation is PRICED and no accepted payment accompanied the request (HTTP 402, x402 ' +
          `protocol version ${err.x402Version ?? 'unstated'}).${why}\n\n` +
          'THIS SERVER CANNOT PAY. It holds no key and signs nothing, so it can neither create the ' +
          'payment authorization below nor authorise one on anybody’s behalf.\n\n' +
          'If you can sign, you may settle this yourself per the x402 protocol: sign an EIP-3009 ' +
          '`transferWithAuthorization` for one of the offers below, under that token’s own EIP-712 ' +
          'domain (`extra.name` / `extra.version`), and retry the SAME call with the resulting ' +
          'base64 PaymentPayload in an `X-PAYMENT` header — this server forwards it upstream ' +
          'unaltered and returns the settlement receipt. Otherwise a FairWins member can hand you a ' +
          'capability token instead (Settings ▸ API access): a valid token is checked first and is ' +
          'never charged.\n\n' +
          `Resource: ${JSON.stringify(err.resource ?? null)}\n` +
          `accepts: ${JSON.stringify(err.accepts, null, 2)}`,
      },
    ],
    isError: true,
  }
}

/**
 * A failed tool call, said plainly.
 *
 * The code is included because it is machine-readable and stable, the reason because it is the
 * gateway's own words, and the closing sentence because an agent reading only the first line must
 * still not conclude that the answer was "none".
 */
function failed(err) {
  if (err instanceof PaymentRequiredError) return paymentRequired(err)
  const code = err instanceof ApiError ? err.code : 'tool_failed'
  const reason = err instanceof ApiError ? err.reason : (err?.message ?? String(err))
  const retry = err instanceof ApiError && err.retryAfterSec ? ` Retry after ${err.retryAfterSec}s.` : ''
  return {
    content: [
      {
        type: 'text',
        text:
          `This read did not succeed: ${code} — ${reason}${retry}\n\n` +
          'This is an UNKNOWN, not an empty result. Do not report it as "none", "zero" or "no records"; ' +
          'say that the data could not be read and, where it matters, offer to try again.',
      },
    ],
    isError: true,
  }
}

/**
 * Run a tool body, turning any thrown failure into an honest `isError` result.
 *
 * `ctx` is the per-request context the transport built. `opts()` parks any settlement receipt on it,
 * so this reads it back after a success and the HTTP transport can return the original header bytes
 * to whoever paid.
 */
async function attempt(fn, ctx) {
  try {
    const value = await fn()
    return ok(value, ctx?.settlement ?? null)
  } catch (err) {
    return failed(err)
  }
}

const NO_INPUT = Object.freeze({ type: 'object', properties: {}, additionalProperties: false })

/**
 * @param {{api: ReturnType<import('./api.js').createApiClient>}} deps
 * @returns {Array<{name: string, title: string, description: string, inputSchema: object, call: Function}>}
 */
export function createTools({ api }) {
  /**
   * Per-call context carries the HTTP transport's per-request token override, if there was one —
   * and, since spec 096, an `X-PAYMENT` payload the caller wants forwarded and a place to park the
   * settlement receipt that comes back. Both are per-request and neither is ever stored.
   */
  const opts = (ctx) => ({
    token: ctx?.token,
    xPayment: ctx?.xPayment,
    onSettlement: ctx ? (settlement) => { ctx.settlement = settlement } : null,
  })

  return [
    {
      name: 'get_profile',
      title: 'Who this token belongs to',
      description:
        'Introspect the FairWins API token this server is using: the member account and key id it names, ' +
        'its scopes, when it was issued and when it expires, the account’s membership state, and whether the ' +
        'key has been revoked on the live gateway. Start here to confirm which member you are acting for. ' +
        'Requires the read:profile scope.',
      inputSchema: NO_INPUT,
      call: (_args, ctx) => attempt(() => api.get('/v1/member/me', opts(ctx)), ctx),
    },
    {
      name: 'get_membership',
      title: 'Membership tier',
      description:
        'Read the member’s FairWins membership tier and expiry on the membership reference chain. ' +
        'Membership lives on exactly one chain per environment, and the answer names it. The result is ' +
        'either read or unreadable — an unreadable tier is never reported as "no membership". ' +
        'Requires the read:membership scope.',
      inputSchema: NO_INPUT,
      call: (_args, ctx) => attempt(() => api.get('/v1/member/membership', opts(ctx)), ctx),
    },
    {
      name: 'get_wagers',
      title: 'The member’s wagers, per chain',
      description:
        'List the wagers this member is a party to. The result is a PER-CHAIN envelope, not a flat list: each ' +
        'chain resolves read, not-configured, or unreadable on its own, and the wagers array exists only on ' +
        'read. A chain with no indexer configured is not a chain with no wagers, and a chain whose indexer ' +
        'timed out is neither — report those states as stated. Requires the read:wagers scope.',
      inputSchema: {
        type: 'object',
        properties: {
          chainId: {
            type: 'integer',
            description: 'Restrict the read to one chain id (e.g. 137 for Polygon). Omit to read every chain the gateway has enabled.',
          },
          first: {
            type: 'integer',
            minimum: 1,
            maximum: 200,
            description: 'How many wagers to return per chain. Defaults to the gateway’s own page size.',
          },
        },
        additionalProperties: false,
      },
      call: (args, ctx) =>
        attempt(
          () => api.get('/v1/member/wagers', { ...opts(ctx), query: { chainId: args?.chainId, first: args?.first } }),
          ctx
        ),
    },
    {
      name: 'get_fees',
      title: 'Live platform fee rates',
      description:
        'Read the platform fee rates the FairWins FeeRouter publishes, in basis points. Each rate names its ' +
        'source: chain (read from the router) or env-fallback (the gateway’s configured default because the ' +
        'router was unset or unreachable). Quote a rate to a member only with its source; a rate that could ' +
        'not be confirmed must be described that way, never as zero. Requires the read:fees scope.',
      inputSchema: NO_INPUT,
      call: (_args, ctx) => attempt(() => api.get('/v1/member/fees', opts(ctx)), ctx),
    },
    {
      name: 'build_intent',
      title: 'Build unsigned typed data for a platform action',
      description:
        'Ask the gateway to assemble the EIP-712 typed data for a FairWins action (creating or accepting a ' +
        'wager, joining a pool, and so on) and return it UNSIGNED.\n\n' +
        'THIS SERVER CANNOT SIGN AND WILL NOT SIGN. It holds no key, no seed and no wallet, and nothing in ' +
        'this tool submits a transaction. What comes back is a quote for a signature: the member signs it in ' +
        'their own wallet, and then either relays it through the gateway or submits it themselves. Present the ' +
        'typed data to the member for review — including the amounts, the deadlines and the contract that will ' +
        'verify it — and never ask a member for a private key or a recovery phrase in order to "complete" this. ' +
        'The actor field is forced to the token’s own account; you cannot build an action on behalf of anyone ' +
        'else. Requires the build:intents scope.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The platform action to build, e.g. "createWager". The full list is in the fairwins://openapi resource.',
          },
          chainId: { type: 'integer', description: 'The chain the action will run on.' },
          params: {
            type: 'object',
            description:
              'The action’s own fields. The actor address is ignored if supplied — it is always the token’s account.',
            additionalProperties: true,
          },
        },
        required: ['action', 'chainId'],
        additionalProperties: false,
      },
      call: (args, ctx) =>
        attempt(
          () =>
            api.post('/v1/member/intents/build', {
              ...opts(ctx),
              body: { action: args?.action, chainId: args?.chainId, params: args?.params ?? {} },
            }),
          ctx
        ),
    },
    {
      name: 'get_gateway_status',
      title: 'Gateway health and which modules are live',
      description:
        'Read the FairWins gateway’s public /status: which optional modules are enabled right now, and whether ' +
        'a killswitch is active. Needs no token. Use it to tell "the member has nothing" apart from "this ' +
        'feature is switched off on this gateway" before reporting either. It also reports whether ' +
        'pay-per-request access (x402) is offered and what each operation class costs — which is how an agent ' +
        'holding no member token can learn the price WITHOUT spending anything.',
      inputSchema: NO_INPUT,
      call: (_args, _ctx) => attempt(() => api.get('/status', { auth: 'none' })),
    },
    {
      name: 'get_prediction_markets',
      title: 'Browse Polymarket prediction markets',
      description:
        'Search the live, tradable Polymarket markets the gateway proxies, ranked by volume. Public market ' +
        'data — no token needed, and nothing here places an order. Polygon only, because Polymarket runs ' +
        'nowhere else. If a member wants to trade one, send them to Predict in the FairWins app, where the ' +
        'taker builder fee is disclosed before they sign.',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Filter the volume-ranked page by question text.' },
          chainId: { type: 'integer', description: 'Chain id. Polygon (137) is the only supported value.', default: 137 },
          next: { type: 'string', description: 'Pagination cursor from a previous result.' },
        },
        additionalProperties: false,
      },
      call: (args, _ctx) =>
        attempt(() => {
          const chainId = Number.isInteger(args?.chainId) ? args.chainId : 137
          return api.get(`/v1/polymarket/${chainId}/markets`, {
            auth: 'none',
            query: { q: args?.q, next: args?.next },
          })
        }),
    },
    {
      name: 'get_perps_pairs',
      title: 'Perpetual-futures market data',
      description:
        'Read the perpetual-futures pairs the gateway aggregates from public venue APIs (Gains Network, GMX, ' +
        'Hyperliquid). Public read-only market data — no token needed, and FairWins ships no in-app perps ' +
        'execution, so there is nothing here to trade. Venues fail independently: a degraded venue is named ' +
        'and its pairs are omitted, and a missing metric stays null. Never render a null as a zero.',
      inputSchema: NO_INPUT,
      call: (_args, _ctx) => attempt(() => api.get('/v1/perps/pairs', { auth: 'none' })),
    },
  ]
}

/** The wire form of a tool, as `tools/list` returns it — the handler never leaves this process. */
export function describeTool(tool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }
}
