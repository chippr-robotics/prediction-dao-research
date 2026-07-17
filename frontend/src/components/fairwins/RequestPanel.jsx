import { useCallback, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import AmountKeypad from '../ui/AmountKeypad'
import { useWallet, useWalletConnection } from '../../hooks'
import { useChainTokens } from '../../hooks/useChainTokens'
import { useClipboard } from '../../hooks/useClipboard'
import { getQRColorPreference, getQRColorEntry } from '../../utils/qrColorPreference'
import { getDefaultCurrencyKind } from '../../utils/homePreference'
import { buildPaymentRequestUri, NOTE_MAX_LENGTH } from '../../lib/payments/paymentRequest'

/**
 * RequestPanel (spec 058 US2) — ask someone for value: the same amount hero +
 * note layout, and a "Request" action that renders a standard EIP-681 payment
 * request as a QR code (recipient = the connected wallet's address, amount,
 * currency, network; the note rides as an additive `message` param and is
 * ALSO shown as plain text, since third-party wallets ignore the param).
 * Copy/Share cover the remote-payer case. Requests are ephemeral — displayed,
 * never persisted.
 *
 * Contract: specs/058-send-request-home/contracts/home-mode-components.md
 */
function RequestPanel() {
  const { address, isConnected } = useWallet()
  const { connectWallet } = useWalletConnection()
  const tokens = useChainTokens()
  const { copied, copy } = useClipboard()

  const [kind, setKindState] = useState(getDefaultCurrencyKind)
  const [amount, setAmountState] = useState('')
  const [note, setNoteState] = useState('')
  // The generated request remembers the inputs it was built from; it only
  // renders while they still match, so a stale QR asking for the wrong
  // amount/network can never stay on screen.
  const [generatedRaw, setGenerated] = useState(null) // { uri, note, chainId, address } | null
  const [formError, setFormError] = useState(null)

  const symbol = kind === 'stable' ? tokens.stable : tokens.native
  const amountValid = Number.isFinite(Number(amount)) && Number(amount) > 0
  const stableUnavailable = kind === 'stable' && !tokens.stableAddress
  const generated = generatedRaw && generatedRaw.chainId === tokens.chainId && generatedRaw.address === address
    ? generatedRaw
    : null

  // Editing any input invalidates a displayed code.
  const setAmount = useCallback((v) => { setAmountState(v); setGenerated(null); setFormError(null) }, [])
  const setNote = useCallback((v) => { setNoteState(v); setGenerated(null); setFormError(null) }, [])
  const setKind = useCallback((v) => { setKindState(v); setGenerated(null); setFormError(null) }, [])

  const handleRequest = useCallback(() => {
    setFormError(null)
    try {
      const uri = buildPaymentRequestUri({
        chainId: tokens.chainId,
        to: address,
        kind,
        tokenAddress: tokens.stableAddress,
        decimals: kind === 'stable' ? tokens.stableDecimals : tokens.nativeDecimals,
        amount,
        note,
      })
      setGenerated({ uri, note: note.trim(), chainId: tokens.chainId, address })
    } catch (err) {
      setFormError(err?.message || 'Could not create the request.')
    }
  }, [tokens, address, kind, amount, note])

  const handleShare = useCallback(async () => {
    if (!generated) return
    const shareText = generated.note
      ? `${generated.note}\nPay me ${amount} ${symbol} with FairWins:\n${generated.uri}`
      : `Pay me ${amount} ${symbol} with FairWins:\n${generated.uri}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText })
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Share failed:', err)
      }
    } else {
      copy(shareText)
    }
  }, [generated, amount, symbol, copy])

  const { fg } = getQRColorEntry(getQRColorPreference())

  return (
    <div className="fm-form fm-pay-form request-panel">
      <div className="fm-pay-hero">
        <AmountKeypad
          value={amount}
          onChange={setAmount}
          prefix="$"
          token={symbol}
          ariaLabel="Amount to request"
          id="request-amount"
        />
        <label className="sr-only" htmlFor="request-token">Currency</label>
        <select
          id="request-token"
          className="fm-token-select fm-pay-token-select"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="stable">{tokens.stable}</option>
          <option value="native">{tokens.native}</option>
        </select>
      </div>

      <div className="fm-form-group fm-form-full fm-pay-memo">
        <label className="sr-only" htmlFor="request-note">What&apos;s it for?</label>
        <input
          id="request-note"
          type="text"
          maxLength={NOTE_MAX_LENGTH}
          className="fm-pay-memo-input"
          placeholder="What's it for? — e.g. pizza night"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {stableUnavailable && (
        <div className="fm-error-banner" role="alert">No {symbol} is configured on this network.</div>
      )}
      {formError && <div className="fm-error-banner" role="alert">{formError}</div>}

      {generated ? (
        <div className="request-result" data-testid="request-result">
          <div className="request-qr-frame">
            <QRCodeSVG
              value={generated.uri}
              size={200}
              level="H"
              marginSize={2}
              fgColor={fg}
              bgColor="#FFFFFF"
              role="img"
              aria-label={`Payment request QR code for ${amount} ${symbol}`}
            />
          </div>
          {generated.note && <p className="request-note-text">{generated.note}</p>}
          <p className="fm-hint request-scan-hint">
            Scannable from the FairWins Pay view — or by any wallet that reads payment QR codes.
          </p>
          <div className="request-result-actions">
            <button type="button" className="fm-btn-secondary" onClick={() => copy(generated.uri)}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button type="button" className="fm-btn-secondary" onClick={handleShare}>
              Share
            </button>
          </div>
        </div>
      ) : (
        <div className="fm-success-actions">
          {!isConnected || !address ? (
            <button type="button" className="fm-btn-primary" onClick={connectWallet}>
              Connect wallet
            </button>
          ) : (
            <button
              type="button"
              className="fm-btn-primary"
              onClick={handleRequest}
              disabled={!amountValid || stableUnavailable}
            >
              Request
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default RequestPanel
