import { useState, useEffect } from 'react'

/**
 * Custom hook to detect media query matches
 * @param {string} query - CSS media query string
 * @returns {boolean} - Whether the media query matches
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    
    // Set initial value
    setMatches(mediaQuery.matches)

    // Define handler
    const handler = (event) => {
      setMatches(event.matches)
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      // Legacy browsers
      mediaQuery.addListener(handler)
      return () => mediaQuery.removeListener(handler)
    }
  }, [query])

  return matches
}

/**
 * Custom hook to detect if device is mobile (< 768px)
 * @returns {boolean} - Whether the device is mobile
 */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)')
}

/**
 * Custom hook to detect if device is tablet (768px - 1024px)
 * @returns {boolean} - Whether the device is tablet
 */
export function useIsTablet() {
  return useMediaQuery('(min-width: 768px) and (max-width: 1024px)')
}

/**
 * Custom hook to detect device orientation
 * @returns {'portrait' | 'landscape'} - Current orientation
 */
export function useOrientation() {
  const isPortrait = useMediaQuery('(orientation: portrait)')
  return isPortrait ? 'portrait' : 'landscape'
}

/**
 * Custom hook to get comprehensive device info
 * @returns {Object} - Device information including size and orientation
 */
export function useDeviceInfo() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const orientation = useOrientation()
  
  return {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    orientation,
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape'
  }
}
