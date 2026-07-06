import { useCallback, useEffect, useMemo, useState } from 'react'
import AddressInput from '../ui/AddressInput'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import { useTransfer, TRANSFER_KIND } from '../../hooks/useTransfer'
import { useWallet } from '../../hooks/useWalletManagement'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { useNotification } from '../../hooks/useUI'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * Transfer tab — send the active chain's stablecoin or native token to any address/ENS name.
 * Reuses the standard AddressInput (ENS + address book) for recipient entry and surfaces gasless status
 * honestly. Two-step: fill → Preview → Send, mirroring the reference "Preview" affordance.
 */
export default function TransferForm({ onSent }) {
  const {
    send, status, error, quoteGasless, meta, balanceOf, refreshBalances, tokens, isPasskey,
  } = useTransfer()
  const { address } = useWallet()
  const { screenOne } = useAddressScreening()
  const { showNotification } = useNotification()

  const [kind, setKind] = useState(TRANSFER_KIND.STABLE)
  const [toRaw, setToRaw] = useState('')
  const [toResolved, setToResolved] = useState('')
  const [amount, setAmount] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [screening, setScreening] = useState(null) // null | 'clear' | 'restricted' | 'uncertain'
  const [formError, setFormError] = useState(null)

  const busy = status === 'signing' || status === 'submitting' || status === 'pending'
  const m = meta(kind)
  const gasless = quoteGasless(kind)
  const bal = balanceOf(kind)
  const stableUnavailable = kind === TRANSFER_KIND.STABLE && !tokens.stableAddress

  useEffect(() => { refreshBalances() }, [refreshBalances])

  // If the network has no stablecoin, default the picker to native so the form stays usable.
  useEffect(() => {
    if (stableUnavailable) setKind(TRANSFER_KIND.NATIVE)
  }, [stableUnavailable])

  // Advisory sanctions pre-check on the resolved recipient (fail-closed on 'restricted').
  useEffect(() => {
    let cancelled = false
    if (!toResolved) { setScreening(null); return }
    setScreening(null)
    Promise.resolve(screenOne(toResolved))
      .then((s) => { if (!cancelled) setScreening(s) })
      .catch(() => { if (!cancelled) setScreening('uncertain') })
    return () => { cancelled = true }
  }, [toResolved, screenOne])

  const amountValid = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0
  }, [amount])

  const overBalance = useMemo(() => {
    if (bal == null || !amountValid) return false
    return Number(amount) > Number(bal)
  }, [bal, amount, amountValid])

  const canPreview = Boolean(toResolved) && amountValid && !overBalance && screening !== 'restricted' && !busy

  const handleMax = useCallback(() => {
    if (bal != null) setAmount(String(bal))
  }, [bal])

  const resetForm = useCallback(() => {
    setToRaw(''); setToResolved(''); setAmount(''); setPreviewing(false); setScreening(null); setFormError(null)
  }, [])

  const handleSend = useCallback(async () => {
    setFormError(null)
    try {
      const res = await send({ kind, to: toResolved, amount })
      showNotification(
        `Sent ${amount} ${m.symbol} to ${short(toResolved)}${res.route === 'gasless' ? ' (gasless)' : ''}.`,
        'success'
      )
      resetForm()
      onSent?.(res)
    } catch (err) {
      setFormError(err?.shortMessage || err?.message || 'Transfer failed.')
    }
  }, [send, kind, toResolved, amount, m.symbol, showNotification, resetForm, onSent])

  return (
    <div className="pt-form">
      {/* Asset selector */}
      <div className="pt-field">
        <span className="pt-label">Asset</span>
        <div className="pt-assets" role="radiogroup" aria-label="Asset to send">
          <button
            type="button"
            role="radio"
            aria-checked={kind === TRANSFER_KIND.STABLE}
            className={`pt-asset ${kind === TRANSFER_KIND.STABLE ? 'active' : ''}`}
            onClick={() => setKind(TRANSFER_KIND.STABLE)}
            disabled={stableUnavailable || busy}
          >
            <span className="pt-asset-sym">{tokens.stable}</span>
            <span className="pt-asset-bal">
              {stableUnavailable ? 'Not on this network' : `Balance: ${balanceOf(TRANSFER_KIND.STABLE) ?? '…'}`}
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === TRANSFER_KIND.NATIVE}
            className={`pt-asset ${kind === TRANSFER_KIND.NATIVE ? 'active' : ''}`}
            onClick={() => setKind(TRANSFER_KIND.NATIVE)}
            disabled={busy}
          >
            <span className="pt-asset-sym">{tokens.native}</span>
            <span className="pt-asset-bal">Balance: {balanceOf(TRANSFER_KIND.NATIVE) ?? '…'}</span>
          </button>
        </div>
        {gasless ? (
          <span className="pt-badge pt-badge-gasless">⚡ Gasless{isPasskey ? ' · sponsored' : ''}</span>
        ) : (
          <span className="pt-badge pt-badge-fee">Network fee applies</span>
        )}
      </div>

      {!previewing ? (
        <>
          {/* From — the connected account, read-only */}
          <div className="pt-field">
            <span className="pt-label">From</span>
            <div className="pt-from">
              <BlockiesAvatar address={address} size={20} />
              <span>{short(address)}</span>
            </div>
          </div>

          {/* To — reuses the standard address entry component (ENS + address book) */}
          <div className="pt-field">
            <label className="pt-label" htmlFor="pt-to">To</label>
            <AddressInput
              id="pt-to"
              value={toRaw}
              onChange={(e) => setToRaw(e.target.value)}
              onResolvedChange={(addr) => setToResolved(addr || '')}
              enableAddressBook
              chainId={tokens.chainId}
              placeholder="0x… or ENS name (e.g., vitalik.eth)"
              disabled={busy}
            />
            {screening === 'restricted' && (
              <div className="pt-notice pt-notice-error" role="alert">
                This address is flagged by sanctions screening. Transfers to it are blocked.
              </div>
            )}
            {screening === 'uncertain' && toResolved && (
              <span className="pt-hint">Screening unavailable — proceed with care.</span>
            )}
          </div>

          {/* Amount */}
          <div className="pt-field">
            <label className="pt-label" htmlFor="pt-amount">Amount</label>
            <div className="pt-amount-row">
              <input
                id="pt-amount"
                className="pt-amount-input"
                inputMode="decimal"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                disabled={busy}
                aria-describedby="pt-amount-hint"
              />
              <button type="button" className="pt-max" onClick={handleMax} disabled={bal == null || busy}>MAX</button>
              <span className="pt-amount-sym">{m.symbol}</span>
            </div>
            <span className="pt-hint" id="pt-amount-hint">
              {bal != null ? `Balance: ${bal} ${m.symbol}` : 'Loading balance…'}
              {overBalance && ' · exceeds balance'}
            </span>
          </div>

          {(error || formError) && (
            <div className="pt-notice pt-notice-error" role="alert">{formError || error}</div>
          )}

          <div className="pt-actions">
            <button
              type="button"
              className="pt-btn pt-btn-primary"
              onClick={() => setPreviewing(true)}
              disabled={!canPreview}
            >
              Preview
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="pt-preview" aria-live="polite">
            <div className="pt-preview-amount">{amount} {m.symbol}</div>
            <div className="pt-preview-row"><span className="k">To</span><span className="v">{short(toResolved)}</span></div>
            <div className="pt-preview-row"><span className="k">Network</span><span className="v">{tokens.networkName}</span></div>
            <div className="pt-preview-row">
              <span className="k">Fee</span>
              <span className="v">{gasless ? 'Gasless — no network fee' : `You pay the ${tokens.native} network fee`}</span>
            </div>
          </div>

          {(error || formError) && (
            <div className="pt-notice pt-notice-error" role="alert">{formError || error}</div>
          )}

          <div className="pt-actions">
            <button type="button" className="pt-btn pt-btn-secondary" onClick={() => setPreviewing(false)} disabled={busy}>
              Back
            </button>
            <button type="button" className="pt-btn pt-btn-primary" onClick={handleSend} disabled={busy}>
              {busy ? (status === 'signing' ? 'Confirm in wallet…' : 'Sending…') : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
