import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useSwitchChain } from 'wagmi'
import AmountKeypad from '../ui/AmountKeypad'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import { useWallet, useWalletConnection } from '../../hooks'
import { useTransfer, TRANSFER_KIND } from '../../hooks/useTransfer'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { useNotification } from '../../hooks/useUI'
import { getNetwork } from '../../config/networks'
import { getDefaultCurrencyKind } from '../../utils/homePreference'
import { parsePaymentRequest } from '../../lib/payments/paymentRequest'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/** Format base units for the keypad; trims trailing zeros ("12.50" → "12.5"). */
function formatUnitsForKeypad(units, decimals) {
  const s = ethers.formatUnits(units, decimals)
  const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
  return trimmed === '' ? '0' : trimmed
}

/**
 * PayPanel (spec 058 US1) — the home surface's default mode: send value to a
 * recipient with the same amount-hero + numpad layout as the wager create
 * view. Composes the standard recipient stack (AddressInput + address book +
 * QR scanner) and submits through the existing useTransfer engine — the
 * screening, gasless routing, honest lifecycle, and never-stranded fallbacks
 * are all inherited, not reimplemented (FR-004/FR-018).
 *
 * Contract: specs/058-send-request-home/contracts/home-mode-components.md
 */
function PayPanel({ onSuccess }) {
  const { isConnected, chainId } = useWallet()
  const { connectWallet } = useWalletConnection()
  const { send, status, error: sendError, quoteGasless, balanceOf, refreshBalances, tokens } = useTransfer()
  const { screenOne } = useAddressScreening()
  const { showNotification } = useNotification()
  const { switchChainAsync, isPending: switching } = useSwitchChain()

  const [kind, setKind] = useState(getDefaultCurrencyKind)
  const [amount, setAmount] = useState('')
  const [toRaw, setToRaw] = useState('')
  const [toResolved, setToResolved] = useState('')
  const [note, setNote] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanNotice, setScanNotice] = useState(null)
  // Advisory screening result, remembered WITH the address it was for — the
  // status is derived by matching, so a recipient edit never shows a stale
  // verdict and the effect needs no synchronous reset.
  const [screeningResult, setScreeningResult] = useState(null) // { addr, status } | null
  const [formError, setFormError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  // A scanned request payable on another network pins that chain until the
  // user switches — the Pay action is replaced by a switch affordance (FR-016).
  const [pinnedChainId, setPinnedChainId] = useState(null)

  const connectedChainId = Number(tokens.chainId ?? chainId)
  const busy = status === 'signing' || status === 'submitting' || status === 'pending'
  const symbol = kind === TRANSFER_KIND.STABLE ? tokens.stable : tokens.native
  const gasless = quoteGasless(kind)
  const bal = balanceOf(kind)

  useEffect(() => { refreshBalances() }, [refreshBalances])

  // Derived, not synced: the pin stays with the draft (a scanned request is
  // payable on ITS network), and the mismatch simply computes false once the
  // user has switched onto that network.
  const chainMismatch = pinnedChainId != null && Number(pinnedChainId) !== connectedChainId
  const pinnedNetworkName = chainMismatch ? (getNetwork(pinnedChainId)?.name || `network ${pinnedChainId}`) : null

  // Advisory sanctions pre-check on the resolved recipient (on-chain guards
  // remain the enforcement).
  useEffect(() => {
    let cancelled = false
    if (!toResolved) return undefined
    Promise.resolve(screenOne(toResolved, connectedChainId))
      .then((s) => { if (!cancelled) setScreeningResult({ addr: toResolved, status: s }) })
      .catch(() => { if (!cancelled) setScreeningResult({ addr: toResolved, status: 'uncertain' }) })
    return () => { cancelled = true }
  }, [toResolved, screenOne, connectedChainId])

  const screening = screeningResult && screeningResult.addr === toResolved ? screeningResult.status : null

  const amountValid = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0
  }, [amount])

  const overBalance = useMemo(() => {
    if (bal == null || !amountValid) return false
    return Number(amount) > Number(bal)
  }, [bal, amount, amountValid])

  const stableUnavailable = kind === TRANSFER_KIND.STABLE && !tokens.stableAddress

  const canPay =
    isConnected && !chainMismatch && Boolean(toResolved) && amountValid && !overBalance &&
    screening !== 'restricted' && !stableUnavailable && !busy

  const applyAddress = useCallback((addr) => {
    setToRaw(addr)
    setToResolved(addr)
    setScanNotice(null)
  }, [])

  const resetDraft = useCallback(() => {
    setAmount(''); setToRaw(''); setToResolved(''); setNote('')
    setScreeningResult(null); setFormError(null); setScanNotice(null)
    setConfirming(false); setPinnedChainId(null)
  }, [])

  /**
   * A scan is either a payment request (full prefill), a bare address
   * (recipient-only prefill, FR-009), or unusable. A request denominated in
   * a token that is not its network's stablecoin prefills NOTHING — never a
   * wrong-asset send (edge case). A request on another network pins that
   * chain and surfaces the switch before any send (FR-016).
   */
  const handleScan = useCallback((decodedText) => {
    setScanOpen(false)
    const parsed = parsePaymentRequest(decodedText)
    if (!parsed) {
      setScanNotice("That code isn't a payment request or address, so nothing was filled in.")
      return
    }

    const targetChainId = parsed.chainId ?? connectedChainId
    const targetNetwork = getNetwork(targetChainId)

    let nextKind = kind
    let decimals = null
    if (parsed.tokenAddress) {
      const stableAddr = targetNetwork?.stablecoin?.address
      if (!stableAddr || parsed.tokenAddress.toLowerCase() !== stableAddr.toLowerCase()) {
        setScanNotice("This request asks for a token FairWins doesn't send on that network, so nothing was filled in.")
        return
      }
      nextKind = TRANSFER_KIND.STABLE
      decimals = targetNetwork.stablecoin.decimals ?? 6
    } else if (parsed.amountUnits != null) {
      nextKind = TRANSFER_KIND.NATIVE
      decimals = targetNetwork?.nativeCurrency?.decimals ?? 18
    }

    applyAddress(parsed.to)
    setKind(nextKind)
    if (parsed.amountUnits != null && decimals != null) setAmount(formatUnitsForKeypad(parsed.amountUnits, decimals))
    if (parsed.note) setNote(parsed.note)
    setPinnedChainId(parsed.chainId != null && Number(parsed.chainId) !== connectedChainId ? Number(parsed.chainId) : null)
  }, [applyAddress, connectedChainId, kind])

  const handleSwitch = useCallback(async () => {
    setFormError(null)
    try {
      await switchChainAsync({ chainId: Number(pinnedChainId) })
    } catch (err) {
      setFormError(err?.shortMessage || err?.message || 'Could not switch network.')
    }
  }, [switchChainAsync, pinnedChainId])

  const handleSend = useCallback(async () => {
    setFormError(null)
    try {
      const res = await send({ kind, to: toResolved, amount })
      if (res?.proposed) {
        showNotification(
          `Proposed sending ${amount} ${symbol} to ${short(toResolved)} from the vault — its signers must approve it.`,
          'info',
        )
      } else if (res?.pending) {
        showNotification(
          `Submitted ${amount} ${symbol} to ${short(toResolved)} — still confirming on-chain. It will show as complete in Activity once settled.`,
          'info',
        )
      } else {
        showNotification(`Sent ${amount} ${symbol} to ${short(toResolved)}${res.route === 'gasless' ? ' (gasless)' : ''}.`, 'success')
      }
      resetDraft()
      onSuccess?.(res)
    } catch (err) {
      setConfirming(false)
      setFormError(err?.shortMessage || err?.message || 'Transfer failed.')
    }
  }, [send, kind, toResolved, amount, symbol, showNotification, resetDraft, onSuccess])

  const blockReason = !amountValid
    ? null // an untouched form needs no error banner; the disabled button is enough
    : overBalance
      ? `That's more ${symbol} than you have.`
      : screening === 'restricted'
        ? 'This address is flagged by sanctions screening. Transfers to it are blocked.'
        : stableUnavailable
          ? `No ${symbol} is configured on this network.`
          : null

  if (confirming) {
    return (
      <div className="fm-form fm-pay-form pay-panel" data-testid="pay-confirm">
        <div className="pay-confirm" aria-live="polite">
          <div className="pay-confirm-amount">{amount} {symbol}</div>
          <div className="pay-confirm-row"><span className="k">To</span><span className="v">{short(toResolved)}</span></div>
          <div className="pay-confirm-row"><span className="k">Network</span><span className="v">{tokens.networkName}</span></div>
          <div className="pay-confirm-row">
            <span className="k">Fee</span>
            <span className="v">{gasless ? 'Gasless — no network fee' : `You pay the ${tokens.native} network fee`}</span>
          </div>
          {note && <div className="pay-confirm-row"><span className="k">Note</span><span className="v">{note}</span></div>}
        </div>

        {(formError || sendError) && (
          <div className="fm-error-banner" role="alert">{formError || sendError}</div>
        )}

        <div className="pay-confirm-actions">
          <button type="button" className="fm-btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Back
          </button>
          <button type="button" className="fm-btn-primary" onClick={handleSend} disabled={busy}>
            {busy ? (status === 'signing' ? 'Confirm in wallet…' : 'Sending…') : 'Confirm'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fm-form fm-pay-form pay-panel">
      {/* Amount hero — the shared payments-style keypad; the token pill under
          the amount switches the currency kind, showing the network's REAL
          symbols (honest state — no fake "USDC" on networks without it). */}
      <div className="fm-pay-hero">
        <AmountKeypad
          value={amount}
          onChange={setAmount}
          prefix="$"
          token={symbol}
          disabled={busy}
          ariaLabel="Amount to pay"
          id="pay-amount"
        />
        <label className="sr-only" htmlFor="pay-token">Currency</label>
        <select
          id="pay-token"
          className="fm-token-select fm-pay-token-select"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={busy}
        >
          <option value={TRANSFER_KIND.STABLE}>{tokens.stable}</option>
          <option value={TRANSFER_KIND.NATIVE}>{tokens.native}</option>
        </select>
      </div>

      {/* Recipient — the standard address entry stack (typed/pasted + book + scan). */}
      <div className="fm-form-group fm-form-full">
        <label className="fm-label" htmlFor="pay-to">To</label>
        <div className="fm-input-with-action">
          <div className="fm-address-input-wrap">
            <AddressInput
              id="pay-to"
              value={toRaw}
              onChange={(e) => setToRaw(e.target.value)}
              onResolvedChange={(addr) => setToResolved(addr || '')}
              chainId={connectedChainId}
              enableAddressBook
              placeholder="0x…, %callsign, or ENS name"
              disabled={busy}
            />
          </div>
          <AddressBookButton disabled={busy} onSelect={(entry) => applyAddress(entry.address)} />
          <button
            type="button"
            className="fm-scan-btn"
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
        <QRScanner isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanSuccess={handleScan} />
        {scanNotice && <div className="fm-hint" role="status">{scanNotice}</div>}
        {screening === 'restricted' && (
          <div className="fm-error-banner" role="alert">
            This address is flagged by sanctions screening. Transfers to it are blocked.
          </div>
        )}
        {screening === 'uncertain' && toResolved && (
          <span className="fm-hint">Screening unavailable — proceed with care.</span>
        )}
      </div>

      {/* Note — client-side only; a plain transfer carries no on-chain memo. */}
      <div className="fm-form-group fm-form-full fm-pay-memo">
        <label className="sr-only" htmlFor="pay-note">Note</label>
        <input
          id="pay-note"
          type="text"
          maxLength={200}
          className="fm-pay-memo-input"
          placeholder="Add a note — e.g. lunch, rent, thanks!"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="fm-pay-status">
        <span className="fm-hint">
          {isConnected
            ? bal != null
              ? <>Balance: {bal} {symbol}{gasless ? ' · ⚡ gasless' : ''}</>
              : 'Loading balance…'
            : 'Connect a wallet to pay.'}
        </span>
      </div>

      {blockReason && <div className="fm-error-banner" role="alert">{blockReason}</div>}
      {formError && <div className="fm-error-banner" role="alert">{formError}</div>}

      <div className="fm-success-actions">
        {!isConnected ? (
          <button type="button" className="fm-btn-primary" onClick={connectWallet}>
            Connect wallet
          </button>
        ) : chainMismatch ? (
          <button type="button" className="fm-btn-primary" onClick={handleSwitch} disabled={switching || busy}>
            {switching ? 'Switching…' : `Switch to ${pinnedNetworkName} to pay this request`}
          </button>
        ) : (
          <button type="button" className="fm-btn-primary" onClick={() => setConfirming(true)} disabled={!canPay}>
            Pay
          </button>
        )}
      </div>
    </div>
  )
}

export default PayPanel
