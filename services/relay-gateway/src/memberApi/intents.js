/**
 * Unsigned typed-data builder for the member API (spec 095).
 *
 * WHAT THIS IS, EXACTLY: a QUOTE for a signature. It assembles `{ domain, types, primaryType,
 * message }` from `@fairwins/intent-types` — the same table the SPA signs from and the same one
 * `intent/verify.js` verifies against — and hands it back. It signs nothing, submits nothing, and
 * holds nothing. The member (or their agent, holding the member's key) signs it and sends the
 * result to the EXISTING public `POST /v1/intents`, which recovers the signer itself and is the
 * only thing that decides whether the relay will pay for it.
 *
 * THE ACTOR IS THE TOKEN'S ACCOUNT, ALWAYS. `signIntent` on the client sets
 * `message[actorField] = await signer.getAddress()` and `verifyIntent` re-derives it from the
 * recovered signature, so an "on behalf of" address would not merely be a policy hole here — it
 * would produce typed data that fails at the gateway the moment it is submitted. Forcing it means
 * a caller cannot even build a payload that names someone else.
 *
 * TWO ACTIONS ARE NOT BUILDABLE, AND BOTH REFUSALS ARE THE POINT:
 *
 *   · `invalidateNonce` — 400 `unsupported_action`. It is the ONE action whose whole purpose is
 *     to work when the relayer cannot be trusted or reached, so its real path is a direct contract
 *     write the member pays for. It is also not currently expressible over the relay at all:
 *     `signIntent` overwrites the struct nonce with a fresh uniqueness marker, so a relayed call
 *     could not say WHICH nonce to burn and would silently invalidate an unused one. Returning
 *     typed data for it would be handing back something that cannot do the job it names.
 *   · `poolJoin` — `authOnly`. There is no action struct: the EIP-3009 authorization IS the intent.
 *     So the response returns the EIP-3009 shape (what to authorise, and to whom) instead of
 *     synthesising a struct that no contract verifies.
 */
import { INTENT_ACTIONS, INTENT_TYPES, RECEIVE_WITH_AUTHORIZATION_TYPES, domainFor } from '@fairwins/intent-types'
import { GatewayError } from '../errors.js'

/** Not buildable, with the reason served to the caller verbatim. */
const NOT_BUILDABLE = {
  invalidateNonce:
    'invalidateNonce is deliberately not built or relayed here. Cancelling an intent must not depend on a ' +
    'relayer being reachable — its whole purpose is revoking an intent you no longer trust — so it is a ' +
    'direct contract write the member submits and pays for: call invalidateNonce(nonce) on the wager ' +
    'registry from your own wallet.',
}

const SELF_SUBMIT_NOTE =
  'Relaying is optional and always has been. If this gateway is unreachable, or declines, submit the same ' +
  'action directly from your own wallet — every FairWins flow keeps a self-submit path, and no member action ' +
  'depends on the relay being up.'

/**
 * @param {object} config full gateway config (reads .chains)
 * @param {{action: string, chainId: number, params: object, account: string}} req
 */
export function buildIntent(config, { action, chainId, params, account }) {
  if (typeof action !== 'string' || action.length === 0) {
    throw new GatewayError(400, 'bad_request', 'body.action is required')
  }
  if (NOT_BUILDABLE[action]) {
    throw new GatewayError(400, 'unsupported_action', NOT_BUILDABLE[action])
  }
  const meta = INTENT_ACTIONS[action]
  if (!meta) {
    throw new GatewayError(400, 'unsupported_action', `no such action "${action}"; see /v1/member/openapi.json for the list`)
  }

  const chainCfg = config.chains[chainId]
  if (!chainCfg) {
    throw new GatewayError(400, 'unsupported_action', `"${action}" cannot be built for chain ${chainId}: that chain is not enabled on this gateway`)
  }
  // The pinned target: the address the relayer would call, resolved from the deployment record, not
  // from anything the caller sent. An action whose contract is not pinned on this chain is simply
  // not available here — say so rather than emitting typed data that `verifyIntent` would refuse
  // with `target_not_allowlisted` several steps later.
  const target = chainCfg.targetsByKey[meta.verifier]
  if (!target) {
    // Refused HERE, naming the action and the chain, rather than returning typed data the relay
    // would reject downstream with `target_not_allowlisted` — a caller must not be handed a payload
    // to sign that has nowhere to go.
    throw new GatewayError(
      400,
      'unsupported_action',
      `"${action}" needs the ${meta.verifier} contract, which is not recorded for chain ${chainId} on this gateway`
    )
  }

  const supplied = params && typeof params === 'object' && !Array.isArray(params) ? params : {}

  // ---- authOnly (poolJoin): the EIP-3009 authorization IS the intent -------------------------
  if (meta.authOnly) {
    if (!chainCfg.paymentSupported) {
      throw new GatewayError(
        400,
        'unsupported_action',
        `"${action}" cannot be built for chain ${chainId}: its token has no EIP-3009 leg, so there is no gasless payment path. Submit this action from your own wallet.`
      )
    }
    const to = meta.authToParam ? supplied[meta.authToParam] : target
    if (typeof to !== 'string') {
      throw new GatewayError(400, 'bad_request', `params.${meta.authToParam} is required for "${action}" and must be an address`)
    }
    return {
      action,
      chainId,
      authOnly: true,
      // The money leg binds to the CLONE, not the factory: the token enforces `to == msg.sender`,
      // which is what stops a relayer redirecting the funds.
      typedData: {
        domain: {
          name: chainCfg.tokenDomain.name,
          version: chainCfg.tokenDomain.version,
          chainId,
          verifyingContract: chainCfg.paymentToken,
        },
        types: RECEIVE_WITH_AUTHORIZATION_TYPES,
        primaryType: 'ReceiveWithAuthorization',
        message: {
          from: account,
          to,
          value: supplied.value ?? null,
          validAfter: supplied.validAfter ?? 0,
          validBefore: supplied.validBefore ?? null,
          nonce: supplied.nonce ?? null,
        },
      },
      target,
      note:
        `"${action}" carries no action struct — the EIP-3009 authorization is the whole intent. Fill in value, ` +
        'validBefore and a random 32-byte nonce, sign it, and submit it as the intent’s `authorization` with ' +
        '`uniquenessMarker` equal to that same nonce.',
      submitVia: { relay: '/v1/intents', selfSubmit: SELF_SUBMIT_NOTE },
    }
  }

  // ---- the ordinary case: one flat EIP-712 struct ---------------------------------------------
  const fields = INTENT_TYPES[meta.primaryType]
  if (!fields) {
    // Unreachable while the parity gate is green; a loud 503 beats emitting `types: undefined`.
    throw new GatewayError(503, 'upstream_unavailable', `the struct for "${action}" is not available on this gateway`)
  }

  // Domain/target split (pools): the signature is verified by the CLONE, the transaction targets the
  // FACTORY. Both are returned, because a caller that conflated them would sign something no
  // contract verifies.
  const domainKey = meta.domainVerifier ?? meta.verifier
  const verifyingContract = meta.verifyingContractParam ? supplied[meta.verifyingContractParam] : target
  if (meta.verifyingContractParam && typeof verifyingContract !== 'string') {
    throw new GatewayError(
      400,
      'bad_request',
      `params.${meta.verifyingContractParam} is required for "${action}" — it is the contract that verifies the signature`
    )
  }

  const message = {}
  const missing = []
  for (const f of fields) {
    if (f.name === meta.actorField) {
      // FORCED. Never read from `supplied`, whatever it contains.
      message[f.name] = account
      continue
    }
    if (f.name === 'nonce' || f.name === 'validAfter' || f.name === 'validBefore') {
      // Left to the caller: the nonce doubles as the relay's uniqueness marker and the validity
      // window is the member's own consent to a deadline. The gateway inventing either would be
      // choosing on their behalf.
      message[f.name] = supplied[f.name] ?? (f.name === 'validAfter' ? 0 : null)
      continue
    }
    if (supplied[f.name] === undefined) missing.push(f.name)
    else message[f.name] = supplied[f.name]
  }
  if (missing.length > 0) {
    throw new GatewayError(400, 'bad_request', `"${action}" needs these params: ${missing.join(', ')}`)
  }

  return {
    action,
    chainId,
    authOnly: false,
    typedData: {
      domain: domainFor(domainKey, chainId, verifyingContract),
      types: { [meta.primaryType]: fields },
      primaryType: meta.primaryType,
      message,
    },
    // The transaction target — the pinned, allow-listed address. For pools this is the factory and
    // differs from the domain's verifyingContract above; that split is deliberate and not
    // simplifiable.
    target,
    actorField: meta.actorField,
    intentClass: meta.intentClass,
    ...(meta.intentClass === 'payment'
      ? {
          note:
            'This is a payment-class action: it also needs an EIP-3009 authorization, signed under the token’s own ' +
            'domain, whose nonce equals both the struct’s `nonce` and the submitted `uniquenessMarker`. Sign both legs ' +
            'with one marker.',
        }
      : {}),
    submitVia: { relay: '/v1/intents', selfSubmit: SELF_SUBMIT_NOTE },
  }
}

/** Every action this endpoint will build, for the OpenAPI enum and the assistant's system prompt. */
export function buildableActions() {
  return Object.keys(INTENT_ACTIONS)
    .filter((a) => !NOT_BUILDABLE[a])
    .sort()
}

/** Actions that exist but are deliberately refused, with their reasons — documented, not hidden. */
export const REFUSED_ACTIONS = Object.freeze({ ...NOT_BUILDABLE })
