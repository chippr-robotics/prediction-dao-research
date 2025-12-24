import { forwardRef } from 'react'
import styles from './Card.module.css'

/**
 * Card Component
 * 
 * Reusable card container with hover effects.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.hover - Enable hover effect
 * @param {Function} props.onClick - Click handler for interactive cards
 * @param {string} props.role - ARIA role (use 'button' for clickable cards)
 * @param {number} props.tabIndex - Tab index for keyboard navigation
 * @param {Function} props.onKeyDown - Keyboard event handler
 * @param {string} props.ariaLabel - Accessible label for interactive cards
 */
const Card = forwardRef(({ 
  children,
  className = '',
  hover = false,
  onClick,
  role,
  tabIndex,
  onKeyDown,
  ariaLabel,
  ...props
}, ref) => {
  const baseClass = styles.card
  const hoverClass = hover ? styles['card-hover'] : ''
  const interactiveClass = onClick ? styles['card-interactive'] : ''
  
  const classes = `${baseClass} ${hoverClass} ${interactiveClass} ${className}`.trim()

  const handleKeyDown = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onClick(e)
    }
    if (onKeyDown) {
      onKeyDown(e)
    }
  }

  return (
    <div
      ref={ref}
      className={classes}
      onClick={onClick}
      role={role || (onClick ? 'button' : undefined)}
      tabIndex={onClick ? (tabIndex ?? 0) : tabIndex}
      onKeyDown={onClick || onKeyDown ? handleKeyDown : undefined}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </div>
  )
})

Card.displayName = 'Card'

export default Card
