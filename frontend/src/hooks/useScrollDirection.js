import { useState, useEffect } from 'react'

/**
 * Custom hook to detect scroll direction
 * @param {number} threshold - Minimum scroll pixels before direction changes
 * @returns {Object} - Scroll information including direction and position
 */
export function useScrollDirection(threshold = 10) {
  const [scrollDirection, setScrollDirection] = useState('up')
  const [scrollY, setScrollY] = useState(0)
  const [prevScrollY, setPrevScrollY] = useState(0)

  useEffect(() => {
    let ticking = false

    const updateScrollDirection = () => {
      const currentScrollY = window.scrollY

      if (Math.abs(currentScrollY - prevScrollY) < threshold) {
        ticking = false
        return
      }

      setScrollDirection(currentScrollY > prevScrollY ? 'down' : 'up')
      setScrollY(currentScrollY)
      setPrevScrollY(currentScrollY)
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection)
        ticking = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => window.removeEventListener('scroll', onScroll)
  }, [prevScrollY, threshold])

  return {
    scrollDirection,
    scrollY,
    isScrollingDown: scrollDirection === 'down',
    isScrollingUp: scrollDirection === 'up'
  }
}

/**
 * Custom hook to detect if user has scrolled past a certain point
 * @param {number} offset - Scroll offset in pixels
 * @returns {boolean} - Whether scrolled past the offset
 */
export function useScrollPast(offset = 100) {
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsPast(window.scrollY > offset)
    }

    handleScroll() // Check initial state
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [offset])

  return isPast
}
