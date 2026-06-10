import { useEffect, useRef, useState } from 'react'
import AddressQRCode from './AddressQRCode'
import { useClipboard } from '../../hooks/useClipboard'
import { getQRColorPreference } from '../../utils/qrColorPreference'
import './AddressQRModal.css'

/**
 * Branded dialog presenting the connected wallet address as a scannable QR
 * (spec 011, contracts M1–M3, M10). The FairWins styling lives in the frame —
 * white quiet-zone card, brand corner accents, wordmark — never inside the QR
 * modules (no embedded logo; spec 009's mobile-webview lesson stands).
 *
 * Props:
 *  - isOpen (boolean, required): nothing renders when false.
 *  - onClose (function, required): close button, backdrop, and Escape.
 *  - address (string, required): connected wallet address (EIP-55 casing
 *    preserved end-to-end). Falsy while open → connect prompt, never a QR.
 */
function AddressQRModal({ isOpen, onClose, address }) {
  const [paletteId, setPaletteId] = useState(getQRColorPreference)
  const { copied, error: copyError, copy } = useClipboard()
  const closeButtonRef = useRef(null)
  const triggerRef = useRef(null)

  // The full share payload: context line first, address alone on its own
  // line so recipients can copy it cleanly (research D7). Text-only — no
  // url/title, which messaging apps would turn into a mangling link preview.
  const shareText = `My FairWins wallet address:\n${address}`

  const handleCopy = () => {
    copy(address)
  }

  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        // User cancelled the share sheet — not an error (M6).
        if (err?.name !== 'AbortError') {
          console.warn('Share failed:', err)
        }
      }
    } else {
      // No Web Share API (desktop browsers): degrade to copying the full
      // share payload with the same visible confirmation (M7 / FR-005).
      copy(shareText)
    }
  }

  // Re-read the persisted color each time the dialog opens so a choice saved
  // in an earlier session applies without re-selection (FR-007).
  useEffect(() => {
    if (isOpen) {
      setPaletteId(getQRColorPreference())
    }
  }, [isOpen])

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

  // Escape closes (M3).
  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="address-qr-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="address-qr-title"
    >
      <div className="address-qr-modal">
        <button
          ref={closeButtonRef}
          className="address-qr-close"
          onClick={onClose}
          aria-label="Close address QR dialog"
        >
          ×
        </button>

        <h2 id="address-qr-title" className="address-qr-title">
          Your wallet address
        </h2>

        {!address ? (
          <p className="address-qr-connect-prompt">
            Connect a wallet to display your address as a QR code.
          </p>
        ) : (
          <div className="address-qr-content">
            <div className="address-qr-frame">
              <AddressQRCode value={address} paletteId={paletteId} size={240} />
            </div>

            <p className="address-qr-wordmark" aria-hidden="true">
              FairWins
            </p>

            <p className="address-qr-address">{address}</p>

            <div className="address-qr-actions">
              <button
                type="button"
                className="address-qr-action-btn"
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy Address'}
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
              {copyError || (copied ? 'Address copied to clipboard.' : '')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AddressQRModal
