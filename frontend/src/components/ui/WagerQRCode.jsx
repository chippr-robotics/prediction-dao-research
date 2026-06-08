import { QRCodeSVG } from 'qrcode.react'
import './WagerQRCode.css'

/**
 * Shared QR renderer for every share surface (spec 009).
 *
 * Renders dark modules on a solid white quiet-zone background so the code is
 * reliably scannable regardless of the surrounding modal's theme, and embeds
 * NO center logo. The previous surfaces passed a ~237 KB SVG to
 * `imageSettings.src`; that embedded `<image>` failed to paint inside the QR on
 * mobile webviews and produced the broken-image placeholder. Dropping it (the
 * logo is decorative) satisfies FR-002 (never a broken image) and FR-004
 * (QR survives a missing logo) by construction.
 *
 * Props:
 *  - value (string, required): the share/acceptance URL to encode.
 *  - size (number): pixel size of the QR. Default 200.
 *  - ariaLabel (string): accessible name for the QR image. Default "QR code".
 *  - className (string): optional extra class on the white container.
 */
function WagerQRCode({ value, size = 200, ariaLabel = 'QR code', className }) {
  // No valid link → render nothing; the surface decides the fallback message
  // (FR-008). Never render a broken or partial QR.
  if (!value) return null

  return (
    <div className={`wager-qr${className ? ` ${className}` : ''}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="H"
        marginSize={2}
        fgColor="#0E141B"
        bgColor="#FFFFFF"
        aria-label={ariaLabel}
      />
    </div>
  )
}

export default WagerQRCode
