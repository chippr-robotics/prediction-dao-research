import { useCallback, useState } from 'react'
import AddressInput from '../ui/AddressInput'
import QRScanner from '../ui/QRScanner'
import SensitiveValue from '../common/SensitiveValue'
import { useNotification } from '../../hooks/useUI'
import { extractBitcoinFromScan } from '../../lib/addressBook/scanAddress'
import { isQuoteFresh } from '../../lib/bitcoin/send'
import { getBitcoinNetwork } from '../../config/bitcoinNetworks'

const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-6)}` : '')
const satsToBtc = (sats) => (sats ?? 0) / 1e8

/** Exact satoshis for a BTC-decimal string; null when malformed (>8 dp etc.). */
function parseBtcAmount(amount) {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(String(amount).trim())
  if (!m) return null
  const sats = Number(m[1]) * 1e8 + Number((m[2] || '').padEnd(8, '0'))
  return Number.isSafeInteger(sats) && sats > 0 ? sats : null
}

const SEND_ERROR_TEXT = {
  invalid_destination: null, // classify message is surfaced verbatim
  stale_fee_quote: 'The network fee quote expired — review the refreshed fee before sending.',
  amount_below_dust: 'That amount is below the Bitcoin dust limit for this destination type.',
  insufficient_funds: null, // detailed shortfall composed inline
  missing_change_address: 'Could not prepare a change address — try again.',
  signing_failed: 'Signing failed — nothing was sent.',
  broadcast_rejected: null, // upstream reason surfaced verbatim
}

/**
 * Bitcoin send flow (spec 061, US3 — FR-011…FR-016). Rendered by TransferForm
 * when the Bitcoin asset is selected; a fully parallel pipeline that never
 * touches the EVM routing (useTransfer). The member always pays the Bitcoin
 * network fee — nothing here may ever claim gasless (FR-015).
 *
 * @param {object} btc       useBitcoinWallet() instance (owned by TransferForm)
 * @param {number|null} usdPerBtc  BTC/USD for fee/amount context lines (null ⇒ omitted, never faked)
 * @param {function} onSent  optional callback after a successful broadcast
 */
export default function BitcoinSendPanel({ btc, usdPerBtc = null, onSent }) {
  const { showNotification } = useNotification()
  const [toRaw, setToRaw] = useState('')
  const [toResolved, setToResolved] = useState('')
  const [amount, setAmount] = useState('')
  const [isMax, setIsMax] = useState(false)
  const [feeTier, setFeeTier] = useState('normal')
  const [quote, setQuote] = useState(null)
  const [plan, setPlan] = useState(null)
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)

  const { networkId, balances, stampsDegraded } = btc
  const network = getBitcoinNetwork(networkId)
  const spendableBtc = satsToBtc(balances.spendableSats)
  const protectedSats = balances.protectedSats ?? 0

  const usd = (sats) =>
    usdPerBtc != null ? ` (~$${(satsToBtc(sats) * usdPerBtc).toFixed(2)})` : ''

  const applyScan = useCallback((decodedText) => {
    const parsed = extractBitcoinFromScan(decodedText, networkId)
    if (parsed) {
      setToRaw(parsed.address)
      setToResolved(parsed.address)
      if (parsed.amountSats) {
        setAmount(String(satsToBtc(parsed.amountSats)))
        setIsMax(false)
      }
    }
    setScanOpen(false)
  }, [networkId])

  const describePrepareError = (res) => {
    if (res.error === 'invalid_destination') return res.message
    if (res.error === 'insufficient_funds') {
      const shortfall = res.shortfallSats != null ? ` You are ${satsToBtc(res.shortfallSats)} BTC short, network fee included.` : ''
      return `Amount plus the network fee exceeds your spendable Bitcoin balance.${shortfall}`
    }
    if (res.error === 'broadcast_rejected') return `The Bitcoin network rejected the transaction: ${res.message}`
    return SEND_ERROR_TEXT[res.error] || res.message || 'Could not prepare the send.'
  }

  const handlePreview = useCallback(async () => {
    setFormError(null)
    setBusy(true)
    try {
      const quoted = await btc.send.getFeeQuote()
      if (!quoted?.ok) {
        setFormError('Bitcoin network fees are unavailable right now — try again shortly.')
        return
      }
      setQuote(quoted.quote)
      const amountSats = isMax ? 'max' : parseBtcAmount(amount)
      if (!isMax && amountSats == null) {
        setFormError('Enter a valid BTC amount (up to 8 decimal places).')
        return
      }
      const res = await btc.send.prepare({
        destination: toResolved,
        amountSats,
        feeRate: quoted.quote.rates[feeTier],
      })
      if (!res.ok) {
        setFormError(describePrepareError(res))
        return
      }
      setPlan(res.plan)
    } finally {
      setBusy(false)
    }
     
  }, [btc.send, toResolved, amount, isMax, feeTier])

  const handleConfirm = useCallback(async () => {
    setFormError(null)
    // FR-012: a quote that aged past its window can never silently price the
    // send — the hook enforces this too; the local pre-check just gives the
    // member the explanation without a round-trip.
    if (!isQuoteFresh(quote)) {
      setPlan(null)
      setFormError('The network fee quote expired — review the refreshed fee before sending.')
      return
    }
    setBusy(true)
    try {
      const res = await btc.send.confirmAndSend(plan)
      if (!res.ok) {
        if (res.error === 'stale_fee_quote') setPlan(null)
        setFormError(describePrepareError(res))
        return
      }
      showNotification(
        `Broadcast ${satsToBtc(plan.amountSats)} BTC to ${short(plan.destination)} — pending until the Bitcoin network confirms it.`,
        'info',
      )
      setToRaw(''); setToResolved(''); setAmount(''); setIsMax(false); setPlan(null); setQuote(null)
      onSent?.(res)
    } finally {
      setBusy(false)
    }
     
  }, [btc.send, plan, quote, showNotification, onSent])

  const canPreview = Boolean(toResolved) && (isMax || parseBtcAmount(amount) != null) && !busy

  if (!plan) {
    return (
      <>
        <div className="pt-field">
          <label className="pt-label" htmlFor="pt-btc-to">To</label>
          <div className="pt-input-with-action">
            <div className="pt-address-input-wrap">
              <AddressInput
                id="pt-btc-to"
                value={toRaw}
                onChange={(e) => { setToRaw(e.target.value); setToResolved('') }}
                onResolvedChange={(addr) => setToResolved(addr || '')}
                bitcoinNetworkId={networkId}
                placeholder={network?.isTestnet ? 'tb1…, 2…, m… or n…' : 'bc1…, 1… or 3…'}
                disabled={busy}
              />
            </div>
            <button
              type="button"
              className="pt-scan-btn"
              onClick={() => setScanOpen(true)}
              disabled={busy}
              title="Scan QR code"
              aria-label="Scan QR code"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z" />
              </svg>
            </button>
          </div>
          <QRScanner isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanSuccess={applyScan} />
        </div>

        <div className="pt-field">
          <label className="pt-label" htmlFor="pt-btc-amount">Amount</label>
          <div className="pt-amount-row">
            <input
              id="pt-btc-amount"
              className="pt-amount-input"
              inputMode="decimal"
              type="text"
              value={isMax ? 'MAX' : amount}
              onChange={(e) => { setIsMax(false); setAmount(e.target.value.replace(/[^0-9.]/g, '')) }}
              placeholder="0.00000000"
              disabled={busy}
              aria-describedby="pt-btc-amount-hint"
            />
            <button
              type="button"
              className="pt-max"
              onClick={() => { setIsMax(true); setAmount('') }}
              disabled={busy || balances.spendableSats === 0}
            >
              MAX
            </button>
            <span className="pt-amount-sym">BTC</span>
          </div>
          <span className="pt-hint" id="pt-btc-amount-hint">
            Spendable: <SensitiveValue>{spendableBtc}</SensitiveValue> BTC
            {isMax && ' · MAX sends everything spendable, minus the network fee'}
          </span>
          {protectedSats > 0 && (
            <span className="pt-hint">
              {satsToBtc(protectedSats)} BTC is protected ({stampsDegraded
                ? 'Stamps recognition is degraded — unverified coins are protected until it recovers'
                : 'Bitcoin Stamps travel with these coins'}) and is never spent by ordinary sends.
            </span>
          )}
        </div>

        <div className="pt-field">
          <span className="pt-label" id="pt-btc-fee-label">Network fee</span>
          <div className="pt-amount-row" role="radiogroup" aria-labelledby="pt-btc-fee-label">
            {['slow', 'normal', 'fast'].map((tier) => (
              <label key={tier} className="pt-hint" style={{ marginRight: 12 }}>
                <input
                  type="radio"
                  name="pt-btc-fee-tier"
                  value={tier}
                  checked={feeTier === tier}
                  onChange={() => setFeeTier(tier)}
                  disabled={busy}
                />{' '}
                {tier === 'slow' ? 'Slow' : tier === 'normal' ? 'Normal' : 'Fast'}
              </label>
            ))}
          </div>
          <span className="pt-hint">
            You pay the Bitcoin network fee — Bitcoin sends are never gasless. The exact fee is
            shown before you confirm.
          </span>
        </div>

        {formError && (
          <div className="pt-notice pt-notice-error" role="alert">{formError}</div>
        )}

        <div className="pt-actions">
          <button
            type="button"
            className="pt-btn pt-btn-primary"
            onClick={handlePreview}
            disabled={!canPreview}
          >
            {busy ? 'Preparing…' : 'Preview'}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="pt-preview" aria-live="polite">
        <div className="pt-preview-amount">{satsToBtc(plan.amountSats)} BTC</div>
        <div className="pt-preview-row"><span className="k">To</span><span className="v">{short(plan.destination)}</span></div>
        <div className="pt-preview-row"><span className="k">Type</span><span className="v">{plan.destinationType.toUpperCase()}</span></div>
        <div className="pt-preview-row"><span className="k">Network</span><span className="v">{network?.name || 'Bitcoin'}</span></div>
        <div className="pt-preview-row">
          <span className="k">Network fee</span>
          <span className="v">{satsToBtc(plan.feeSats)} BTC{usd(plan.feeSats)} — you pay this fee</span>
        </div>
        <div className="pt-preview-row">
          <span className="k">Total debit</span>
          <span className="v">{satsToBtc(plan.amountSats + plan.feeSats)} BTC{usd(plan.amountSats + plan.feeSats)}</span>
        </div>
      </div>

      {formError && (
        <div className="pt-notice pt-notice-error" role="alert">{formError}</div>
      )}

      <div className="pt-actions">
        <button type="button" className="pt-btn pt-btn-secondary" onClick={() => { setPlan(null); setFormError(null) }} disabled={busy}>
          Back
        </button>
        <button type="button" className="pt-btn pt-btn-primary" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Broadcasting…' : 'Send Bitcoin'}
        </button>
      </div>
    </>
  )
}
