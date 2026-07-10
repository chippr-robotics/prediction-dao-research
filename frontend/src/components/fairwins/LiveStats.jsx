import { useEffect, useRef, useState } from 'react'
import { useSiteStats } from '../../hooks/useSiteStats'
import { STAT_CARDS } from '../../constants/siteStats'
import SensitiveValue from '../common/SensitiveValue'

/** Compact number formatting: 1500 → "1.5K", 1_200_000 → "1.2M". */
function formatCompact(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `${trim(num / 1_000_000)}M`
  if (num >= 1_000) return `${trim(num / 1_000)}K`
  return String(Math.round(num))
}

/** One decimal place, dropping a trailing ".0". */
function trim(n) {
  return n.toFixed(1).replace(/\.0$/, '')
}

function formatStat(n, format) {
  if (format === 'usd') return `$${formatCompact(n)}`
  return formatCompact(n)
}

/**
 * A single stat value that counts up from 0 → target once the band is
 * visible. Falls back to the final value immediately when animation isn't
 * supported (no IntersectionObserver / reduced motion / test env).
 */
function StatValue({ value, format, animatable, visible }) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (!animatable || !visible) return

    let raf
    const duration = 1200
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setAnimated(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setAnimated(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, animatable, visible])

  // Render the final value directly unless we're mid count-up animation.
  const display = animatable && visible ? animated : value
  const formatted = formatStat(display, format)
  // Only the USD-denominated stat (Value Wagered) is a monetary figure that
  // tilt-to-hide should mask; counts stay visible.
  return format === 'usd'
    ? <SensitiveValue className="livestat-number">{formatted}</SensitiveValue>
    : <span className="livestat-number">{formatted}</span>
}

/**
 * LiveStats — the animated, on-chain stats band shown directly under the
 * hero on the landing page. See hooks/useSiteStats for the data sources and
 * baseline-floor behaviour.
 */
function LiveStats() {
  const { stats, isLive } = useSiteStats()
  const ref = useRef(null)

  // Decide once whether we can run the count-up animation at all.
  const [animatable] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!('IntersectionObserver' in window)) return false
    if (typeof requestAnimationFrame !== 'function') return false
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  })
  const [visible, setVisible] = useState(!animatable)

  useEffect(() => {
    if (!animatable || !ref.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [animatable])

  return (
    <section className="livestats" ref={ref}>
      <div className="livestats-inner">
        <div className="livestats-eyebrow">
          <span className="livestats-dot" />
          {isLive ? 'Live on-chain' : 'Platform activity'}
        </div>
        <div className="livestats-grid">
          {STAT_CARDS.map(({ key, label, format }) => (
            <div className="livestat" key={key}>
              <StatValue
                value={stats[key] ?? 0}
                format={format}
                animatable={animatable}
                visible={visible}
              />
              <span className="livestat-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default LiveStats
