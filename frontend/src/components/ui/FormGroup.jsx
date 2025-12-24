import { forwardRef } from 'react'
import Input from './Input'
import HelperText from './HelperText'
import styles from './FormGroup.module.css'

/**
 * FormGroup Component
 * 
 * Complete form field with label, input, helper text, and error handling.
 * Follows brand design system and accessibility guidelines.
 * 
 * @param {Object} props - Component props
 * @param {string} props.label - Label text
 * @param {string} props.id - Input ID (required for label association)
 * @param {string} props.type - Input type
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.required - Required field
 * @param {boolean} props.disabled - Disabled state
 * @param {string} props.helperText - Helper text below input
 * @param {string} props.error - Error message (shows error state if provided)
 * @param {string} props.className - Additional CSS classes
 */
const FormGroup = forwardRef(({ 
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  helperText,
  error,
  className = '',
  ...props
}, ref) => {
  const helperId = helperText ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`${styles['form-group']} ${className}`.trim()}>
      <label htmlFor={id} className={styles['form-label']}>
        {label}
        {required && (
          <span className={styles['form-required']} aria-label="required">
            *
          </span>
        )}
      </label>
      
      <Input
        ref={ref}
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        error={!!error}
        ariaDescribedBy={describedBy}
        ariaInvalid={error ? 'true' : 'false'}
        {...props}
      />
      
      {helperText && !error && (
        <HelperText id={helperId} variant="helper">
          {helperText}
        </HelperText>
      )}
      
      {error && (
        <HelperText id={errorId} variant="error" role="alert" aria-live="assertive">
          {error}
        </HelperText>
      )}
    </div>
  )
})

FormGroup.displayName = 'FormGroup'

export default FormGroup
