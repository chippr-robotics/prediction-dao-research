import { QRCodeSVG } from 'qrcode.react'
import {
  DEFAULT_QR_COLOR_ID,
  getQRColorEntry,
} from '../../utils/qrColorPreference'

/**
 * QR renderer for the user's own wallet address (spec 011).
 *
 * Sibling of WagerQRCode (spec 009) — that component stays contractually
 * pinned to #0E141B-on-white for wager-share surfaces; this one renders the
 * same robust parameters (level "H", 2-module quiet zone, solid #FFFFFF
 * background, NO embedded center image) with a foreground chosen from the
 * curated QR_COLOR_PALETTE. The background is never customizable: dark-on-white
 * is what keeps every palette option scannable (contract C3/C7).
 *
 * The value is encoded verbatim — the EIP-55 checksummed address exactly as
 * the wallet provides it, no URI scheme, no case transformation (research D5).
 *
 * Props:
 *  - value (string, required): the wallet address to encode.
 *  - paletteId (string): QR_COLOR_PALETTE id; unknown ids fall back to midnight.
 *  - size (number): pixel size of the QR. Default 240.
 *  - ariaLabel (string): accessible name; defaults to one naming the
 *    shortened address.
 *  - className (string): optional extra class on the white container.
 */
function AddressQRCode({
  value,
  paletteId = DEFAULT_QR_COLOR_ID,
  size = 240,
  ariaLabel,
  className,
}) {
  // No address → render nothing; the surface shows the connect prompt (C6).
  if (!value) return null

  const { fg } = getQRColorEntry(paletteId)
  const label =
    ariaLabel ||
    `QR code for your wallet address ${value.slice(0, 6)}…${value.slice(-4)}`

  return (
    <div className={`address-qr${className ? ` ${className}` : ''}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="H"
        marginSize={2}
        fgColor={fg}
        bgColor="#FFFFFF"
        role="img"
        aria-label={label}
      />
    </div>
  )
}

export default AddressQRCode
