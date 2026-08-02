/*
 * TWO INPUT AFFORDANCES ARE GONE, for different reasons.
 *
 * THE QR SCANNER, on size. Bundling it cost 710 KB of an 805 KB package — 88% of the bytes every
 * member fetches, for one convenience on a field they can paste into. A mini-app package is
 * content-addressed and immutable, so that weight is paid on every version, forever. If scanning
 * a DAO address turns out to matter, it belongs as a HOST capability: the host already owns a
 * scanner, and camera access is an origin-level concern (`Permissions-Policy: camera=(self)`)
 * rather than something each package should carry its own copy of.
 *
 * THE ADDRESS BOOK PICKER, on privacy.
 *
 * It reads the member's saved contacts, and that is their contact list — a privacy grant no
 * mini-app should hold, and one this app does not need: the value being entered here is a DAO
 * CONTRACT address, not a person. Members paste it or scan it. If a future app has a real case for
 * reading contacts, that is a host capability with its own permission and its own review, not
 * something a package reaches by importing a button.
 *
 * The QR scanner is copied in instead of imported: it depends only on React and `html5-qrcode`,
 * with no host state and no context identity, so a bundled copy behaves identically. Its camera
 * access rides the host origin's `Permissions-Policy: camera=(self)`.
 */
// [size probe] scanner temporarily removed

// Spec 030 (US3/US5) — a ClearPath address input wired to the app's address book + QR scanner, so any
// recipient / target / token / governor address can be picked from saved contacts or scanned from a QR code
// (the same affordances used on the wager-create form). Keeps the ClearPath `cp-*` styling. `onChange`
// receives the raw address string (not an event), to drop cleanly into both `setState` and action-patch wiring.
export default function CpAddressField({
  id,
  label,
  value,
  onChange,
  placeholder = '0x…',
  disabled = false,
  hint,
  selfAddress = null,
}) {
  return (
    <div className="cp-field">
      {label && (
        <label className="cp-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="cp-addr-row">
        <input
          id={id}
          className="cp-input cp-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck="false"
        />
        {selfAddress && (
          <button
            type="button"
            className="cp-self-btn"
            onClick={() => onChange(selfAddress)}
            disabled={disabled}
            title="Use my connected wallet address"
          >
            Self
          </button>
        )}
      </div>
      {hint && <span className="cp-row-sub">{hint}</span>}

    </div>
  )
}
