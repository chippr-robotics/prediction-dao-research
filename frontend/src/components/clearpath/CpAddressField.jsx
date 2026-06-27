import { useState } from 'react'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import { extractAddressFromScan } from '../../lib/addressBook/scanAddress'

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
  const [scanOpen, setScanOpen] = useState(false)

  // QR payloads can be a raw 0x, an EIP-681 `ethereum:` URI, or a share URL — extract the address from any.
  const handleScan = (decodedText) => {
    const addr = extractAddressFromScan(decodedText)
    if (addr) onChange(addr)
    setScanOpen(false)
  }

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
        <AddressBookButton disabled={disabled} onSelect={(entry) => onChange(entry.address)} />
        <button
          type="button"
          className="cp-icon-btn"
          onClick={() => setScanOpen(true)}
          disabled={disabled}
          title="Scan QR code"
          aria-label="Scan QR code"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z" />
          </svg>
        </button>
      </div>
      {hint && <span className="cp-row-sub">{hint}</span>}
      <QRScanner isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanSuccess={handleScan} />
    </div>
  )
}
