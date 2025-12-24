import { forwardRef } from 'react'
import styles from './Input.module.css'

/**
 * Input Component
 * 
 * Reusable input field with accessibility support.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {string} props.type - Input type (text, email, password, number, etc.)
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.disabled - Disabled state
 * @param {boolean} props.required - Required field
 * @param {string} props.id - Input ID (required for label association)
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.error - Error state
 * @param {string} props.ariaDescribedBy - ID of description element
 * @param {string} props.ariaInvalid - Invalid state for screen readers
 */
const Input = forwardRef(({ 
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  id,
  className = '',
  error = false,
  ariaDescribedBy,
  ariaInvalid,
  ...props
}, ref) => {
  const baseClass = styles.input
  const errorClass = error ? styles['input-error'] : ''
  
  const classes = `${baseClass} ${errorClass} ${className}`.trim()

  return (
    <input
      ref={ref}
      type={type}
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      className={classes}
      aria-required={required}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid !== undefined ? ariaInvalid : (error ? 'true' : 'false')}
      {...props}
    />
  )
})

Input.displayName = 'Input'

export default Input
