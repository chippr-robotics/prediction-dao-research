import { usePrivacy } from '../../hooks/usePrivacy'
import './SensitiveValue.css'

/**
 * SensitiveValue — masks a monetary figure when tilt-to-hide is active (spec 046).
 *
 * When `usePrivacy().hidden` is true it renders a fixed neutral placeholder in
 * place of the value. Critically, the real value string is NOT rendered into the
 * DOM while masked, so it cannot be copied, and the element's accessible name is
 * "hidden" (the bullets are aria-hidden) so assistive tech does not announce the
 * value (FR-013). The placeholder is a constant regardless of the value, so it
 * never leaks the magnitude or digit count (FR-012). When shown, the exact
 * children render unchanged (display-only — the value is never altered, FR-011).
 *
 * Wrap the formatted output at the render site, e.g.
 *   <SensitiveValue className="account-tile-value">{formatUsd(n)}</SensitiveValue>
 */
const PLACEHOLDER = '••••'

function SensitiveValue({
  as: Tag = 'span',
  className,
  children,
  hiddenLabel = 'hidden',
  ...rest
}) {
  const { hidden } = usePrivacy()

  if (hidden) {
    const maskedClass = ['sensitive-value', 'sensitive-value--masked', className]
      .filter(Boolean)
      .join(' ')
    return (
      <Tag className={maskedClass} aria-label={hiddenLabel} title={hiddenLabel} {...rest}>
        <span aria-hidden="true">{PLACEHOLDER}</span>
      </Tag>
    )
  }

  return (
    <Tag className={className} {...rest}>
      {children}
    </Tag>
  )
}

export default SensitiveValue
