import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useClipboard } from '../../hooks/useClipboard'
import { getQRColorPreference, getQRColorEntry } from '../../utils/qrColorPreference'
import '../ui/AddressQRModal.css'

/**
 * RequestQRModal (spec 058 US2) — presents a generated payment request as a
 * scannable QR in the SAME branded dialog chrome as AddressQRModal (the app's
 * existing "show a QR" surface), rather than inline in the panel. This keeps
 * the Request view compact (nothing pushed under the bottom nav) and matches
 * the receive-address modal users already know.
 *
 * Props:
 *  - isOpen (bool): nothing renders when false.
 *  - onClose (fn): close button, backdrop, and Escape.
 *  - uri (string): the EIP-681 payment-request URI to encode.
 *  - amount (string) / symbol (string): for the human-readable caption.
 *  - note (string): optional; shown as plain text under the code.
 */
function RequestQRModal({ isOpen, onClose, uri, amount, symbol, note }) {
  const { copied, error: copyError, copy } = useClipboard()
  const closeButtonRef = useRef(null)
  const triggerRef = useRef(null)
  const dialogRef = useRef(null)

  const shareText = note
    ? `${note}\nPay me ${amount} ${symbol} with FairWins:\n${uri}`
    : `Pay me ${amount} ${symbol} with FairWins:\n${uri}`

  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Share failed:', err)
      }
    } else {
      copy(shareText)
    }
  }

  // Move focus into the dialog on open; return it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return undefined
    triggerRef.current = document.activeElement
    closeButtonRef.current?.focus()
    return () => {
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus()
      }
    }
  }, [isOpen])

  // Escape closes; Tab is trapped inside the dialog so keyboard users can't
  // reach the amount/currency controls behind the modal and leave a stale QR.
  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (!root.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const { fg } = getQRColorEntry(getQRColorPreference())

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="address-qr-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-qr-title"
    >
      <div className="address-qr-modal" ref={dialogRef}>
        <button
          ref={closeButtonRef}
          className="address-qr-close"
          onClick={onClose}
          aria-label="Close payment request dialog"
        >
          ×
        </button>

        <h2 id="request-qr-title" className="address-qr-title">
          Request {amount} {symbol}
        </h2>

        <div className="address-qr-content">
          <div className="address-qr-frame">
            <QRCodeSVG
              value={uri}
              size={240}
              level="H"
              marginSize={2}
              fgColor={fg}
              bgColor="#FFFFFF"
              role="img"
              aria-label={`Payment request QR code for ${amount} ${symbol}`}
            />
          </div>

          <p className="address-qr-wordmark" aria-hidden="true">FairWins</p>

          {note && <p className="address-qr-address">{note}</p>}

          <div className="address-qr-actions">
            <button type="button" className="address-qr-action-btn" onClick={() => copy(uri)}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              className="address-qr-action-btn address-qr-share-btn"
              onClick={handleShare}
            >
              Share
            </button>
          </div>

          <p className="address-qr-status" role="status" aria-live="polite">
            {copyError || (copied ? 'Request copied to clipboard.' : 'Scannable from the FairWins Pay view — or any wallet that reads payment QR codes.')}
          </p>
        </div>
      </div>
    </div>
  )
}

export default RequestQRModal
