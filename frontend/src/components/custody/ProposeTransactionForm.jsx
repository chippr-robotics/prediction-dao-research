// Spec 043 (US2) — propose a transfer from the vault: native asset or an ERC-20. Builds {to,value,data} and
// hands it to onPropose (which creates the vault proposal). Presentational; encoding is local + pure.

import { useState, useMemo } from 'react'
import { buildTransferPayload } from '../../lib/custody/transfers'

export default function ProposeTransactionForm({ onPropose, onDone }) {
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
