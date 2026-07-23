/**
 * StakeSheet (spec 065) — stake into / (US2) exit one staking option. Bottom
 * sheet reusing the shared `.asset-sheet-*` styling, so it looks and feels like
 * the portfolio and Earn vault sheets.
 *
 * Writes go through useStakingActions → useEarnSend → WalletContext.sendCalls
 * (the spec-041 unified rail): a passkey session authorizes the whole batch
 * with one ceremony; a classic wallet signs each step; any network switch is
 * handled as part of confirming. Amounts are validated with member-facing
 * reasons BEFORE any wallet prompt (constitution III); a native-coin Max leaves
 * a gas reserve; the summary discloses the liquid token received / the
 * delegation lock-up and, for delegated staking, the slashing risk (FR-014).
 *
 * US1 implements the stake flow. US2 (T028) adds unstake / withdraw / claim.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'ethers'
import { useStakingActions } from '../../hooks/useStakingActions'
import InfoTip from '../ui/InfoTip'
import { STAKING_TIPS } from '../../lib/staking/stakingCopy'
import {
  validateStakeAmount,
  maxStakeable,
  optionIsNative,
} from '../../lib/staking/stakingActions'

function fmt(raw, decimals, symbol) {
  if (raw == null) return '—'
  const value = Number(formatUnits(raw, decimals))
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${symbol}`
}

export default function StakeSheet({ option, userState, position, onClose, onActionComplete }) {
  const { stake, address, canTransactOn, cannotTransactReason, isPasskey } = useStakingActions()
  const sheetRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const canTransact = canTransactOn(option.chainId)
  const isNative = optionIsNative(option)
  const isDelegated = option.model === 'delegated'
  const decimals = option.asset.decimals
  const symbol = option.asset.symbol

  const [amountText, setAmountText] = useState('')
  const [inputError, setInputError] = useState(null)
  const [txState, setTxState] = useState({ step: 'idle', txUrl: null, error: null })

  useEffect(() => {
    restoreFocusRef.current = document.activeElement
    sheetRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [onClose])

  const amount = useMemo(() => {
    const trimmed = amountText.trim()
    if (!trimmed) return null
    try {
      return parseUnits(trimmed, decimals)
    } catch {
      return undefined
    }
  }, [amountText, decimals])

  const walletBalance = userState?.walletBalanceRaw ?? null
  const maxAmount = maxStakeable({ walletBalance, isNative })

  const setMax = () => {
    if (maxAmount == null) return
    setAmountText(formatUnits(maxAmount, decimals))
    setInputError(null)
  }

  const submit = async () => {
    if (amount === undefined) {
      setInputError('Enter a valid number.')
      return
    }
    const check = validateStakeAmount({ amount, walletBalance, isNative })
    if (!check.ok) {
      setInputError(check.reason)
      return
    }
    setInputError(null)
    if (!address || !canTransact) {
      setTxState({
        step: 'error',
        txUrl: null,
        error: !address
          ? 'This session cannot send transactions right now — please reconnect and try again.'
          : cannotTransactReason(option.chainId),
      })
      return
    }
    try {
      setTxState({ step: 'confirming', txUrl: null, error: null })
      const { txUrl } = await stake(option, amount, {
        onState: ({ step }) => {
          if (step === 'switching') setTxState({ step: 'switching', txUrl: null, error: null })
          if (step === 'sending') setTxState({ step: 'confirming', txUrl: null, error: null })
        },
      })
      setTxState({ step: 'done', txUrl, error: null })
      onActionComplete?.()
    } catch (err) {
      const rejected = /rejected|denied|cancelled|not allowed|abort/i.test(err?.message || '')
      setTxState({
        step: 'error',
        txUrl: null,
        error: rejected
          ? 'The confirmation was cancelled. Nothing was moved.'
          : err?.message && /switch|network/i.test(err.message)
            ? err.message
            : 'The transaction could not be completed. Nothing was moved — you can try again.',
      })
    }
  }

  const busy = txState.step === 'confirming' || txState.step === 'switching'
  const titleId = 'staking-sheet-title'
  const label = isDelegated ? option.validatorName : option.provider.name

  return (
    <div className="asset-sheet-backdrop">
      <button type="button" className="asset-sheet-scrim" aria-label="Close staking details" onClick={onClose} />
      <div
        className="asset-sheet earn-vault-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="asset-sheet-grabber" aria-hidden="true" />
        <div className="asset-sheet-header">
          <div className="asset-sheet-heading">
            <h3 id={titleId}>
              {label}{' '}
              <span className={`staking-badge ${option.model}`}>
                {isDelegated ? 'Delegated' : 'Liquid'}
              </span>
            </h3>
            <p className="earn-vault-sheet-meta">
              Stakes {symbol}
              {option.lstSymbol ? ` · you receive ${option.lstSymbol}` : ''}
              <InfoTip label="What is this?" className="earn-info">
                {isDelegated ? STAKING_TIPS.delegation : STAKING_TIPS.liquidToken}
              </InfoTip>
            </p>
          </div>
          <button type="button" className="asset-sheet-close" onClick={onClose}>
            Close
          </button>
        </div>

        {txState.step === 'done' ? (
          <div className="earn-tx-done" role="status">
            <p>
              Stake complete. Your {option.lstSymbol || symbol} position updates in a moment.
            </p>
            {txState.txUrl && (
              <a href={txState.txUrl} target="_blank" rel="noopener noreferrer">
                View transaction ↗
              </a>
            )}
            <button type="button" className="earn-btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <dl className="earn-vault-sheet-facts">
              <div>
                <dt>In your wallet</dt>
                <dd>{fmt(walletBalance, decimals, symbol)}</dd>
              </div>
              {position && position.stakedRaw > 0n && (
                <div>
                  <dt>Already staked here</dt>
                  <dd>{fmt(position.stakedRaw, decimals, symbol)}</dd>
                </div>
              )}
            </dl>

            <div className="earn-amount-row">
              <label htmlFor="staking-amount">Amount ({symbol})</label>
              <div className="earn-amount-input">
                <input
                  id="staking-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amountText}
                  disabled={busy}
                  onChange={(e) => {
                    setAmountText(e.target.value)
                    setInputError(null)
                  }}
                />
                <button
                  type="button"
                  className="earn-btn secondary"
                  onClick={setMax}
                  disabled={busy || maxAmount == null}
                >
                  Max
                </button>
              </div>
              {inputError && (
                <p className="earn-input-error" role="alert">
                  {inputError}
                </p>
              )}
            </div>

            <p className="earn-summary">
              {isDelegated ? (
                <>
                  Your {symbol} is delegated to {label} and starts earning. To get it back you unstake
                  and wait the unbonding period ({option.unbondingLabel || '~2–4 days'}).
                  <InfoTip label="About unbonding" className="earn-info">
                    {STAKING_TIPS.unbonding}
                  </InfoTip>
                  <InfoTip label="About slashing risk" className="earn-info">
                    {STAKING_TIPS.slashing}
                  </InfoTip>
                </>
              ) : (
                <>
                  Your {symbol} is staked and you receive {option.lstSymbol}, which grows in value as
                  rewards accrue.{' '}
                  {option.instantExit
                    ? 'You can cash out any time by swapping it back, or unstake and wait the unbonding period.'
                    : 'To cash out you request a withdrawal, which the provider processes over a short queue.'}
                  <InfoTip label="About the liquid token" className="earn-info">
                    {STAKING_TIPS.liquidToken}
                  </InfoTip>
                </>
              )}{' '}
              {!isNative &&
                (isPasskey
                  ? 'One passkey confirmation covers the whole stake, including the spending permission.'
                  : 'A first stake asks for two quick wallet confirmations.')}
              {!isNative && (
                <InfoTip label="About the spending permission" className="earn-info">
                  {STAKING_TIPS.approval}
                </InfoTip>
              )}
            </p>

            {txState.step === 'error' && (
              <p className="earn-input-error" role="alert">
                {txState.error}
              </p>
            )}

            {!canTransact && (
              <p className="earn-summary" role="note">
                {cannotTransactReason(option.chainId)}
              </p>
            )}

            <button
              type="button"
              className="earn-btn primary earn-submit"
              onClick={submit}
              disabled={busy || !canTransact}
              title={canTransact ? undefined : cannotTransactReason(option.chainId)}
            >
              {txState.step === 'switching'
                ? 'Switching network…'
                : txState.step === 'confirming'
                  ? isPasskey
                    ? 'Confirm with your passkey…'
                    : 'Waiting for confirmation…'
                  : isDelegated
                    ? `Delegate ${symbol}`
                    : `Stake ${symbol}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
