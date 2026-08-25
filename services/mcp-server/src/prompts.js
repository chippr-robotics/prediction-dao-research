/**
 * MCP prompts (spec 095).
 *
 * Two instruction templates, both written to the same rule the tools are: an unknown is reported as
 * an unknown. A briefing that quietly turns a timed-out chain into "no positions" is worse than no
 * briefing, because the member has no way to tell that anything went wrong.
 *
 * Prompts are user-initiated by design — a client surfaces them as a command the member picks — so
 * they may instruct, but they must never instruct the model to act on the member's behalf. Neither
 * of these asks for a signature, and both say what the assistant is not allowed to claim.
 */
import { JsonRpcError, ERROR_CODES } from './jsonrpc.js'

const PROMPTS = [
  {
    name: 'wager-review',
    title: 'Review my FairWins wagers',
    description:
      'Walk through the member’s open wagers on one chain (or every chain), calling out deadlines that are ' +
      'close and anything that could not be read.',
    arguments: [
      {
        name: 'chainId',
        description: 'Restrict the review to one chain id (e.g. 137). Omit to review every enabled chain.',
        required: false,
      },
    ],
    build: (args) => {
      const chainId = args?.chainId
      const scope = chainId ? `chain ${chainId}` : 'every chain the gateway has enabled'
      return [
        'Review my FairWins wagers and tell me what needs my attention.',
        '',
        `Scope: ${scope}.`,
        '',
        'Do this:',
        `1. Call get_profile to confirm which account this token belongs to, then get_wagers${chainId ? ` with chainId ${chainId}` : ''}.`,
        '2. Group what you find by state: awaiting acceptance, live, resolvable, and anything already settled.',
        '3. Call out every approaching deadline — an accept deadline and a resolve deadline are different, so name which one.',
        '4. Read the per-chain envelope literally. A chain whose state is "unreadable" or "not-configured" has NOT ' +
          'told us there are no wagers there; list those chains separately as "could not be read" and do not fold ' +
          'them into a total.',
        '5. If any tool returns an error, say what failed and what is therefore unknown. Do not estimate around it.',
        '',
        'Do not offer to place, accept, resolve or cancel anything on my behalf — you cannot sign, and this server ' +
        'cannot submit. If an action is worth taking, say which one and that I will sign it myself in the FairWins app.',
      ].join('\n')
    },
  },
  {
    name: 'portfolio-briefing',
    title: 'Brief me on my FairWins account',
    description:
      'A short standing briefing: membership, wagers across chains, the live fee rates, and the health of the ' +
      'gateway itself — with everything that could not be read named as such.',
    arguments: [],
    build: () =>
      [
        'Give me a short briefing on my FairWins account.',
        '',
        'Gather, in this order:',
        '1. get_profile — which account and key this is, its scopes, and when the key expires. Mention the expiry if it is within a week.',
        '2. get_membership — tier and expiry. If membership is unreadable, say so; unreadable is never "no membership".',
        '3. get_wagers — across every enabled chain.',
        '4. get_fees — quote each rate WITH its source ("chain" or "env-fallback"). A rate that could not be confirmed is not zero.',
        '5. get_gateway_status — if a module is switched off or a killswitch is active, say so, because that explains gaps that are not mine.',
        '',
        'Then write at most eight lines of plain English. Lead with anything time-sensitive. End with a single line ' +
        'listing what could not be read, or "everything read cleanly" if nothing failed.',
        '',
        'You are describing my account, not managing it. You cannot sign or submit anything, so do not imply an action ' +
        'has been taken or offer to take one — and never ask me for a private key or recovery phrase.',
      ].join('\n'),
  },
]

const BY_NAME = new Map(PROMPTS.map((p) => [p.name, p]))

export function createPrompts() {
  return {
    list() {
      return PROMPTS.map(({ name, title, description, arguments: args }) => ({
        name,
        title,
        description,
        arguments: args,
      }))
    },
    get(name, args = {}) {
      const found = BY_NAME.get(name)
      if (!found) {
        throw new JsonRpcError(ERROR_CODES.INVALID_PARAMS, `no such prompt: ${name}`, {
          available: PROMPTS.map((p) => p.name),
        })
      }
      return {
        description: found.description,
        messages: [{ role: 'user', content: { type: 'text', text: found.build(args) } }],
      }
    },
  }
}
