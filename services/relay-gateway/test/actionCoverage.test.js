import { describe, it, expect } from 'vitest'
import { INTENT_ACTIONS } from '@fairwins/intent-types'
import { ACTIONS } from '../src/intent/intentTypes.js'

/**
 * Spec 075, FR-024/FR-026 — the client's action set and the gateway's implemented set must agree.
 *
 * Before spec 075 these two tables were maintained independently, and they had already diverged:
 * the frontend declared `invalidateNonce` and the gateway had never implemented it, so a relayed
 * invalidateNonce would have come back "unknown action". Nobody noticed because nothing calls it.
 *
 * Now both derive from one table, and any divergence is either a test failure or a DECLARED
 * decision with a reason. That is the point: the gap itself was never the danger — the gap being
 * invisible was.
 */

/**
 * Actions the client may declare that the gateway deliberately does NOT relay.
 * Every entry needs a reason. An unexplained entry is how this gate rots into an allowlist.
 */
const CLIENT_ONLY_ACTIONS = {
  invalidateNonce:
    'Not relayable, deliberately. The real cancel path is a DIRECT contract write — ' +
    'useIntentAction.invalidate() calls registry.invalidateNonce(nonce) and the member pays gas — ' +
    'which is correct: invalidation must not depend on a relayer being reachable, since its whole ' +
    'purpose is revoking an intent you no longer trust. ' +
    'Implementing it here would also require a client fix first: signIntent() overwrites the ' +
    'struct nonce with a fresh random uniquenessMarker (intentClient.js, "message.nonce = nonce"), ' +
    'so a relayed call could not express WHICH nonce to burn and would silently invalidate an ' +
    'unused one. See the spec 075 US4 notes.',
}

describe('gateway implements every relayable client action (spec 075)', () => {
  it('implements every declared action that is not explicitly client-only', () => {
    const missing = Object.keys(INTENT_ACTIONS).filter((a) => !ACTIONS[a] && !CLIENT_ONLY_ACTIONS[a])
    expect(
      missing,
      'Declared in @fairwins/intent-types but not relayable, so a member attempting one gets ' +
        '"unknown action". Implement them, or add them to CLIENT_ONLY_ACTIONS with a reason:\n  ' +
        missing.join('\n  '),
    ).toEqual([])
  })

  it('does not implement actions nobody declares', () => {
    const orphans = Object.keys(ACTIONS).filter((a) => !INTENT_ACTIONS[a])
    expect(
      orphans,
      'The gateway relays these but no client declares them — dead relay surface, or a stale ' +
        'action name:\n  ' + orphans.join('\n  '),
    ).toEqual([])
  })

  it('keeps every client-only exception justified and still relevant', () => {
    for (const [action, reason] of Object.entries(CLIENT_ONLY_ACTIONS)) {
      expect(INTENT_ACTIONS[action], `${action} is exempted but no longer declared — drop the exemption`).toBeTruthy()
      expect(ACTIONS[action], `${action} is now implemented — remove it from CLIENT_ONLY_ACTIONS`).toBeUndefined()
      expect(reason.length, `${action} needs a real reason, not a placeholder`).toBeGreaterThan(40)
    }
  })

  it('agrees with the gateway on the struct each action signs', () => {
    for (const [action, meta] of Object.entries(INTENT_ACTIONS)) {
      const impl = ACTIONS[action]
      if (!impl) continue
      expect(impl.typeName, `${action}: gateway signs ${impl.typeName}, client signs ${meta.primaryType}`)
        .toBe(meta.primaryType)
      expect(impl.actorField, `${action}: actor field disagrees between client and gateway`)
        .toBe(meta.actorField)
    }
  })
})
