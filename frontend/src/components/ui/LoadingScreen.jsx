import { useEffect, useState } from 'react'
import styles from './LoadingScreen.module.css'

/**
 * LoadingScreen Component
 * 
 * Universal animated loading screen featuring the FairWins 4-leaf clover logo.
 * The clover expands/unfolds from the center, followed by a checkmark animation.
 * 
 * Features:
 * - Smooth SVG animations optimized for performance
 * - Respects prefers-reduced-motion for accessibility
 * - Supports light/dark themes automatically
 * - Multiple size variants and inline mode
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Controls visibility of the loading screen
 * @param {string} props.text - Loading text to display (default: "Loading")
 * @param {'small'|'medium'|'large'} props.size - Size variant (default: 'medium')
 * @param {boolean} props.inline - If true, renders inline instead of fullscreen overlay
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onAnimationComplete - Callback when initial animation completes
 * 
 * @example
 * // Fullscreen loading overlay
 * <LoadingScreen visible={isLoading} />
 * 
 * @example
 * // Inline loading indicator
 * <LoadingScreen visible={isLoading} inline size="small" />
 * 
 * @example
 * // Custom text
 * <LoadingScreen visible={isLoading} text="Fetching data" />
 */
const LoadingScreen = ({ 
  visible = true,
  text = 'Loading',
  size = 'medium',
  inline = false,
  className = '',
  onAnimationComplete
}) => {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    if (visible) {
      // Initial animation completes after ~2s (all leaves + checkmark)
      const timer = setTimeout(() => {
        setAnimated(true)
        if (onAnimationComplete) {
          onAnimationComplete()
        }
      }, 2000)
      
      return () => clearTimeout(timer)
    } else {
      setAnimated(false)
    }
  }, [visible, onAnimationComplete])

  const containerClasses = [
    styles['loading-screen'],
    styles[size],
    inline ? styles.inline : '',
    className
  ].filter(Boolean).join(' ')

  const logoClasses = [
    styles['logo-container'],
    animated ? styles.animated : ''
  ].filter(Boolean).join(' ')

  // FairWins brand color - Kelly Green from design system
  const cloverColor = 'var(--brand-primary, #2D7A4F)'
  const checkColor = 'var(--brand-secondary, #34A853)'

  return (
    <div 
      className={containerClasses}
      role="status"
      aria-live="polite"
      aria-busy={visible}
      aria-hidden={!visible}
      aria-label={`${text}...`}
    >
      <div className={logoClasses}>
        <svg 
          className={styles['clover-svg']}
          viewBox="0 0 120 120" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Four-leaf clover - each leaf is a circle positioned at cardinal points */}
          
          {/* Top leaf */}
          <circle 
            className={styles['clover-leaf']}
            cx="60" 
            cy="30" 
            r="18" 
            fill={cloverColor}
          />
          
          {/* Right leaf */}
          <circle 
            className={styles['clover-leaf']}
            cx="90" 
            cy="60" 
            r="18" 
            fill={cloverColor}
          />
          
          {/* Bottom leaf */}
          <circle 
            className={styles['clover-leaf']}
            cx="60" 
            cy="90" 
            r="18" 
            fill={cloverColor}
          />
          
          {/* Left leaf */}
          <circle 
            className={styles['clover-leaf']}
            cx="30" 
            cy="60" 
            r="18" 
            fill={cloverColor}
          />
          
          {/* Center circle to create clover shape */}
          <circle 
            cx="60" 
            cy="60" 
            r="12" 
            fill={cloverColor}
          />
          
          {/* Checkmark in center - drawn with stroke animation */}
          <path 
            className={styles.checkmark}
            d="M 52 60 L 57 66 L 70 50" 
            stroke={checkColor}
            strokeWidth="4" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      
      {text && (
        <div className={styles['loading-text']}>
          {text}
          <span className={styles['loading-dots']} aria-hidden="true"></span>
        </div>
      )}
      
      {/* Screen reader announcement */}
      <span className="sr-only">{text}...</span>
    </div>
  )
}

export default LoadingScreen
