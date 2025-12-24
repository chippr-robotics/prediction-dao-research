import styles from './HelperText.module.css'

/**
 * HelperText Component
 * 
 * Small descriptive text for forms and other UI elements.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Helper text content
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.id - ID for aria-describedby association
 * @param {'helper'|'error'} props.variant - Text variant
 */
const HelperText = ({ 
  children,
  className = '',
  id,
  variant = 'helper',
  ...props
}) => {
  const baseClass = styles['helper-text']
  const variantClass = variant === 'error' ? styles['helper-text-error'] : ''
  
  const classes = `${baseClass} ${variantClass} ${className}`.trim()

  return (
    <small 
      id={id}
      className={classes} 
      {...props}
    >
      {children}
    </small>
  )
}

export default HelperText
