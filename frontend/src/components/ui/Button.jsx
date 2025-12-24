import { forwardRef } from 'react'
import styles from './Button.module.css'

/**
 * Button Component
 * 
 * Reusable button component with multiple variants and states.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {'primary'|'secondary'} props.variant - Button style variant
 * @param {boolean} props.loading - Loading state
 * @param {boolean} props.disabled - Disabled state
 * @param {React.ReactNode} props.children - Button content
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onClick - Click handler
 * @param {string} props.type - Button type (button, submit, reset)
 * @param {string} props.ariaLabel - Accessible label for icon-only buttons
 */
const Button = forwardRef(({ 
  variant = 'primary',
  loading = false,
  disabled = false,
  children,
  className = '',
  onClick,
  type = 'button',
  ariaLabel,
  ...props
}, ref) => {
  const baseClass = styles.button
  const variantClass = variant === 'secondary' ? styles['button-secondary'] : styles['button-primary']
  const loadingClass = loading ? styles['button-loading'] : ''
  const disabledState = disabled || loading
  
  const classes = `${baseClass} ${variantClass} ${loadingClass} ${className}`.trim()

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabledState}
      aria-label={ariaLabel}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <>
          <span className={styles['button-spinner']} aria-hidden="true"></span>
          <span className={styles['button-text']}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
