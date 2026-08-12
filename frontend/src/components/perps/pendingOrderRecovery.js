/**
 * The stuck-order recovery descriptor (spec 083, T035, US4).
 *
 * Its own module because `PerpsPendingOrders.jsx` may only export components
 * (`react-refresh/only-export-components`, the `components/miniapps/submitAppChecks.js`
 * convention) — and because this one function is the whole of the index-space defence on this
 * surface, which makes it worth testing directly rather than only through the DOM.
 */

/**
 * An order from `usePerpsOrders` → the `usePerpsTrade` descriptor that recovers it, or null when
 * there is nothing to offer.
 *
 * IT READS `order.recovery` AND NOTHING ELSE, and that is the point. Gains' TRADE index and
 * PENDING-ORDER index are both small integers, and passing one where the other belongs does not
 * revert — it acts on a DIFFERENT OBJECT (contracts/venue-calldata.md). `usePerpsOrders` puts a
 * BRANDED pending-order index on `order.recovery` only after proving the venue's own timeout; the
 * brand travels from here into `buildCancelOrderAfterTimeoutCall` unwrapped by anybody, and that
 * builder refuses a raw number and refuses a trade index. Widening this to read `order.venueRef`,
 * `order.raw` or any other field would put a second index in scope for a future edit to reach for,
 * which is exactly how the mistake gets made. Keep it narrow.
 *
 * The action is `'cancel'`, never `'recover'`: `lib/perps/orderState.js` keys two mappers on that
 * word to tell "the recovery I just sent executed" from "the order I was watching never ran" —
 * both venues announce those with ONE event, and the tracked action is the only thing that
 * separates them.
 *
 * Total: it runs from a click handler over whatever the venue reported, and a malformed order
 * yields no descriptor rather than a throw.
 */
export function recoveryDescriptor(order) {
  const recovery = order?.recovery
  if (!recovery || typeof recovery !== 'object') return null

  const base = { action: 'cancel', venue: recovery.venue, chainId: recovery.chainId }
  if (recovery.action === 'cancelOrderAfterTimeout') {
    return { ...base, params: { pendingOrderIndex: recovery.pendingOrderIndex } }
  }
  if (recovery.action === 'cancelOrder') {
    return { ...base, params: { orderKey: recovery.orderKey } }
  }
  return null
}
