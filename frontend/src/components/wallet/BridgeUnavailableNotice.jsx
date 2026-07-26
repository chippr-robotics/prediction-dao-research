/**
 * BridgeUnavailableNotice (spec 067, US1 — T083) — the one place the Bridge surface
 * says "not right now", always with the reason.
 *
 * Reuses the platform's existing honest-unavailable pattern (`earn-unavailable`:
 * a `role="alert"` block that states what is off, what is unaffected, and offers a
 * retry where retrying can help) rather than inventing a bespoke surface, which is
 * what FR-052 asks for. It is presentational: the decision is made by
 * `useBridgeAvailability`, so the same notice serves the Transfer tab and any other
 * caller with the same vocabulary.
 *
 * Two things it must always get right:
 *   - it never implies a member's money is at risk. Nothing has been sent in any of
 *     these states, and transfers already on their way keep updating in
 *     `BridgeStatusList` regardless (FR-053);
 *   - operator-driven states carry "as of" their last read (FR-052) — a paused flag
 *     read four minutes ago is presented as exactly that, not as present-tense truth.
 */
import { BRIDGE_UNAVAILABLE, bridgeUnavailableCopy } from '../../lib/bridge/bridgeCopy'
import { BRIDGE_UNAVAILABLE_REASON } from '../../hooks/useBridgeAvailability'
import './BridgeStatus.css'

/**
 * Title + body per reason.
 *
 * Bodies come from `BRIDGE_UNAVAILABLE` wherever that vocabulary already covers the
 * state. The two deployment-state bodies live here because they describe THIS build's
 * contract deployment rather than anything the member-facing copy module models:
 * `bitcoin` and `no_protocol` are answered by `bridgeUnavailableCopy(chainId)`, which
 * names the networks that do work.
 */
const REASON_COPY = Object.freeze({
  [BRIDGE_UNAVAILABLE_REASON.BITCOIN]: {
    title: 'Bridging is not available for Bitcoin',
    retry: false,
  },
  [BRIDGE_UNAVAILABLE_REASON.NO_PROTOCOL]: {
    title: 'Bridging is not available on this network',
    retry: false,
  },
  [BRIDGE_UNAVAILABLE_REASON.ROUTER_UNDEPLOYED]: {
    title: 'Bridging is not switched on for this network yet',
    body:
      'The FairWins bridge contract has not been deployed to this network yet, so there is nothing to bridge through here. This is a setup step on our side, not a problem with your wallet — switch to a network where bridging is live, or check back later.',
    retry: false,
  },
  [BRIDGE_UNAVAILABLE_REASON.ROUTER_UNREACHABLE]: {
    title: 'Bridging is temporarily unavailable',
    body: BRIDGE_UNAVAILABLE.router,
    retry: true,
  },
  [BRIDGE_UNAVAILABLE_REASON.PAUSED]: {
    title: 'Bridging is paused',
    body: BRIDGE_UNAVAILABLE.paused,
    retry: true,
  },
  [BRIDGE_UNAVAILABLE_REASON.GATEWAY]: {
    title: 'Bridging is temporarily unavailable',
    body: BRIDGE_UNAVAILABLE.gateway,
    retry: true,
  },
})

function fmtAsOf(asOf) {
  if (!(Number(asOf) > 0)) return null
  try {
    return new Date(Number(asOf)).toLocaleTimeString()
  } catch {
    return null
  }
}

/**
 * @param {object} props
 * @param {string} props.reason a `BRIDGE_UNAVAILABLE_REASON`
 * @param {number|string} [props.chainId] the network being described
 * @param {number} [props.asOf] epoch ms of the read this state came from (FR-052)
 * @param {Function} [props.onRetry] re-read handler; the retry button is omitted without one
 */
export default function BridgeUnavailableNotice({ reason, chainId = null, asOf = null, onRetry = null }) {
  const copy = REASON_COPY[reason]
  // An unknown reason is still reported as unavailable — never silently rendered as
  // working, and never given an invented explanation (FR-054).
  const title = copy?.title || 'Bridging is unavailable'
  const body =
    copy?.body ||
    (reason === BRIDGE_UNAVAILABLE_REASON.BITCOIN || reason === BRIDGE_UNAVAILABLE_REASON.NO_PROTOCOL
      ? bridgeUnavailableCopy(chainId)
      : null) ||
    'Bridging is unavailable right now and we cannot say why, so we are not offering it rather than guessing. Nothing has been sent.'
  const asOfLabel = fmtAsOf(asOf)

  return (
    <div className="bridge-notice" role="alert">
      <p className="bridge-notice-title">{title}</p>
      <p>{body}</p>
      {asOfLabel && (
        <p className="bridge-notice-asof">
          As of {asOfLabel}, the last time we could check.
        </p>
      )}
      {copy?.retry && typeof onRetry === 'function' && (
        <button type="button" className="bridge-notice-action" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
