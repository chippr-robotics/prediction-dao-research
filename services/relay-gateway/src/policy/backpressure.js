/**
 * Bounded-queue back-pressure (FR-009): when the in-flight depth reaches the configured bound,
 * shed load explicitly with 429 backpressure + Retry-After instead of accepting unbounded work
 * that then fails en masse. The client reacts by offering self-submit (FR-016).
 */
export function createBackpressure({ maxQueueDepth, depthFn, retryAfterSec = 15 }) {
  return {
    /** @returns {{allowed: true} | {allowed: false, retryAfterSec: number}} */
    check() {
      if (depthFn() >= maxQueueDepth) {
        return { allowed: false, retryAfterSec }
      }
      return { allowed: true }
    },
  }
}
