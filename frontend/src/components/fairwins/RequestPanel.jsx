import { useCallback, useState } from 'react'
import AmountKeypad from '../ui/AmountKeypad'
import RequestQRModal from './RequestQRModal'
import { useWallet } from '../../hooks'
import { useChainTokens } from '../../hooks/useChainTokens'
import { getDefaultCurrencyKind } from '../../utils/homePreference'
import { buildPaymentRequestUri, NOTE_MAX_LENGTH } from '../../lib/payments/paymentRequest'

/**
 * RequestPanel (spec 058 US2) — ask someone for value: the same amount hero +
 * note layout, and a "Request" action that builds a standard EIP-681 payment
 * request (recipient = the connected wallet's address, amount, currency,
 * network; the note rides as an additive `message` param). The QR is shown in
 * the shared branded QR dialog (RequestQRModal) — the same surface the app
 * uses for receive-address QRs — so the panel stays compact. Requests are
 * ephemeral — displayed, never persisted.
 *
 * Contract: specs/058-send-request-home/contracts/home-mode-components.md
 */
function RequestPanel() {
  const { address, isConnected, openConnectModal } = useWallet()
  const tokens = useChainTokens()

  const [kind, setKind] = useState(getDefaultCurrencyKind)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [generated, setGenerated] = useState(null) // { uri, note, amount, symbol } | null
  const [formError, setFormError] = useState(null)

  const symbol = kind === 'stable' ? tokens.stable : tokens.native
  const amountValid = Number.isFinite(Number(amount)) && Number(amount) > 0
  const stableUnavailable = kind === 'stable' && !tokens.stableAddress

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
      setGenerated({ uri, note: note.trim(), amount, symbol })
    } catch (err) {
      setFormError(err?.message || 'Could not create the request.')
    }
  }, [tokens, address, kind, amount, note, symbol])

  const currencySelect = (
    <>
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
    </>
  )

  return (
    <div className="fm-form fm-pay-form request-panel">
      <div className="fm-pay-hero">
        <AmountKeypad
          value={amount}
          onChange={setAmount}
          prefix="$"
          token={symbol}
          tokenSlot={currencySelect}
          ariaLabel="Amount to request"
          id="request-amount"
        />
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

      <div className="fm-success-actions">
        {!isConnected || !address ? (
          <button type="button" className="fm-btn-primary" onClick={() => openConnectModal()}>
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

      <RequestQRModal
        isOpen={Boolean(generated)}
        onClose={() => setGenerated(null)}
        uri={generated?.uri}
        amount={generated?.amount}
        symbol={generated?.symbol}
        note={generated?.note}
      />
    </div>
  )
}

export default RequestPanel
