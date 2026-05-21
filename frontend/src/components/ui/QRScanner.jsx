import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './QRScanner.css'

function QRScanner({ isOpen, onClose, onScanSuccess }) {
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState(null)
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)

  // Define stopScanning first as it's used by handleClose
  const stopScanning = useCallback(async () => {
    if (html5QrCodeRef.current && scanning) {
      try {
        await html5QrCodeRef.current.stop()
        html5QrCodeRef.current = null
        setScanning(false)
      } catch (err) {
        console.error('Error stopping scanner:', err)
      }
    }
  }, [scanning])

  // Define handleClose early so it can be used in useEffect
  const handleClose = useCallback(async () => {
    await stopScanning()
    if (onClose) {
      onClose()
    }
  }, [stopScanning, onClose])

  useEffect(() => {
    if (isOpen) {
      // Get available cameras
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices)
            // Prefer back camera on mobile
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
      // Cleanup on unmount
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current
          .stop()
          .catch((err) => console.error('Error stopping scanner:', err))
      }
    }
  }, [isOpen])

  // Handle Escape key press
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
  // Skipping the "press Start" step is the intended UX — tapping a QR button
  // in the parent should immediately activate the camera.
  useEffect(() => {
    if (!isOpen || !selectedCamera || scanning || starting || error) return
    if (html5QrCodeRef.current) return
    startScanning()
    // startScanning closes over selectedCamera; re-running on its change is
    // already covered by the deps. Other state values are checked above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedCamera, scanning, starting, error])

  const startScanning = async () => {
    if (!selectedCamera || html5QrCodeRef.current) return

    try {
      setError(null)
      setStarting(true)
      const html5QrCode = new Html5Qrcode('qr-reader')
      html5QrCodeRef.current = html5QrCode

      await html5QrCode.start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Success callback
          handleScanSuccess(decodedText)
        },
        () => {
          // Error callback (scanning errors, not failures)
          // This fires constantly while scanning, so we don't log it
        }
      )

      setScanning(true)
    } catch (err) {
      console.error('Error starting scanner:', err)
      html5QrCodeRef.current = null
      setError('Failed to start camera. Please check permissions.')
    } finally {
      setStarting(false)
    }
  }

  const handleScanSuccess = useCallback(async (decodedText) => {
    // Stop scanning first
    await stopScanning()

    // Parse the URL and extract market ID
    try {
      const url = new URL(decodedText)
      if (onScanSuccess) {
        onScanSuccess(decodedText, url)
      }
    } catch {
      // If it's not a valid URL, still pass it along
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

  const handleCameraChange = async (e) => {
    const newCameraId = e.target.value
    
    // If already scanning, restart with new camera
    if (scanning) {
      await stopScanning()
      // Small delay to ensure cleanup, then set the new camera
      setTimeout(() => {
        setSelectedCamera(newCameraId)
      }, 100)
    } else {
      // If not scanning, set immediately
      setSelectedCamera(newCameraId)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="qr-scanner-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      tabIndex={-1}
    >
      <div className="qr-scanner-modal" onClick={handleModalClick}>
        <div className="qr-scanner-header">
          <h2 id="qr-scanner-title">Scan QR Code</h2>
          <button
            className="qr-scanner-close"
            onClick={handleClose}
            aria-label="Close QR scanner"
          >
            ×
          </button>
        </div>

        <div className="qr-scanner-content">
          <div className="scanner-container">
            <div id="qr-reader" ref={scannerRef}></div>

            {!scanning && !error && (
              <div className="scanner-placeholder">
                <span className="camera-icon">📷</span>
                <p>{starting || selectedCamera ? 'Starting camera…' : 'Detecting cameras…'}</p>
              </div>
            )}

            {error && (
              <div className="scanner-error">
                <span className="error-icon">⚠️</span>
                <p>{error}</p>
              </div>
            )}
          </div>

          <div className="scanner-controls">
            {cameras.length > 1 && (
              <div className="camera-select">
                <label htmlFor="camera-select">Select Camera:</label>
                <select
                  id="camera-select"
                  value={selectedCamera || ''}
                  onChange={handleCameraChange}
                  disabled={starting}
                >
                  {cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || `Camera ${camera.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scanning && (
              <div className="scanner-actions">
                <button
                  className="stop-scan-btn"
                  onClick={stopScanning}
                  aria-label="Stop scanning QR code"
                >
                  ⏹️ Stop Scanning
                </button>
              </div>
            )}
          </div>

          <div className="scanner-instructions">
            <h3>How to Scan</h3>
            <ol>
              <li>Allow camera access when prompted</li>
              <li>Point your camera at a market QR code</li>
              <li>Hold steady until the code is detected</li>
              <li>You'll be automatically redirected to the market</li>
            </ol>
            <p className="privacy-note">
              🔒 Your camera feed is processed locally on your device and is not recorded or transmitted.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QRScanner
