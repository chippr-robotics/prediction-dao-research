import UniversalAssetSelect from '../ui/UniversalAssetSelect'

/**
 * Asset picker for the Transfer ("trade") form. As of spec 064 this is a thin wrapper
 * over the shared UniversalAssetSelect, so the Transfer view lists the SAME
 * cross-network portfolio assets it always has — now each shown with the nested asset
 * logo (glyph + network sub-badge) that the Earn page and the home Pay/Request/Wager
 * selectors use. Behavior is unchanged: eligibility + per-asset gasless truth are
 * decided by the caller (useTransfer) and passed in; this component never re-derives
 * routing.
 *
 * Kept as a named component (rather than deleting it) so existing call sites and their
 * accessible label ("Asset to send") are untouched.
 */
export default function TransferAssetSelect({
  options = [],
  value,
  onChange,
  isGasless = () => false,
  disabled = false,
}) {
  return (
    <UniversalAssetSelect
      label="Asset to send"
      options={options}
      value={value}
      onChange={onChange}
      isGasless={isGasless}
      disabled={disabled}
    />
  )
}
