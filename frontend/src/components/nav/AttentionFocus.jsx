import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ATTENTION_PARAM, flashAttention } from '../../lib/nav/attention'
import './AttentionFocus.css'

/**
 * AttentionFocus — reads `?focus=<id>` off the current route and briefly highlights the element
 * marked `data-attention="<id>"`, so a member who arrived here from the menu search can see which
 * thing they searched for.
 *
 * Mounted once for the whole in-app tree (App.jsx) rather than per panel: the marker is the
 * contract, and any surface can opt in by rendering one — no wiring, no per-section hook.
 *
 * The parameter is stripped once consumed (replace, so no history entry): the flash is an ARRIVAL
 * cue, and leaving it in the URL would re-fire it on every back-navigation to this page and would
 * quietly ride along in any link the member copies. The hash is left exactly as it is — that is
 * what keeps an accordion card open, and it is addressable state rather than a one-shot cue.
 *
 * The in-flight flash is held in a ref rather than returned as the effect's cleanup, because
 * stripping the parameter re-runs this very effect: a cleanup tied to `location` would cancel the
 * highlight in the same tick it was started. It is cancelled on unmount, and superseded when a
 * new target arrives.
 */
export default function AttentionFocus() {
  const location = useLocation()
  const navigate = useNavigate()
  const cancelRef = useRef(null)
  // The cue fires on arrival. Re-running it for the same URL on an unrelated re-render (a parent
  // state change, a preference commit) would make the page pulse at random.
  const lastFlashed = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const target = params.get(ATTENTION_PARAM)
    if (!target) {
      lastFlashed.current = null
      return
    }
    const key = `${location.pathname}${location.search}${location.hash}`
    if (lastFlashed.current === key) return
    lastFlashed.current = key

    cancelRef.current?.()
    cancelRef.current = flashAttention(target)

    params.delete(ATTENTION_PARAM)
    const query = params.toString()
    navigate(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`, { replace: true })
  }, [location.pathname, location.search, location.hash, navigate])

  useEffect(() => () => cancelRef.current?.(), [])

  return null
}
