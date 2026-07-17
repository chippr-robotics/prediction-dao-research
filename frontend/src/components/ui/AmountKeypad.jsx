import { useId, useRef, useEffect, useCallback } from 'react'
import './AmountKeypad.css'

/**
 * AmountKeypad — the shared payments-style amount control (spec 052).
 *
 * Renders an oversized "hero" amount read-out plus an on-screen number pad, the
 * way Cash App / Venmo open on the amount you're about to send. It is a
 * CONTROLLED component: the parent sheet owns the canonical stake string and
 * passes it as `value`; every accepted edit is reported via `onChange(next)`.
 * The keypad owns entry *format* only (one decimal separator, cents precision);
 * business validation (positivity, min/max, balance) stays in the parent.
 *
 * Shown on all viewports (FR-005) — the pad keys are real buttons so pointer,
 * touch, and keyboard all work, and hardware digit/decimal/Backspace keys apply
 * the same edits while the pad stays visible.
 *
 * Contract: specs/052-payments-style-wager-create/contracts/amount-keypad.md
 */

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

/**
 * Apply one keypad edit to the current amount string. Pure — returns the next
 * canonical string (may equal the input for ignored keystrokes).
 */
function applyAmountKey(value, key, maxFractionDigits = 2) {
  const str = value == null ? '' : String(value)

  if (key === 'back') return str.slice(0, -1)

  if (key === '.') {
    if (str.includes('.')) return str // only one decimal separator
    if (str === '') return '0.' // leading decimal → 0.
    return `${str}.`
  }

  if (/^[0-9]$/.test(key)) {
    // Replace a lone leading zero so "0" + "5" → "5" (not "05").
    if (str === '0') return key === '0' ? '0' : key
    if (str.includes('.')) {
      const frac = str.split('.')[1] ?? ''
      if (frac.length >= maxFractionDigits) return str // cents precision cap
    }
    return str + key
  }

  return str
}

const BackspaceIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M21 5H8.5a2 2 0 0 0-1.6.8l-4.2 5.6a1 1 0 0 0 0 1.2l4.2 5.6a2 2 0 0 0 1.6.8H21a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
    />
    <path d="M17 9.5 12.5 14M12.5 9.5 17 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

function AmountKeypad({
  value = '',
  onChange,
  prefix = '$',
  token = null,
  tokenSlot = null,
  disabled = false,
  maxFractionDigits = 2,
  id,
  ariaLabel = 'Amount',
  autoFocus = false,
}) {
  const reactId = useId()
  const baseId = id || reactId
  const groupRef = useRef(null)

  const str = value == null ? '' : String(value)
  const displayValue = str === '' ? '0' : str
  const isZero = !(Number(str) > 0)
  const announced = [displayValue, token].filter(Boolean).join(' ')

  const press = useCallback((key) => {
    if (disabled) return
    const next = applyAmountKey(str, key, maxFractionDigits)
    if (next !== str) onChange?.(next)
  }, [disabled, str, maxFractionDigits, onChange])

  const handleKeyDown = useCallback((e) => {
    if (disabled) return
    if (e.key === 'Backspace') { e.preventDefault(); press('back') }
    else if (e.key === '.' || e.key === ',') { e.preventDefault(); press('.') }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key) }
  }, [disabled, press])

  useEffect(() => {
    if (autoFocus) groupRef.current?.focus()
  }, [autoFocus])

  return (
    <div
      className="amount-keypad"
      role="group"
      aria-label={ariaLabel}
      ref={groupRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="amount-keypad-display">
        <div
          className={`amount-keypad-hero${isZero ? ' is-zero' : ''}`}
          data-testid="amount-keypad-hero"
          id={`${baseId}-hero`}
          aria-hidden="true"
        >
          {prefix && <span className="amount-keypad-prefix">{prefix}</span>}
          <span className="amount-keypad-value">{displayValue}</span>
        </div>
        {/* A host can slot an interactive currency control (e.g. a token
            dropdown) directly under the amount in place of the static pill;
            the sr-only announcement still uses `token` for the live value. */}
        {tokenSlot
          ? <div className="amount-keypad-token-slot">{tokenSlot}</div>
          : token && <span className="amount-keypad-token">{token}</span>}
        <span className="sr-only" role="status" aria-live="polite">{announced}</span>
      </div>

      <div className="amount-keypad-pad">
        {PAD_KEYS.map((key) => {
          if (key === 'back') {
            return (
              <button
                key="back"
                type="button"
                className="amount-keypad-key amount-keypad-key--fn"
                id={`${baseId}-key-back`}
                aria-label="Delete"
                disabled={disabled}
                onClick={() => press('back')}
              >
                <BackspaceIcon />
              </button>
            )
          }
          if (key === '.') {
            return (
              <button
                key="."
                type="button"
                className="amount-keypad-key amount-keypad-key--fn"
                id={`${baseId}-key-decimal`}
                aria-label="Decimal point"
                disabled={disabled}
                onClick={() => press('.')}
              >
                .
              </button>
            )
          }
          return (
            <button
              key={key}
              type="button"
              className="amount-keypad-key"
              id={`${baseId}-key-${key}`}
              disabled={disabled}
              onClick={() => press(key)}
            >
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default AmountKeypad
