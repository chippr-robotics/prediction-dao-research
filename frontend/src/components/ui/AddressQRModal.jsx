import { useEffect, useRef, useState } from 'react'
import AddressQRCode from './AddressQRCode'
import { useClipboard } from '../../hooks/useClipboard'
import { useBitcoinWallet } from '../../hooks/useBitcoinWallet'
import { getBitcoinNetwork } from '../../config/bitcoinNetworks'
import {
  QR_COLOR_PALETTE,
  getQRColorPreference,
  setQRColorPreference,
} from '../../utils/qrColorPreference'
import './AddressQRModal.css'

/**
 * Bitcoin receive surface (spec 061, US1/FR-004…FR-007) — rendered inside the
 * modal when mode="bitcoin". A separate component so the useBitcoinWallet hook
 * only mounts in bitcoin mode: the EVM address view stays byte-for-byte
 * unchanged (FR-022) and never touches the wallet-context requirement.
 *
 * Honest states: 'unavailable' renders the reason with no dead buttons;
 * 'locked' offers exactly one action — unlocking with the passkey (one PRF
 * ceremony). Ready shows a fresh rotating address as text + BIP-21 QR, a
 * "New address" affordance, and the segwit/taproot preference toggle.
 */
function BitcoinReceiveContent({ paletteId }) {
  const btc = useBitcoinWallet()
  const { copied, error: copyError, copy } = useClipboard()
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState(null)

  const { status, reason, networkId, receive, unlock } = btc
  const network = getBitcoinNetwork(networkId)
  const networkLabel = network?.isTestnet ? 'Bitcoin — Testnet4' : 'Bitcoin — Mainnet'
  const current = receive.current
  const hasCurrent = Boolean(current)

  // Show an address as soon as the wallet is ready: re-shows this session's
  // address for the preferred type, or issues a fresh one (rotation, FR-004).
  useEffect(() => {
    if (status === 'ready' && !hasCurrent) {
      receive.select(receive.preferredType)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasCurrent])

  const handleUnlock = async () => {
    setUnlocking(true)
    setUnlockError(null)
    try {
      const res = await unlock()
      if (!res?.ok) {
        setUnlockError(res?.message || 'Could not unlock your Bitcoin wallet — try again.')
      }
    } finally {
      setUnlocking(false)
    }
  }

  const handleTypeChange = (type) => {
    receive.setPreferredType(type)
    receive.select(type)
  }

  const shareText = current
    ? `My Bitcoin address (${network?.name || 'Bitcoin'}):\n${current.address}`
    : ''

  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.warn('Share failed:', err)
        }
      }
    } else {
      copy(shareText)
    }
  }

  return (
    <div className="address-qr-content">
      {/* Explicit Bitcoin + network labeling, visually distinct from the EVM
          address view (FR-007) — text label, never color alone. */}
      <p className="address-qr-network-badge address-qr-network-badge--bitcoin">
        <span aria-hidden="true">₿</span> {networkLabel}
      </p>

      {status === 'unavailable' && (
        <p className="address-qr-connect-prompt" role="status">
          {reason || 'Bitcoin is unavailable for this account.'}
        </p>
      )}

      {status === 'locked' && (
        <>
          <p className="address-qr-connect-prompt">
            Your Bitcoin wallet is locked. Unlock it with your passkey to derive your receive
            addresses — nothing leaves this device.
          </p>
          <div className="address-qr-actions">
            <button
              type="button"
              className="address-qr-action-btn"
              onClick={handleUnlock}
              disabled={unlocking}
            >
              {unlocking ? 'Unlocking…' : 'Unlock with your passkey'}
            </button>
          </div>
          <p className="address-qr-status" role="status" aria-live="polite">
            {unlockError || ''}
          </p>
        </>
      )}

      {status === 'ready' && !current && (
        <p className="address-qr-connect-prompt" role="status">
          Preparing a fresh Bitcoin address…
        </p>
      )}

      {status === 'ready' && current && (
        <>
          <div className="address-qr-frame">
            <AddressQRCode
              value={receive.uri}
              paletteId={paletteId}
              size={240}
              ariaLabel={`QR code for your Bitcoin address ${current.address.slice(0, 8)}…${current.address.slice(-6)}`}
            />
          </div>

          <p className="address-qr-wordmark" aria-hidden="true">
            FairWins
          </p>

          <p className="address-qr-address address-qr-address--bitcoin">{current.address}</p>

          <div className="address-qr-actions">
            <button
              type="button"
              className="address-qr-action-btn"
              onClick={() => copy(current.address)}
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
            <button
              type="button"
              className="address-qr-action-btn"
              onClick={() => receive.nextReceiveAddress(receive.preferredType)}
            >
              New address
            </button>
          </div>

          <p className="address-qr-status" role="status" aria-live="polite">
            {copyError || (copied ? 'Address copied to clipboard.' : '')}
          </p>

          <fieldset className="address-qr-type-toggle">
            <legend>Address type</legend>
            <label className="address-qr-type-option">
              <input
                type="radio"
                name="btc-address-type"
                value="segwit"
                checked={receive.preferredType === 'segwit'}
                onChange={() => handleTypeChange('segwit')}
              />
              <span>Native SegWit (recommended)</span>
            </label>
            <label className="address-qr-type-option">
              <input
                type="radio"
                name="btc-address-type"
                value="taproot"
                checked={receive.preferredType === 'taproot'}
                onChange={() => handleTypeChange('taproot')}
              />
              <span>Taproot</span>
            </label>
          </fieldset>
        </>
      )}
    </div>
  )
}

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
 *  - variant ('full' | 'quick'): 'quick' (Dashboard Share Account action) is
 *    a clean, minimally branded view for in-person sharing — no color
 *    options (the persisted Account-page choice applies) and no visible
 *    address text. The address is revealed only as the copy-failure
 *    fallback so the manual-copy escape hatch (contract M5) survives.
 *  - mode ('evm' | 'bitcoin'): 'bitcoin' (spec 061) swaps the content for the
 *    member's rotating Bitcoin receive address (BitcoinReceiveContent above);
 *    the default 'evm' view is untouched.
 */
function AddressQRModal({ isOpen, onClose, address, variant = 'full', mode = 'evm' }) {
  const isQuick = variant === 'quick'
  const isBitcoin = mode === 'bitcoin'
  // Lazy initializer reads the persisted choice when the modal mounts; the
  // parent mounts it per open (FR-007), so every open reflects storage.
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

  const handleSelectColor = (id) => {
    setPaletteId(id)
    setQRColorPreference(id)
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
      <div className={`address-qr-modal${isQuick ? ' address-qr-modal--quick' : ''}`}>
        <button
          ref={closeButtonRef}
          className="address-qr-close"
          onClick={onClose}
          aria-label="Close address QR dialog"
        >
          ×
        </button>

        <h2 id="address-qr-title" className="address-qr-title">
          {isBitcoin ? 'Your Bitcoin address' : 'Your wallet address'}
        </h2>

        {isBitcoin ? (
          <BitcoinReceiveContent paletteId={paletteId} />
        ) : !address ? (
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

            {(!isQuick || copyError) && (
              <p className="address-qr-address">{address}</p>
            )}

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

            {!isQuick && (
            <fieldset className="address-qr-colors">
              <legend>QR color</legend>
              <div className="qr-color-options">
                {QR_COLOR_PALETTE.map(({ id, name, fg }) => (
                  <label
                    key={id}
                    className={`qr-color-swatch${paletteId === id ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="qr-color"
                      value={id}
                      checked={paletteId === id}
                      onChange={() => handleSelectColor(id)}
                    />
                    <span
                      className="swatch-dot"
                      style={{ backgroundColor: fg }}
                      aria-hidden="true"
                    />
                    <span className="swatch-name">{name}</span>
                    <span className="swatch-check" aria-hidden="true">
                      {paletteId === id ? '✓' : ''}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AddressQRModal
