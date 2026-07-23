import { useCallback, useState } from 'react'
import AmountKeypad from '../ui/AmountKeypad'
import RequestQRModal from './RequestQRModal'
import { useWallet } from '../../hooks'
import { useChainTokens } from '../../hooks/useChainTokens'
import { useEffectiveAccount } from '../../hooks/useEffectiveAccount'
import { getDefaultCurrencyKind } from '../../utils/homePreference'
import { buildPaymentRequestUri, NOTE_MAX_LENGTH } from '../../lib/payments/paymentRequest'

const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '')

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
  const { address: connectedAddress, isConnected, openConnectModal } = useWallet()
  const tokens = useChainTokens()
  // Spec 063 (US1): the request must be addressed to the account the member is ACTING AS
  // (a vault or recovered account), not always the connected wallet — otherwise funds land
  // in the wrong account. Fall back to the connected wallet when no acting account is
  // selected (the effective address is only absent when truly disconnected).
  const { address: effectiveAddress, isActingAccount, label: actingLabel, type: actingType } = useEffectiveAccount()
  const address = effectiveAddress || connectedAddress

  const [kind, setKindState] = useState(getDefaultCurrencyKind)
  const [amount, setAmountState] = useState('')
  const [note, setNoteState] = useState('')
  const [generated, setGenerated] = useState(null) // { uri, note, amount, symbol, address, chainId } | null
  const [formError, setFormError] = useState(null)

  const symbol = kind === 'stable' ? tokens.stable : tokens.native
  const amountValid = Number.isFinite(Number(amount)) && Number(amount) > 0
  const stableUnavailable = kind === 'stable' && !tokens.stableAddress

  // A generated request is only valid for the wallet + network it was built
  // for: if the user switches account or chain while the modal is open, the
  // guard nulls it out so the QR can never pay the previous address/network.
  const safeGenerated = generated && generated.address === address && generated.chainId === tokens.chainId
    ? generated
    : null

  // Any input change invalidates a displayed code (belt-and-braces alongside
  // the modal's focus trap, so a stale QR is never shown after an edit).
  const setKind = useCallback((v) => { setKindState(v); setGenerated(null); setFormError(null) }, [])
  const setAmount = useCallback((v) => { setAmountState(v); setGenerated(null); setFormError(null) }, [])
  const setNote = useCallback((v) => { setNoteState(v); setGenerated(null); setFormError(null) }, [])

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
      setGenerated({ uri, note: note.trim(), amount, symbol, address, chainId: tokens.chainId })
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

      {isActingAccount && address && (
        <p className="fm-pay-acting-note" role="note">
          Paid to your {actingType === 'vault' ? 'multisig' : 'recovered account'}
          {actingLabel ? ` · ${actingLabel}` : ` · ${shortAddr(address)}`}
        </p>
      )}

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
        isOpen={Boolean(safeGenerated)}
        onClose={() => setGenerated(null)}
        uri={safeGenerated?.uri}
        amount={safeGenerated?.amount}
        symbol={safeGenerated?.symbol}
        note={safeGenerated?.note}
      />
    </div>
  )
}

export default RequestPanel
