import { useCallback, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import SensitiveValue from '../common/SensitiveValue'
import { useWrapNative, WRAP_DIRECTION } from '../../hooks/useWrapNative'
import { useNotification } from '../../hooks/useUI'
import { getNetwork } from '../../config/networks'

/**
 * Wrap — turn the connected network's coin into its canonical wrapped token, and back.
 *
 * Deliberately the plainest surface in this section, because the operation is plain: the
 * wrapper mints 1:1 on deposit and burns 1:1 on withdraw. There is no rate to quote, no
 * slippage to disclose and no counterparty, so the only number the member needs is the
 * amount — and the only cost is the network fee, which is stated rather than implied.
 *
 * Two things this view will not do:
 *   - It never renders an unread balance as zero. A balance that failed to read shows "—",
 *     because "0" is a claim about the member's money (Constitution III).
 *   - It never offers a MAX that spends the fee. Wrapping is paid for in the same coin
 *     being wrapped, so MAX offers the balance less the reserve the hook quotes from the
 *     chain, and says so.
 *
 * Where the network has no wrapped coin in the app's configuration, the view says exactly
 * that and offers nothing — no address is guessed for a contract that would receive funds.
 */
export default function WrapView() {
  const wrapper = useWrapNative()
  const { showNotification } = useNotification()
  const [direction, setDirection] = useState(WRAP_DIRECTION.WRAP)
  const [amount, setAmount] = useState('')
  const [formError, setFormError] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const {
    token, available, networkName, chainId, nativeSymbol, wrappedSymbol, decimals,
    nativeBalance, wrappedBalance, maxWrappable, gasReserve, sponsored, isVault, busy, status, error,
  } = wrapper

  const wrapping = direction === WRAP_DIRECTION.WRAP
  const fromSymbol = wrapping ? nativeSymbol : wrappedSymbol
  const toSymbol = wrapping ? wrappedSymbol : nativeSymbol
  const sourceBalance = wrapping ? nativeBalance : wrappedBalance
  // Unwrapping is capped by the wrapped balance alone: the fee comes out of the native coin,
  // which is a different balance from the one being spent.
  const spendable = wrapping ? maxWrappable : wrappedBalance

  const fmt = useCallback(
    (v) => (v == null ? null : ethers.formatUnits(v, decimals)),
    [decimals],
  )

  const parsed = useMemo(() => {
    if (!amount) return null
    try {
      const v = ethers.parseUnits(amount, decimals)
      return v > 0n ? v : null
    } catch {
      return null
    }
  }, [amount, decimals])

  const overBalance = parsed != null && sourceBalance != null && parsed > sourceBalance
  // Distinct from over-balance: the coin is there, but wrapping all of it would leave nothing
  // to pay the fee with. Worth its own message — "exceeds balance" would be untrue.
  const overSpendable =
    !overBalance && parsed != null && spendable != null && parsed > spendable

  const canSubmit = Boolean(token) && parsed != null && !overBalance && !overSpendable && !busy

  const handleDirection = useCallback((next) => {
    setDirection(next)
    setAmount('')
    setFormError(null)
    setReceipt(null)
  }, [])

  const handleMax = useCallback(() => {
    if (spendable == null) return
    setAmount(ethers.formatUnits(spendable, decimals))
  }, [spendable, decimals])

  const handleSubmit = useCallback(async () => {
    setFormError(null)
    setReceipt(null)
    try {
      const res = wrapping ? await wrapper.wrap(amount) : await wrapper.unwrap(amount)
      setReceipt(res)
      if (res?.proposed) {
        showNotification(
          `Proposed ${wrapping ? 'wrapping' : 'unwrapping'} ${amount} ${fromSymbol} from the vault — its signers must approve it.`,
          'info',
        )
      } else if (res?.pending) {
        showNotification(
          `Submitted ${amount} ${fromSymbol} — still confirming on-chain.`,
          'info',
        )
      } else {
        showNotification(`${wrapping ? 'Wrapped' : 'Unwrapped'} ${amount} ${fromSymbol} → ${toSymbol}.`, 'success')
        setAmount('')
      }
    } catch (err) {
      setFormError(err?.shortMessage || err?.message || 'The transaction failed.')
    }
  }, [wrapping, wrapper, amount, fromSymbol, toSymbol, showNotification])

  if (!available) {
    return (
      <div className="pt-form">
        <div className="pt-notice pt-notice-warn" role="status">
          {networkName
            ? `${networkName} has no wrapped coin configured in this app, so there is nothing to wrap here.`
            : 'Connect to a network to wrap its coin.'}
        </div>
      </div>
    )
  }

  const explorerBase = getNetwork(chainId)?.explorer?.baseUrl
  const txUrl = receipt?.txHash && explorerBase ? `${explorerBase}/tx/${receipt.txHash}` : null

  return (
    <div className="pt-form">
      {/* Direction. Two radio-shaped buttons rather than a swap-style pair of asset pickers:
          the two assets are fixed and the only choice is which way round they go. */}
      <div className="pt-field">
        <span className="pt-label" id="pt-wrap-dir-label">Direction</span>
        <div className="pt-wrap-toggle" role="radiogroup" aria-labelledby="pt-wrap-dir-label">
          <button
            type="button"
            role="radio"
            aria-checked={wrapping}
            className={`pt-wrap-dir ${wrapping ? 'active' : ''}`}
            onClick={() => handleDirection(WRAP_DIRECTION.WRAP)}
            disabled={busy}
          >
            Wrap {nativeSymbol} → {wrappedSymbol}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!wrapping}
            className={`pt-wrap-dir ${!wrapping ? 'active' : ''}`}
            onClick={() => handleDirection(WRAP_DIRECTION.UNWRAP)}
            disabled={busy}
          >
            Unwrap {wrappedSymbol} → {nativeSymbol}
          </button>
        </div>
        <span className="pt-hint">
          {wrappedSymbol} is {networkName}&apos;s wrapped {nativeSymbol} — the ERC-20 form of the
          coin, redeemable one-for-one at any time. Wrapping never changes how much you hold.
        </span>
      </div>

      {/* Balances — both sides, always, so the effect of the action is visible before it runs. */}
      <div className="pt-field">
        <span className="pt-label">Balances</span>
        <div className="pt-wrap-balances">
          <div className="pt-wrap-balance">
            <span className="pt-wrap-balance-sym">{nativeSymbol}</span>
            <span className="pt-wrap-balance-val">
              {nativeBalance == null ? '—' : <SensitiveValue>{fmt(nativeBalance)}</SensitiveValue>}
            </span>
          </div>
          <div className="pt-wrap-balance">
            <span className="pt-wrap-balance-sym">{wrappedSymbol}</span>
            <span className="pt-wrap-balance-val">
              {wrappedBalance == null ? '—' : <SensitiveValue>{fmt(wrappedBalance)}</SensitiveValue>}
            </span>
          </div>
        </div>
        {(nativeBalance == null || wrappedBalance == null) && (
          <span className="pt-hint">A balance shown as “—” could not be read just now — it is not zero.</span>
        )}
      </div>

      {/* Amount */}
      <div className="pt-field">
        <label className="pt-label" htmlFor="pt-wrap-amount">Amount</label>
        <div className="pt-amount-row">
          <input
            id="pt-wrap-amount"
            className="pt-amount-input"
            inputMode="decimal"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            disabled={busy}
            aria-describedby="pt-wrap-amount-hint"
          />
          <button
            type="button"
            className="pt-max"
            onClick={handleMax}
            disabled={busy || spendable == null || isVault}
          >
            MAX
          </button>
          <span className="pt-amount-sym">{fromSymbol}</span>
        </div>
        <span className="pt-hint" id="pt-wrap-amount-hint">
          {sourceBalance == null
            ? `${fromSymbol} balance unavailable`
            : <>Balance: <SensitiveValue>{fmt(sourceBalance)}</SensitiveValue> {fromSymbol}</>}
          {overBalance && ` · exceeds your ${fromSymbol}`}
          {overSpendable && ' · leaves nothing for the network fee'}
        </span>
        {wrapping && !sponsored && gasReserve != null && (
          <span className="pt-hint">
            MAX holds back about {fmt(gasReserve)} {nativeSymbol} for the network fee, since wrapping is
            paid for in {nativeSymbol}.
          </span>
        )}
      </div>

      {/* What it costs. Wrapping mints 1:1, so the ONLY thing worth previewing is the fee. */}
      <div className="pt-preview" aria-live="polite">
        <div className="pt-preview-row">
          <span className="k">You {wrapping ? 'wrap' : 'unwrap'}</span>
          <span className="v">{amount || '0'} {fromSymbol}</span>
        </div>
        <div className="pt-preview-row">
          <span className="k">You receive</span>
          <span className="v">{amount || '0'} {toSymbol}</span>
        </div>
        <div className="pt-preview-row">
          <span className="k">Rate</span>
          <span className="v">1:1 — no price, no slippage</span>
        </div>
        <div className="pt-preview-row">
          <span className="k">Fee</span>
          <span className="v">
            {sponsored ? 'Sponsored — no network fee' : `You pay the ${nativeSymbol} network fee`}
          </span>
        </div>
        {isVault && (
          <div className="pt-preview-row">
            <span className="k">Acting as</span>
            <span className="v">Vault proposal</span>
          </div>
        )}
      </div>

      {isVault && (
        <span className="pt-hint">
          Balances are the vault&apos;s. Wrapping creates a proposal its signers must approve before it executes.
        </span>
      )}

      {(formError || error) && (
        <div className="pt-notice pt-notice-error" role="alert">{formError || error}</div>
      )}

      {receipt && !formError && (
        <div className="pt-notice pt-notice-success" role="status">
          {receipt.proposed
            ? 'Proposed to the vault — its signers must approve it before anything moves.'
            : receipt.pending
              ? 'Submitted and still confirming on-chain. Your balances update once it settles.'
              : `Done — your ${toSymbol} balance is updated.`}
          {txUrl && (
            <>
              {' '}
              <a href={txUrl} target="_blank" rel="noopener noreferrer">View transaction</a>
            </>
          )}
        </div>
      )}

      <div className="pt-actions">
        <button
          type="button"
          className="pt-btn pt-btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {busy
            ? status === 'signing'
              ? 'Confirm in wallet…'
              : status === 'pending'
                ? 'Confirming…'
                : 'Submitting…'
            : isVault
              ? 'Propose'
              : wrapping ? `Wrap ${nativeSymbol}` : `Unwrap ${wrappedSymbol}`}
        </button>
      </div>
    </div>
  )
}
