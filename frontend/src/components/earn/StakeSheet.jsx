/**
 * StakeSheet (spec 065) — stake into / unstake / withdraw / claim one staking
 * option. Bottom sheet reusing the shared `.asset-sheet-*` styling.
 *
 * Writes go through useStakingActions → useEarnSend → WalletContext.sendCalls
 * (spec-041 unified rail): a passkey session authorizes the whole batch with
 * one ceremony; a classic wallet signs each step; any network switch is handled
 * as part of confirming. Amounts are validated BEFORE any wallet prompt
 * (constitution III); a native-coin Max leaves a gas reserve.
 *
 * Honest exits (FR-006): unstaking a delegated / non-instant-liquid position
 * discloses the unbonding wait and REQUIRES acknowledgement before the prompt;
 * sPOL surfaces the instant-DEX-swap alternative honestly; a matured exit shows
 * a clear "ready to withdraw" action. Delegated rewards have a Claim action;
 * liquid options never show one (rewards accrue into the token). Every action
 * records to the notification feed + ledger (T034).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'ethers'
import { useStakingActions } from '../../hooks/useStakingActions'
import { useActivityOptional } from '../../hooks/useActivity'
import InfoTip from '../ui/InfoTip'
import { STAKING_TIPS } from '../../lib/staking/stakingCopy'
import { queueStakingAction } from '../../lib/staking/stakingActivityBuffer'
import { captureStakingAction } from '../../data/ledger'
import { validateStakeAmount, maxStakeable, optionIsNative } from '../../lib/staking/stakingActions'

function fmt(raw, decimals, symbol) {
  if (raw == null) return '—'
  const value = Number(formatUnits(raw, decimals))
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${symbol}`
}

export default function StakeSheet({ option, userState, position, onClose, onActionComplete }) {
  const actions = useStakingActions()
  const { stake, requestUnstake, withdraw, claimRewards, address, canTransactOn, cannotTransactReason, isPasskey } = actions
  const activity = useActivityOptional()
  const sheetRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const canTransact = canTransactOn(option.chainId)
  const isNative = optionIsNative(option)
  const isDelegated = option.model === 'delegated'
  const decimals = option.asset.decimals
  const symbol = option.asset.symbol
  const label = isDelegated ? option.validatorName : option.provider.name

  const hasStake = (position?.stakedRaw ?? 0n) > 0n
  const readyExits = (position?.pendingUnbonds || []).filter((e) => e.ready)
  const rewardsClaimable = position?.rewardsClaimableRaw ?? 0n
  // Non-instant exits need an acknowledgement of the wait before the prompt.
  const exitHasWait = isDelegated || (option.model === 'liquid' && !option.instantExit) || option.providerKind === 'spol'

  const [mode, setMode] = useState('stake')
  const [amountText, setAmountText] = useState('')
  const [inputError, setInputError] = useState(null)
  const [ackWait, setAckWait] = useState(false)
  const [txState, setTxState] = useState({ step: 'idle', txUrl: null, error: null, doneKind: null })

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
  const maxStake = maxStakeable({ walletBalance, isNative })
  const maxUnstake = position?.stakedRaw ?? null
  const maxAmount = mode === 'stake' ? maxStake : maxUnstake

  const setMax = () => {
    if (maxAmount == null) return
    setAmountText(formatUnits(maxAmount, decimals))
    setInputError(null)
  }

  const recordAction = (type, kindNoun, { txHash, txUrl }) => {
    if (!address || !txHash) return
    const message = `${kindNoun} ${symbol} · ${label}`
    queueStakingAction(address, option.chainId, {
      type,
      refId: option.validatorShare || option.contracts?.token || option.id,
      optionId: option.id,
      message,
      txHash,
      txUrl,
      at: Date.now(),
    })
    captureStakingAction(address, option.chainId, {
      type,
      txHash,
      at: Date.now(),
      optionId: option.id,
      model: option.model,
      amountRaw: amount != null ? amount.toString() : null,
      tokenSymbol: symbol,
      tokenDecimals: decimals,
      counterparty: option.validatorShare || option.contracts?.controller || null,
      description: message,
    })
    activity?.refresh?.()
  }

  const runTx = async (fn, { type, kindNoun, doneKind }) => {
    setTxState({ step: 'confirming', txUrl: null, error: null, doneKind: null })
    try {
      const res = await fn({
        onState: ({ step }) => {
          if (step === 'switching') setTxState({ step: 'switching', txUrl: null, error: null, doneKind: null })
          if (step === 'sending') setTxState({ step: 'confirming', txUrl: null, error: null, doneKind: null })
        },
      })
      recordAction(type, kindNoun, res)
      setTxState({ step: 'done', txUrl: res.txUrl, error: null, doneKind })
      onActionComplete?.()
    } catch (err) {
      const rejected = /rejected|denied|cancelled|not allowed|abort/i.test(err?.message || '')
      setTxState({
        step: 'error',
        txUrl: null,
        doneKind: null,
        error: rejected
          ? 'The confirmation was cancelled. Nothing was moved.'
          : err?.message && /switch|network/i.test(err.message)
            ? err.message
            : 'The transaction could not be completed. Nothing was moved — you can try again.',
      })
    }
  }

  const guard = () => {
    if (!address || !canTransact) {
      setTxState({
        step: 'error',
        txUrl: null,
        doneKind: null,
        error: !address
          ? 'This session cannot send transactions right now — please reconnect and try again.'
          : cannotTransactReason(option.chainId),
      })
      return false
    }
    return true
  }

  const submitStake = async () => {
    if (amount === undefined) return setInputError('Enter a valid number.')
    const check = validateStakeAmount({ amount, walletBalance, isNative })
    if (!check.ok) return setInputError(check.reason)
    setInputError(null)
    if (!guard()) return
    await runTx((opts) => stake(option, amount, opts), {
      type: 'stake',
      kindNoun: isDelegated ? 'Delegated' : 'Staked',
      doneKind: 'stake',
    })
  }

  const submitUnstake = async () => {
    if (amount === undefined) return setInputError('Enter a valid number.')
    if (amount == null || amount <= 0n) return setInputError('Enter an amount greater than zero.')
    if (maxUnstake != null && amount > maxUnstake) return setInputError('That is more than you have staked here.')
    if (exitHasWait && !ackWait) return setInputError('Please confirm you understand the unbonding wait.')
    setInputError(null)
    if (!guard()) return
    await runTx((opts) => requestUnstake(option, amount, opts), {
      type: 'unstake-requested',
      kindNoun: 'Unstaked',
      doneKind: 'unstake',
    })
  }

  const submitWithdraw = async (exit) => {
    if (!guard()) return
    await runTx((opts) => withdraw(option, exit, opts), { type: 'withdraw', kindNoun: 'Withdrew', doneKind: 'withdraw' })
  }

  const submitClaim = async () => {
    if (!guard()) return
    await runTx((opts) => claimRewards(option, opts), { type: 'rewards-claimed', kindNoun: 'Claimed rewards for', doneKind: 'claim' })
  }

  const busy = txState.step === 'confirming' || txState.step === 'switching'
  const titleId = 'staking-sheet-title'

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
              <span className={`staking-badge ${option.model}`}>{isDelegated ? 'Delegated' : 'Liquid'}</span>
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
              {txState.doneKind === 'stake' && `Stake complete. Your ${option.lstSymbol || symbol} position updates in a moment.`}
              {txState.doneKind === 'unstake' && `Unstake requested. Your ${symbol} will be ready to withdraw after the unbonding wait.`}
              {txState.doneKind === 'withdraw' && `Withdrawal complete. Your ${symbol} is back in your wallet.`}
              {txState.doneKind === 'claim' && `Rewards claimed. Your ${symbol} rewards are in your wallet.`}
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
            {/* Ready-to-withdraw exits (matured). Always shown so the member can
                act even mid-flow. */}
            {readyExits.length > 0 && (
              <div className="staking-ready-box" role="status">
                <p className="staking-ready-flag">Ready to withdraw</p>
                {readyExits.map((exit, i) => (
                  <div key={i} className="staking-ready-row">
                    <span>{fmt(exit.amountRaw, decimals, symbol)}</span>
                    <button
                      type="button"
                      className="earn-btn primary"
                      disabled={busy || !canTransact}
                      onClick={() => submitWithdraw(exit)}
                    >
                      Withdraw
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Delegated rewards claim (liquid options never show this). */}
            {isDelegated && rewardsClaimable > 0n && (
              <div className="staking-ready-row">
                <span>
                  {fmt(rewardsClaimable, decimals, symbol)} rewards
                  <InfoTip label="About staking rewards" className="earn-info">
                    {STAKING_TIPS.rewards}
                  </InfoTip>
                </span>
                <button type="button" className="earn-btn secondary" disabled={busy || !canTransact} onClick={submitClaim}>
                  Claim
                </button>
              </div>
            )}

            <div className="earn-mode-tabs" role="tablist" aria-label="Stake or unstake">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'stake'}
                className={`earn-mode-tab ${mode === 'stake' ? 'active' : ''}`}
                onClick={() => {
                  setMode('stake')
                  setAmountText('')
                  setInputError(null)
                }}
              >
                {isDelegated ? 'Delegate' : 'Stake'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'unstake'}
                className={`earn-mode-tab ${mode === 'unstake' ? 'active' : ''}`}
                disabled={!hasStake}
                title={hasStake ? undefined : 'You have nothing staked here yet'}
                onClick={() => {
                  setMode('unstake')
                  setAmountText('')
                  setInputError(null)
                }}
              >
                Unstake
              </button>
            </div>

            <dl className="earn-vault-sheet-facts">
              <div>
                <dt>{mode === 'stake' ? 'In your wallet' : 'Staked here'}</dt>
                <dd>{fmt(mode === 'stake' ? walletBalance : position?.stakedRaw, decimals, symbol)}</dd>
              </div>
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
                <button type="button" className="earn-btn secondary" onClick={setMax} disabled={busy || maxAmount == null}>
                  Max
                </button>
              </div>
              {inputError && (
                <p className="earn-input-error" role="alert">
                  {inputError}
                </p>
              )}
            </div>

            {mode === 'stake' ? (
              <p className="earn-summary">
                {isDelegated ? (
                  <>
                    Your {symbol} is delegated to {label} and starts earning. To get it back you unstake and wait the
                    unbonding period ({option.unbondingLabel || '~2–4 days'}).
                    <InfoTip label="About unbonding" className="earn-info">
                      {STAKING_TIPS.unbonding}
                    </InfoTip>
                    <InfoTip label="About slashing risk" className="earn-info">
                      {STAKING_TIPS.slashing}
                    </InfoTip>
                  </>
                ) : (
                  <>
                    Your {symbol} is staked and you receive {option.lstSymbol}, which grows in value as rewards accrue.{' '}
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
            ) : (
              <>
                <p className="earn-summary">
                  {exitHasWait ? (
                    <>
                      Unstaking starts an unbonding wait of {option.unbondingLabel || '~2–4 days'} before your {symbol} can
                      be withdrawn. No rewards accrue on the exiting amount during that wait.
                      <InfoTip label="About unbonding" className="earn-info">
                        {STAKING_TIPS.unbonding}
                      </InfoTip>
                    </>
                  ) : (
                    <>Your {symbol} returns to your wallet.</>
                  )}
                  {option.providerKind === 'spol' && (
                    <>
                      {' '}
                      To skip the wait you can instead swap {option.lstSymbol} back to {symbol} at the market price.
                      <InfoTip label="About the instant swap" className="earn-info">
                        {STAKING_TIPS.instantExit}
                      </InfoTip>
                    </>
                  )}
                </p>
                {exitHasWait && (
                  <label className="staking-ack">
                    <input type="checkbox" checked={ackWait} onChange={(e) => setAckWait(e.target.checked)} />
                    I understand my {symbol} will not be available until the unbonding wait ends.
                  </label>
                )}
              </>
            )}

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
              onClick={mode === 'stake' ? submitStake : submitUnstake}
              disabled={busy || !canTransact}
              title={canTransact ? undefined : cannotTransactReason(option.chainId)}
            >
              {txState.step === 'switching'
                ? 'Switching network…'
                : txState.step === 'confirming'
                  ? isPasskey
                    ? 'Confirm with your passkey…'
                    : 'Waiting for confirmation…'
                  : mode === 'stake'
                    ? isDelegated
                      ? `Delegate ${symbol}`
                      : `Stake ${symbol}`
                    : `Unstake ${symbol}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
