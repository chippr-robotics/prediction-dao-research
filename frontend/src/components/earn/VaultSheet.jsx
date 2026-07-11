/**
 * VaultSheet (spec 050, US1) — deposit into / withdraw from one lending
 * vault. Bottom-sheet modal per repo convention (Escape + backdrop close,
 * focus managed).
 *
 * Writes go through WalletContext.sendCalls — the unified spec-041 rail — so
 * BOTH session kinds work: a passkey session authorizes the whole
 * approve+deposit batch with one WebAuthn ceremony (it has no ethers signer),
 * a classic wallet signs each step. Reads (allowance, dry-runs) use the
 * chain's read provider, never the signer.
 *
 * Non-intimidating by design: amounts are validated with member-facing
 * reasons BEFORE any wallet prompt; a first deposit explains up front how
 * many confirmations to expect for the session kind; a plain-English summary
 * states exactly what will happen; withdrawal honors the vault's honest
 * liquidity bound (maxWithdraw). Every completed action is queued for the
 * activity feed with its transaction link (FR-010).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { useActivityOptional } from '../../hooks/useActivity'
import { getBlockscoutUrl } from '../../config/blockExplorer'
import { NETWORKS } from '../../config/networks'
import { makeReadProvider } from '../../utils/rpcProvider'
import InfoTip from '../ui/InfoTip'
import { EARN_TIPS } from '../../lib/earn/earnCopy'
import {
  validateDepositAmount,
  validateWithdrawAmount,
  buildDepositCalls,
  buildWithdrawCalls,
} from '../../lib/earn/vaultActions'
import { queueEarnAction } from '../../lib/earn/earnActivityBuffer'
import { formatApy } from '../../lib/earn/format'

function fmt(amountBig, decimals, symbol) {
  if (amountBig == null) return '—'
  const value = Number(formatUnits(amountBig, decimals))
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${symbol}`
}

export default function VaultSheet({ vault, userState, onClose, onActionComplete }) {
  const { address, chainId, sendCalls, loginMethod } = useWallet() || {}
  const isPasskey = loginMethod === 'passkey'
  const activity = useActivityOptional()
  const sheetRef = useRef(null)
  const restoreFocusRef = useRef(null)

  const [mode, setMode] = useState('deposit')
  const [amountText, setAmountText] = useState('')
  const [inputError, setInputError] = useState(null)
  // idle | approving | confirming | done | error
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

  const decimals = vault.asset.decimals
  const symbol = vault.asset.symbol
  const hasPosition = (userState?.shares ?? 0n) > 0n

  const amount = useMemo(() => {
    const trimmed = amountText.trim()
    if (!trimmed) return null
    try {
      return parseUnits(trimmed, decimals)
    } catch {
      return undefined // unparseable — distinct from empty
    }
  }, [amountText, decimals])

  const maxAmount =
    mode === 'deposit' ? userState?.walletBalance ?? null : userState?.maxWithdrawAssets ?? null

  const setMax = () => {
    if (maxAmount == null) return
    setAmountText(formatUnits(maxAmount, decimals))
    setInputError(null)
  }

  const validate = () => {
    if (amount === undefined) return { ok: false, reason: 'Enter a valid number.' }
    return mode === 'deposit'
      ? validateDepositAmount({
          amount,
          walletBalance: userState?.walletBalance ?? null,
          maxDepositAssets: userState?.maxDepositAssets ?? null,
        })
      : validateWithdrawAmount({ amount, maxWithdrawAssets: userState?.maxWithdrawAssets ?? null })
  }

  const submit = async () => {
    const check = validate()
    if (!check.ok) {
      setInputError(check.reason)
      return
    }
    setInputError(null)
    // Never a silent no-op (constitution III): if this session has no write
    // rail at all, say so instead of swallowing the tap.
    if (!address || typeof sendCalls !== 'function') {
      setTxState({
        step: 'error',
        txUrl: null,
        error: 'This session cannot send transactions right now — please reconnect and try again.',
      })
      return
    }

    try {
      // Reads (allowance check, dry-runs) go over the chain's read provider —
      // passkey sessions have no signer/provider of their own.
      const provider = makeReadProvider(NETWORKS[chainId].rpcUrl, chainId)
      let calls
      let message
      if (mode === 'deposit') {
        const built = await buildDepositCalls({ vault, account: address, amount, provider })
        calls = built.calls
        setTxState({ step: built.requiresApproval ? 'approving' : 'confirming', txUrl: null, error: null })
        message = `Deposited ${fmt(amount, decimals, symbol)} into ${vault.name}`
      } else {
        // A full withdrawal redeems all shares so no dust strands.
        const isFullExit =
          userState?.maxWithdrawAssets != null && amount === userState.maxWithdrawAssets &&
          userState?.shares != null
        const built = await buildWithdrawCalls({
          vault,
          account: address,
          amount,
          redeemAllShares: isFullExit ? userState.shares : null,
          provider,
        })
        calls = built.calls
        setTxState({ step: 'confirming', txUrl: null, error: null })
        message = `Withdrew ${fmt(amount, decimals, symbol)} from ${vault.name}`
      }

      // One passkey ceremony covers the whole batch; classic wallets prompt
      // per call (approve, then the action) — the copy above sets expectations.
      const sent = await sendCalls(calls)
      if (sent?.state === 'failed') {
        throw new Error(sent.reason || 'transaction failed')
      }
      const txHash = sent?.txHash ?? sent?.userOpHash ?? null
      if (!txHash) throw new Error('Submitted, but no transaction reference was returned.')
      // Explorer links only for real tx hashes — a UserOp hash is not a page
      // on the block explorer.
      const txUrl = sent?.txHash ? getBlockscoutUrl(chainId, sent.txHash, 'tx') : null
      queueEarnAction(address, chainId, {
        type: mode === 'deposit' ? 'earn-deposit' : 'earn-withdraw',
        refId: vault.address,
        message,
        txHash,
        txUrl,
        at: Date.now(),
      })
      activity?.refresh?.()
      setTxState({ step: 'done', txUrl, error: null })
      onActionComplete?.()
    } catch (err) {
      const rejected = /rejected|denied|cancelled|not allowed|abort/i.test(err?.message || '')
      setTxState({
        step: 'error',
        txUrl: null,
        error: rejected
          ? 'The confirmation was cancelled. Nothing was moved.'
          : 'The transaction could not be completed. Nothing was moved — you can try again.',
      })
    }
  }

  const busy = txState.step === 'approving' || txState.step === 'confirming'
  const titleId = 'earn-vault-sheet-title'

  return (
    <div className="asset-sheet-backdrop">
      <button type="button" className="asset-sheet-scrim" aria-label="Close vault details" onClick={onClose} />
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
            <h3 id={titleId}>{vault.name}</h3>
            <p className="earn-vault-sheet-meta">
              Deposits {symbol} · {formatApy(vault.netApy)} yearly rate
              <InfoTip label="What is APY?" className="earn-info">
                {EARN_TIPS.apy}
              </InfoTip>
            </p>
            {vault.curator && <p className="earn-vault-sheet-meta">Managed by {vault.curator}</p>}
          </div>
          <button type="button" className="asset-sheet-close" onClick={onClose}>
            Close
          </button>
        </div>

        {userState == null ? (
          <p className="earn-state">Loading your balances…</p>
        ) : txState.step === 'done' ? (
          <div className="earn-tx-done" role="status">
            <p>
              {mode === 'deposit' ? 'Deposit complete.' : 'Withdrawal complete.'} Your balances
              update in a moment.
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
            <div className="earn-mode-tabs" role="tablist" aria-label="Deposit or withdraw">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'deposit'}
                className={`earn-mode-tab ${mode === 'deposit' ? 'active' : ''}`}
                onClick={() => {
                  setMode('deposit')
                  setAmountText('')
                  setInputError(null)
                }}
              >
                Deposit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'withdraw'}
                className={`earn-mode-tab ${mode === 'withdraw' ? 'active' : ''}`}
                disabled={!hasPosition}
                title={hasPosition ? undefined : 'You have nothing in this vault yet'}
                onClick={() => {
                  setMode('withdraw')
                  setAmountText('')
                  setInputError(null)
                }}
              >
                Withdraw
              </button>
            </div>

            <dl className="earn-vault-sheet-facts">
              {mode === 'deposit' ? (
                <>
                  <div>
                    <dt>In your wallet</dt>
                    <dd>{fmt(userState.walletBalance, decimals, symbol)}</dd>
                  </div>
                  {hasPosition && (
                    <div>
                      <dt>Already in this vault</dt>
                      <dd>{fmt(userState.assets, decimals, symbol)}</dd>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <dt>In this vault</dt>
                    <dd>{fmt(userState.assets, decimals, symbol)}</dd>
                  </div>
                  <div>
                    <dt>
                      Available to withdraw now
                      <InfoTip label="Why can availability differ?" className="earn-info">
                        {EARN_TIPS.withdrawalLiquidity}
                      </InfoTip>
                    </dt>
                    <dd>{fmt(userState.maxWithdrawAssets, decimals, symbol)}</dd>
                  </div>
                </>
              )}
            </dl>

            <div className="earn-amount-row">
              <label htmlFor="earn-amount">Amount ({symbol})</label>
              <div className="earn-amount-input">
                <input
                  id="earn-amount"
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

            {mode === 'deposit' && (
              <p className="earn-summary">
                Your {symbol} moves from your wallet into this vault and starts earning. You can
                withdraw it whenever you like.{' '}
                {isPasskey
                  ? 'One passkey confirmation covers the whole deposit — including the spending permission on a first deposit.'
                  : 'A first deposit asks for two quick wallet confirmations.'}
                <InfoTip label="About the spending permission" className="earn-info">
                  {EARN_TIPS.approval}
                </InfoTip>
              </p>
            )}
            {mode === 'withdraw' && (
              <p className="earn-summary">
                Your {symbol}, including what it has earned, moves from the vault back to your
                wallet.
              </p>
            )}

            {txState.step === 'error' && (
              <p className="earn-input-error" role="alert">
                {txState.error}
              </p>
            )}

            <button type="button" className="earn-btn primary earn-submit" onClick={submit} disabled={busy}>
              {txState.step === 'approving'
                ? isPasskey
                  ? 'Confirm with your passkey…'
                  : 'Approve, then confirm the deposit…'
                : txState.step === 'confirming'
                  ? isPasskey
                    ? 'Confirm with your passkey…'
                    : 'Waiting for confirmation…'
                  : mode === 'deposit'
                    ? `Deposit ${symbol}`
                    : `Withdraw ${symbol}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
