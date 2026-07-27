// Spec 068 (US5) — the one address input every Protect surface uses: owner rows, owner changes,
// load-by-address, transfer recipients and rule destinations.
//
// Owner addresses are the highest-stakes addresses a member ever types — a typo'd owner can strand a
// vault's funds — so Protect stops hand-rolling raw <input>s and reuses the platform's proven entry:
// AddressInput (validation + ENS/callsign resolution + ARIA contract), the address book, and the QR
// scanner (FR-006). Book names surface through AddressInput's own resolution (FR-007).
//
// `onChange` receives the raw address STRING (not an event) so it drops cleanly into list-item
// setters like `updateOwner(i, value)`.

import { useState } from 'react'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import { extractAddressFromScan } from '../../lib/addressBook/scanAddress'

export default function CustodyAddressField({
  id,
  label,
  srOnlyLabel = false,
  value,
  onChange,
  onResolvedChange,
  chainId,
  placeholder = '0x…, %callsign, or ENS name',
  disabled = false,
  hint,
  selfAddress = null,
  error,
  errorMessage,
}) {
  const [scanOpen, setScanOpen] = useState(false)

  // QR payloads can be a raw 0x, an EIP-681 `ethereum:` URI, or a share URL — extract from any.
  const handleScan = (decodedText) => {
    const addr = extractAddressFromScan(decodedText)
    if (addr) onChange(addr)
    setScanOpen(false)
  }

  return (
    <div className="custody-address-field">
      {label && (
        <label className={srOnlyLabel ? 'sr-only' : 'custody-label'} htmlFor={id}>
          {label}
        </label>
      )}
      <div className="custody-address-row">
        <AddressInput
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onResolvedChange={onResolvedChange}
          chainId={chainId}
          placeholder={placeholder}
          disabled={disabled}
          error={error}
          errorMessage={errorMessage}
        />
        {selfAddress && (
          <button
            type="button"
            className="custody-icon-btn"
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
          className="custody-icon-btn"
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
      {hint && <span className="custody-hint">{hint}</span>}
      <QRScanner isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanSuccess={handleScan} />
    </div>
  )
}
