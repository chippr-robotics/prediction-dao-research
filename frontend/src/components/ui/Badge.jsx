import styles from './Badge.module.css'

/**
 * Badge Component
 * 
 * Status badge component with semantic color variants.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Badge content
 * @param {'success'|'warning'|'danger'|'neutral'} props.variant - Badge color variant
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.icon - Optional icon to display (emoji or text)
 */
const Badge = ({ 
  children,
  variant = 'neutral',
  className = '',
  icon,
  ...props
}) => {
  const baseClass = styles.badge
  const variantClass = styles[`badge-${variant}`]
  
  const classes = `${baseClass} ${variantClass} ${className}`.trim()

  return (
    <span className={classes} {...props}>
      {icon && <span className={styles['badge-icon']} aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}

export default Badge
