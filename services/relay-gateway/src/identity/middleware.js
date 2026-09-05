/**
 * Caller-identity middleware (spec 105, contracts/gateway-api.md Part 1).
 *
 * SLICE 1 RESOLVES AND DELIBERATELY DOES NOT ENFORCE. Every request gains `req.caller` and an
 * `X-FairWins-Tier` response header; no status code changes. That is the point: the tier model can
 * be validated against real traffic before anything depends on it, so if the model is wrong the
 * cost is a wrong header rather than refused members. Enforcement arrives in a later slice, behind
 * its own switch, once resolution is proven.
 *
 * ── ORDERING, AND WHY EACH POSITION IS LOAD-BEARING ───────────────────────────────────────────
 *
 *   CORS/preflight -> body parse -> ORIGIN LOCK -> [ CALLER IDENTITY ] -> route + quota -> handler
 *
 * AFTER the origin lock. The lock is a cheap string comparison that rejects non-edge traffic;
 * resolution may make a network call. Resolving first would let an off-edge caller cost us an
 * upstream round trip per request — turning an identity layer into an amplifier.
 *
 * BEFORE route dispatch. Identity must resolve for a route that does not exist, or an
 * unauthenticated prober could enumerate the route surface by the difference between "404" and
 * "403", which is a map of exactly which paths are worth attacking.
 *
 * NEVER on a preflight. `OPTIONS` short-circuits at CORS above, because a browser cannot attach
 * credentials to a preflight — it carries none by definition. If resolution ever saw one it would
 * resolve `anonymous` every time and pollute the metering it exists to make honest.
 *
 * ── THE HEADER IS DIAGNOSTIC, NEVER AN INPUT ─────────────────────────────────────────────────
 *
 * `X-FairWins-Tier` reports what the gateway concluded. It is never read back, and it deliberately
 * names no application, because the web cannot prove one (FR-005). A caller sending it is ignored.
 */

import { createResolver, subjectFor, ANONYMOUS_IDENTITY } from './resolve.js'
import { lookupRoute } from './routeTable.js'

export const TIER_HEADER = 'X-FairWins-Tier'

/**
 * @param {{enabled: boolean, killSwitch?: {isActive: () => boolean}}} options
 * @param {Array<{kind: string, verify: Function}>} verifiers
 */
export function createIdentityMiddleware({ enabled, killSwitch = null } = {}, verifiers = []) {
  const resolve = createResolver(verifiers)

  return async function identityMiddleware(req, res, next) {
    // A disabled layer must be INERT, not permissive-looking. `req.caller` is still populated, so
    // downstream code never has to branch on "is identity configured" — it reads one shape always.
    // FR-015: the disabled state is disclosed loudly at boot and in the gated /status, never
    // inferred from behaviour that happens to look the same.
    if (!enabled || (killSwitch && killSwitch.isActive())) {
      req.caller = { ...ANONYMOUS_IDENTITY, evidence: [], enforcement: 'off' }
      req.callerSubject = subjectFor(req.caller, req)
      res.setHeader(TIER_HEADER, req.caller.tier)
      return next()
    }

    try {
      const identity = await resolve(req)
      req.caller = { ...identity, enforcement: 'observe' }
      req.callerSubject = subjectFor(identity, req)
      // Attach the route declaration so quota attribution and (later) enforcement read the SAME
      // lookup this middleware did. Two lookups is two chances to disagree.
      req.callerRoute = lookupRoute(req.method, req.path)
      res.setHeader(TIER_HEADER, identity.tier)
      return next()
    } catch (err) {
      // Resolution itself failing is a bug in this layer, and a bug here must not take down the
      // gateway. Degrade to anonymous and continue: in slice 1 nothing depends on the answer, and
      // when enforcement lands, an anonymous verdict refuses gated routes and still serves reads —
      // which is the correct direction for a fault in the identity layer itself.
      req.caller = { ...ANONYMOUS_IDENTITY, evidence: [], enforcement: 'degraded' }
      req.callerSubject = subjectFor(req.caller, req)
      res.setHeader(TIER_HEADER, req.caller.tier)
      return next()
    }
  }
}
