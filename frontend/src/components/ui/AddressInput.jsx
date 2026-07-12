import { forwardRef, useEffect, useCallback } from 'react'
import { useEnsResolution, useEnsReverseLookup } from '../../hooks/useEnsResolution'
import { useTagResolution } from '../../hooks/useTagResolution'
import { formatTag, isValidTag } from '../../lib/tags/normalizeTag'
import { TagStatus } from '../../lib/tags/resolveTag'
import AddressInputBookAddon from './AddressInputBookAddon'
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
  enableAddressBook = false,
  chainId,
  ...props
}, ref) => {
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

  // Wager tag forward-resolution (spec 054). Additive: only engages for tag-shaped input that is
  // neither an address nor an ENS name. A resolved ACTIVE tag becomes the effective resolved address;
  // any other status is surfaced as a non-committable message (FR-011/022). Registry unreachable → soft
  // no-op, raw-address entry unaffected (FR-013).
  const tagRes = useTagResolution(value, { chainId })
  const effectiveResolvedAddress = (tagRes.isTag && tagRes.address) ? tagRes.address : resolvedAddress

  // Notify parent of resolved address changes (tag-resolved address included)
  useEffect(() => {
    if (onResolvedChange) {
      onResolvedChange(effectiveResolvedAddress)
    }
  }, [effectiveResolvedAddress, onResolvedChange])

  const handleChange = useCallback((e) => {
    if (onChange) {
      onChange(e)
    }
  }, [onChange])

  // Select a saved contact: populate the field and notify of the resolved address.
  const handleBookPick = useCallback((addr) => {
    if (onChange) onChange({ target: { value: addr } })
    if (onResolvedChange) onResolvedChange(addr)
  }, [onChange, onResolvedChange])

  // Determine error state. A tag-shaped input suppresses the ENS "invalid address/name" error and
  // instead surfaces the tag's own status ("No such tag", "address changing", etc.) when non-ACTIVE.
  const tagError = tagRes.isTag && !tagRes.isLoading && !!tagRes.message && tagRes.status !== TagStatus.ACTIVE
  const hasError = externalError || tagError || (value && !isLoading && !tagRes.isTag && resolutionError)
  const displayError = externalErrorMessage || (tagError ? tagRes.message : (!tagRes.isTag ? resolutionError : undefined))

  // Determine status indicator
  const showLoading = isLoading || isLookingUp || tagRes.isLoading
  const showSuccess = effectiveResolvedAddress && !hasError && !showLoading
  const showEnsLabel = isEns && !isLoading
  const showTagResolved = tagRes.isTag && !!tagRes.address && !showLoading && !hasError

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
  const resolvedHintId = id ? `${id}-resolved-hint` : undefined
  const ensNameHintId = id ? `${id}-ens-hint` : undefined
  const describedBy = [
    ariaDescribedBy,
    hasError && errorId,
    (showResolvedAddress && isEns && resolvedAddress && !isLoading && !hasError) && resolvedHintId,
    (showResolvedAddress && isAddress && ensName && !isLookingUp) && ensNameHintId
  ]
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
            <span className={styles.ensLabel} aria-label="ENS name detected">ENS</span>
          )}
        </div>
      </div>

      {/* Resolved address preview */}
      {showResolvedAddress && isEns && resolvedAddress && !isLoading && !hasError && (
        <div id={resolvedHintId} className={styles.resolvedHint}>
          <span className={styles.resolvedLabel}>Resolves to:</span>
          <code className={styles.resolvedAddress}>{formatAddress(resolvedAddress)}</code>
        </div>
      )}

      {/* Show ENS name for direct address input */}
      {showResolvedAddress && isAddress && ensName && !isLookingUp && (
        <div id={ensNameHintId} className={styles.resolvedHint}>
          <span className={styles.ensNameLabel}>{ensName}</span>
        </div>
      )}

      {/* Wager tag resolved preview (spec 054): show the tag + full resolved address for confirmation
          before any value-bearing action (FR-011), with the verification marker for verified tags. */}
      {showResolvedAddress && showTagResolved && (
        <div className={styles.resolvedHint}>
          <span className={styles.resolvedLabel}>
            {isValidTag(value) ? formatTag(value.trim().replace(/^%/, '').toLowerCase()) : 'Tag'} resolves to:
          </span>
          <code className={styles.resolvedAddress}>{formatAddress(tagRes.address)}</code>
          {tagRes.verified && (
            <span className={styles.ensLabel} aria-label="Verified business tag" title="Verified">✓</span>
          )}
        </div>
      )}

      {/* Error message */}
      {hasError && displayError && (
        <div id={errorId} className={styles.errorMessage} role="alert">
          {displayError}
        </div>
      )}

      {/* Address-book search/select + inline restriction warning (opt-in) */}
      {enableAddressBook && (
        <AddressInputBookAddon
          query={value}
          chainId={chainId}
          resolvedAddress={resolvedAddress || (isAddress ? value?.trim() : null)}
          onPick={handleBookPick}
        />
      )}
    </div>
  )
})

AddressInput.displayName = 'AddressInput'

export default AddressInput
