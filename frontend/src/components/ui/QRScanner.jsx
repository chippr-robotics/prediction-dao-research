import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import './QRScanner.css'

function QRScanner({ isOpen, onClose, onScanSuccess }) {
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [selectedCamera, setSelectedCamera] = useState(null)
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)

  // html5-qrcode throws "Cannot stop, scanner is not running or paused" if
  // stop() is called outside the SCANNING/PAUSED states, which happens when
  // the user closes the modal before start() has resolved.
  const safeStop = useCallback(async () => {
    const instance = html5QrCodeRef.current
    if (!instance) return
    if (html5QrCodeRef.current === instance) {
      html5QrCodeRef.current = null
    }
    try {
      const state = instance.getState?.()
      if (
        state === Html5QrcodeScannerState.SCANNING ||
        state === Html5QrcodeScannerState.PAUSED
      ) {
        await instance.stop()
      }
    } catch (err) {
      console.error('Error stopping scanner:', err)
    }
  }, [])

  const stopScanning = useCallback(async () => {
    await safeStop()
    setScanning(false)
  }, [safeStop])

  const handleClose = useCallback(async () => {
    await stopScanning()
    if (onClose) {
      onClose()
    }
  }, [stopScanning, onClose])

  useEffect(() => {
    if (isOpen) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            const backCamera = devices.find((device) =>
              device.label.toLowerCase().includes('back')
            )
            setSelectedCamera(backCamera?.id || devices[0].id)
          } else {
            setError('No cameras found on this device')
          }
        })
        .catch((err) => {
          console.error('Error getting cameras:', err)
          setError('Unable to access camera. Please check permissions.')
        })
    }

    return () => {
      safeStop()
    }
  }, [isOpen, safeStop])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleClose])

  // Auto-start scanning as soon as a camera is selected.
  useEffect(() => {
    if (!isOpen || !selectedCamera || scanning || starting || error) return
    if (html5QrCodeRef.current) return
    startScanning()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedCamera, scanning, starting, error])

  const startScanning = async () => {
    if (!selectedCamera || html5QrCodeRef.current) return

    const html5QrCode = new Html5Qrcode('qr-reader')
    html5QrCodeRef.current = html5QrCode

    try {
      setError(null)
      setStarting(true)

      await html5QrCode.start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScanSuccess(decodedText)
        },
        () => {
          // Per-frame decode failures fire continuously while scanning.
        }
      )

      // The modal may have been closed while start() was in flight; if so,
      // safeStop nulled the ref and we need to tear the new stream down now.
      if (html5QrCodeRef.current !== html5QrCode) {
        try {
          await html5QrCode.stop()
        } catch (err) {
          console.error('Error stopping orphaned scanner:', err)
        }
        return
      }

      setScanning(true)
    } catch (err) {
      console.error('Error starting scanner:', err)
      if (html5QrCodeRef.current === html5QrCode) {
        html5QrCodeRef.current = null
      }
      setError('Failed to start camera. Please check permissions.')
    } finally {
      setStarting(false)
    }
  }

  const handleScanSuccess = useCallback(async (decodedText) => {
    await stopScanning()

    try {
      const url = new URL(decodedText)
      if (onScanSuccess) {
        onScanSuccess(decodedText, url)
      }
    } catch {
      if (onScanSuccess) {
        onScanSuccess(decodedText)
      }
    }
  }, [onScanSuccess, stopScanning])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleModalClick = (e) => {
    e.stopPropagation()
  }

  if (!isOpen) return null

  return (
    <div
      className="qr-scanner-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="QR code scanner"
      tabIndex={-1}
    >
      <div className="qr-scanner-modal" onClick={handleModalClick}>
        <button
          className="qr-scanner-close"
          onClick={handleClose}
          aria-label="Close QR scanner"
        >
          ×
        </button>
        <div className="scanner-container">
          <div id="qr-reader" ref={scannerRef}></div>
          {error && (
            <div className="scanner-error" role="alert">
              <span className="error-icon" aria-hidden="true">⚠️</span>
              <p className="scanner-error-message">{error}</p>
              <p className="scanner-error-hint">
                Allow camera access for this site in your browser settings, then reopen the scanner.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QRScanner
