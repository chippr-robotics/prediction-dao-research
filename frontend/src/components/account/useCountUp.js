import { useEffect, useRef, useState } from 'react'

function canAnimate() {
  if (typeof window === 'undefined') return false
  if (typeof requestAnimationFrame !== 'function') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

/**
 * Animate a number from its previous value to `value` with an ease-out cubic,
 * mirroring the landing-page LiveStats pattern. Falls back to the final value
 * immediately when animation isn't supported or the user prefers reduced
 * motion (spec 020 FR-011/FR-018).
 *
 * State is only updated inside the rAF callback (never synchronously within the
 * effect body), and the non-animatable path returns `value` directly.
 */
export function useCountUp(value, { duration = 1000 } = {}) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const animatable = canAnimate()

  useEffect(() => {
    if (!animatable) {
      fromRef.current = value
      return undefined
    }
    const from = fromRef.current
    const to = Number(value) || 0
    if (from === to) return undefined

    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        fromRef.current = to
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, animatable, duration])

  return animatable ? display : value
}
