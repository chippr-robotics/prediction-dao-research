import { useEffect, useRef, useState } from 'react'
import { useSiteStats } from '../../hooks/useSiteStats'
import { STAT_CARDS } from '../../constants/siteStats'
import { formatCompact } from '../../utils/currency'

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
  const [display, setDisplay] = useState(animatable ? 0 : value)

  useEffect(() => {
    if (!animatable) {
      setDisplay(value)
      return
    }
    if (!visible) return

    let raf
    const duration = 1200
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, animatable, visible])

  return <span className="livestat-number">{formatStat(display, format)}</span>
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
