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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <img 
          src="/assets/fairwins_no-text_logo.svg"
          alt=""
          className={styles['clover-svg']}
          aria-hidden="true"
        />
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
