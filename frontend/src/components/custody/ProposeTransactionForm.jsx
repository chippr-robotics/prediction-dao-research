// Spec 043 (US2) — propose a transfer from the vault: native asset or an ERC-20. Builds {to,value,data} and
// hands it to onPropose (which creates the vault proposal). Presentational; encoding is local + pure.
// Spec 049 (US4, FR-012) — when the vault is policy-managed, the draft is pre-flighted against the guard's
// own previewTransaction and any violation is surfaced (rule + values) WITHOUT blocking submission: the
// chain remains the enforcer, the warning just saves co-owners from approving a doomed transaction.

import { useState, useMemo, useEffect } from 'react'
import { buildTransferPayload } from '../../lib/custody/transfers'
import { getPolicyStatus, previewPolicy } from '../../lib/custody/policy'
import './Policy.css'

const RULE_LABELS = {
  perTxLimit: 'per-transaction limit',
  windowLimit: '24-hour window limit',
  allowlist: 'recipient allowlist',
  cooldown: 'transaction delay',
}

export default function ProposeTransactionForm({ onPropose, onDone, vault }) {
  const [assetType, setAssetType] = useState('native') // 'native' | 'token'
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [tokenAddress, setTokenAddress] = useState('')
  const [decimals, setDecimals] = useState('18')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const validationError = useMemo(() => {
    try {
      if (!recipient.trim() || !amount.trim()) return 'Recipient and amount are required'
      buildTransferPayload({
        recipient: recipient.trim(),
        amount,
        tokenAddress: assetType === 'token' ? tokenAddress.trim() : null,
        decimals,
      })
      return null
    } catch (e) {
      return e.message
    }
  }, [recipient, amount, tokenAddress, decimals, assetType])

  // Spec 049 — the vault's policy status, fetched once per vault; only 'managed' vaults preview.
  const [policyStatus, setPolicyStatus] = useState(null)
  useEffect(() => {
    if (!vault?.address || vault?.chainId == null) return undefined
    let on = true
    getPolicyStatus(vault.address, vault.chainId)
      .then((s) => {
        if (on) setPolicyStatus(s)
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [vault?.address, vault?.chainId])

  // Pre-flight the draft whenever it changes (debounced). Failures stay silent — the preview is
  // advisory; the chain enforces (FR-012).
  const [violation, setViolation] = useState(null)
  useEffect(() => {
    if (policyStatus !== 'managed' || validationError) return undefined
    let on = true
    const timer = setTimeout(async () => {
      try {
        const payload = buildTransferPayload({
          recipient: recipient.trim(),
          amount,
          tokenAddress: assetType === 'token' ? tokenAddress.trim() : null,
          decimals,
        })
        const res = await previewPolicy(vault.address, vault.chainId, payload)
        if (on) setViolation(res.ok ? null : res.violation)
      } catch {
        if (on) setViolation(null)
      }
    }, 250)
    return () => {
      on = false
      clearTimeout(timer)
    }
  }, [policyStatus, validationError, recipient, amount, tokenAddress, decimals, assetType, vault?.address, vault?.chainId])
  // Only surface the warning while the draft is valid and the vault is actually policy-managed.
  const activeViolation = policyStatus === 'managed' && !validationError ? violation : null

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      const payload = buildTransferPayload({
        recipient: recipient.trim(),
        amount,
        tokenAddress: assetType === 'token' ? tokenAddress.trim() : null,
        decimals,
      })
      await onPropose(payload)
      onDone?.()
    } catch (e) {
      setError(e?.message || 'Could not create the proposal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="custody-propose" onSubmit={(e) => e.preventDefault()} aria-label="Propose a transfer">
      <fieldset>
        <legend>Asset</legend>
        <label>
          <input
            type="radio"
            name="asset"
            checked={assetType === 'native'}
            onChange={() => setAssetType('native')}
          />
          Native
        </label>
        <label>
          <input
            type="radio"
            name="asset"
            checked={assetType === 'token'}
            onChange={() => setAssetType('token')}
          />
          Token (ERC-20)
        </label>
      </fieldset>

      {assetType === 'token' && (
        <>
          <div className="custody-field">
            <label htmlFor="propose-token">Token address</label>
            <input id="propose-token" type="text" placeholder="0x…" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} />
          </div>
          <div className="custody-field">
            <label htmlFor="propose-decimals">Token decimals</label>
            <input id="propose-decimals" type="number" min={0} max={36} value={decimals} onChange={(e) => setDecimals(e.target.value)} />
          </div>
        </>
      )}

      <div className="custody-field">
        <label htmlFor="propose-recipient">Recipient</label>
        <input id="propose-recipient" type="text" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      </div>
      <div className="custody-field">
        <label htmlFor="propose-amount">Amount</label>
        <input id="propose-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>

      {activeViolation && (
        <p className="custody-warning" role="alert">
          Policy warning — {RULE_LABELS[activeViolation.rule] || 'vault policy'}: {activeViolation.message}. You can
          still propose this transaction, but the vault will block it at execution.
        </p>
      )}

      {validationError && (
        <p className="custody-error" role="alert">
          {validationError}
        </p>
      )}
      {error && (
        <p className="custody-error" role="alert">
          {error}
        </p>
      )}

      <div className="custody-actions">
        <button type="button" onClick={submit} disabled={!!validationError || busy}>
          {busy ? 'Proposing…' : 'Propose transfer'}
        </button>
      </div>
    </form>
  )
}
