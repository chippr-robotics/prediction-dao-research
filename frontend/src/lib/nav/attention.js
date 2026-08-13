/**
 * Attention flash — the "it's right here" cue a search result leaves behind.
 *
 * Landing on `/wallet?tab=earn&view=lend` is only half an answer: the member typed "morpho" and
 * arrived somewhere they have never been, on a screen with several cards on it. A brief highlight
 * on the thing they searched for closes that gap, which is why every indexed destination doubles
 * as a marker id — a surface opts in by rendering `data-attention="<destination id>"`.
 *
 * Three properties this deliberately has:
 *   - It WAITS for its target. The surface it belongs to usually mounts a beat after the route
 *     changes (a `?view=` switch, an accordion opening), so a one-shot query would miss it. It
 *     polls briefly and then gives up in silence — a destination whose surface carries no marker
 *     still navigates correctly; it just does not flash.
 *   - It NEVER moves focus. The member is reading, not tabbing, and stealing focus from wherever
 *     they were would be a worse outcome than not pointing at anything.
 *   - It respects `prefers-reduced-motion` — the pulse becomes a still outline of the same
 *     duration (handled in AttentionFocus.css), and the scroll stops being smooth.
 */

export const ATTENTION_PARAM = 'focus'
export const ATTENTION_ATTR = 'data-attention'
export const ATTENTION_CLASS = 'attention-flash'

/** How long the highlight stays on. Long enough to notice, short enough not to become chrome. */
export const FLASH_MS = 1800

/** How long to wait for a target that has not mounted yet before giving up. */
export const WAIT_MS = 2500

const POLL_MS = 60

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

/** The element a destination id marks, or null. */
export function findAttentionTarget(id, root = document) {
  if (!id) return null
  const selector = `[${ATTENTION_ATTR}="${String(id).replace(/["\\]/g, '\\$&')}"]`
  return root.querySelector(selector)
}

/**
 * Highlight the element marked `id` once it exists.
 * @returns {() => void} cleanup — cancels the wait and removes the highlight early.
 */
export function flashAttention(id, { flashMs = FLASH_MS, waitMs = WAIT_MS } = {}) {
  if (!id || typeof document === 'undefined') return () => {}

  let element = null
  let waitTimer = null
  let flashTimer = null
  let deadlineTimer = null

  const clear = () => {
    if (element) {
      element.classList.remove(ATTENTION_CLASS)
      element = null
    }
    window.clearTimeout(waitTimer)
    window.clearTimeout(flashTimer)
    window.clearTimeout(deadlineTimer)
  }

  const start = (found) => {
    element = found
    element.classList.add(ATTENTION_CLASS)
    // `block: 'center'` rather than 'start': a card scrolled flush to the top of the viewport
    // reads as the page having jumped, not as something being pointed at.
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    })
    flashTimer = window.setTimeout(() => {
      element?.classList.remove(ATTENTION_CLASS)
      element = null
    }, flashMs)
  }

  const poll = () => {
    const found = findAttentionTarget(id)
    if (found) return start(found)
    waitTimer = window.setTimeout(poll, POLL_MS)
  }

  deadlineTimer = window.setTimeout(() => window.clearTimeout(waitTimer), waitMs)
  poll()

  return clear
}
