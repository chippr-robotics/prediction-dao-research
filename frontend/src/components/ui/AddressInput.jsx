import { forwardRef, useState, useEffect, useCallback } from 'react'
import { useEnsResolution, useEnsReverseLookup } from '../../hooks/useEnsResolution'
import { isValidEthereumAddress, isEnsName } from '../../utils/validation'
import styles from './AddressInput.module.css'

/**
 * AddressInput Component
 *
 * An enhanced input field that supports both Ethereum addresses and ENS names.
 * Features:
 * - Real-time ENS name resolution (name -> address)
 * - Reverse ENS lookup for addresses (address -> name display)
 * - Loading indicator during resolution
 * - Error display for invalid/unresolvable inputs
 * - Accessible with proper ARIA attributes
 *
 * @param {Object} props - Component props
 * @param {string} props.value - Input value (address or ENS name)
 * @param {Function} props.onChange - Change handler for raw input value
 * @param {Function} props.onResolvedChange - Callback with resolved address (optional)
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.disabled - Disabled state
 * @param {boolean} props.required - Required field
 * @param {string} props.id - Input ID (required for label association)
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.error - External error state
 * @param {string} props.errorMessage - External error message to display
 * @param {string} props.ariaDescribedBy - ID of description element
 * @param {boolean} props.showResolvedAddress - Show resolved address preview
 */
const AddressInput = forwardRef(({
  value = '',
  onChange,
  onResolvedChange,
  placeholder = '0x... or ENS name (e.g., vitalik.eth)',
  disabled = false,
  required = false,
  id,
  className = '',
  error: externalError = false,
  errorMessage: externalErrorMessage,
  ariaDescribedBy,
  showResolvedAddress = true,
  label,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false)

  // Use ENS resolution hook
  const {
    resolvedAddress,
    isLoading,
    error: resolutionError,
    isEns,
    isAddress
  } = useEnsResolution(value)

  // Use reverse lookup to show ENS name for addresses
  const {
    ensName,
    isLoading: isLookingUp
  } = useEnsReverseLookup(isAddress ? value?.trim() : null)

  // Notify parent of resolved address changes
  useEffect(() => {
    if (onResolvedChange) {
      onResolvedChange(resolvedAddress)
    }
  }, [resolvedAddress, onResolvedChange])

  const handleChange = useCallback((e) => {
    if (onChange) {
      onChange(e)
    }
  }, [onChange])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
  }, [])

  // Determine error state
  const hasError = externalError || (value && !isLoading && resolutionError)
  const displayError = externalErrorMessage || resolutionError

  // Determine status indicator
  const showLoading = isLoading || isLookingUp
  const showSuccess = resolvedAddress && !hasError && !showLoading
  const showEnsLabel = isEns && !isLoading

  // Format address for display
  const formatAddress = (addr) => {
    if (!addr || addr.length < 10) return addr
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Combine classes
  const inputClasses = [
    styles.input,
    hasError ? styles.inputError : '',
    showSuccess ? styles.inputSuccess : '',
    showLoading ? styles.inputLoading : '',
    className
  ].filter(Boolean).join(' ')

  // Generate unique IDs for ARIA
  const errorId = id ? `${id}-error` : undefined
  const hintId = id ? `${id}-hint` : undefined
  const describedBy = [ariaDescribedBy, hasError && errorId, hintId]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className={styles.container}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}

      <div className={styles.inputWrapper}>
        <input
          ref={ref}
          type="text"
          id={id}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          aria-required={required}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck="false"
          {...props}
        />

        {/* Status indicators */}
        <div className={styles.statusContainer}>
          {showLoading && (
            <span className={styles.spinner} aria-label="Resolving..." />
          )}
          {showSuccess && !showLoading && (
            <span className={styles.successIcon} aria-label="Valid address">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
          {showEnsLabel && !showLoading && (
            <span className={styles.ensLabel}>ENS</span>
          )}
        </div>
      </div>

      {/* Resolved address preview */}
      {showResolvedAddress && isEns && resolvedAddress && !isLoading && !hasError && (
        <div id={hintId} className={styles.resolvedHint}>
          <span className={styles.resolvedLabel}>Resolves to:</span>
          <code className={styles.resolvedAddress}>{formatAddress(resolvedAddress)}</code>
        </div>
      )}

      {/* Show ENS name for direct address input */}
      {showResolvedAddress && isAddress && ensName && !isLookingUp && (
        <div id={hintId} className={styles.resolvedHint}>
          <span className={styles.ensNameLabel}>{ensName}</span>
        </div>
      )}

      {/* Error message */}
      {hasError && displayError && (
        <div id={errorId} className={styles.errorMessage} role="alert">
          {displayError}
        </div>
      )}
    </div>
  )
})

AddressInput.displayName = 'AddressInput'

export default AddressInput
