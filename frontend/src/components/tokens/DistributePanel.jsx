import { useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { MAX_BATCH, parseDistribution } from './distributeUtils'

// Spec 028 (US11, FR-040) — batch distribute / airdrop for fungible v2 tokens. Paste recipients + amounts, see a
// pre-submission preview (count / total), and submit a single bounded on-chain transaction (batchMint to mint
// new supply, or batchTransfer from your own balance). The MAX_BATCH bound is surfaced — never silently
// truncated. Real tx with honest state via the shared `run()` (which fires app-level notifications).

export default function DistributePanel({ caps, run, busy, canMint }) {
  const [mode, setMode] = useState('mint') // 'mint' | 'transfer'
  const [raw, setRaw] = useState('')
  const decimals = caps?.decimals ?? 18

  const { rows, errors } = useMemo(() => parseDistribution(raw), [raw])
  const total = useMemo(() => rows.reduce((sum, r) => sum + Number(r.amount), 0), [rows])
  const overLimit = rows.length > MAX_BATCH

  async function distribute() {
    const recipients = rows.map((r) => r.addr)
    const amounts = rows.map((r) => ethers.parseUnits(String(r.amount), decimals))
    await run(mode === 'mint' ? 'Batch mint' : 'Batch distribute', (c) =>
      mode === 'mint' ? c.batchMint(recipients, amounts) : c.batchTransfer(recipients, amounts)
    )
  }

  // Mint mode requires the minter role; transfer-from-balance needs no role (the tx reverts if short).
  const canSubmit = !busy && rows.length > 0 && errors.length === 0 && !overLimit && (mode === 'transfer' || canMint)

  return (
    <div role="tabpanel" className="tm-grid-2">
      <div className="tm-card">
        <h4 style={{ marginBottom: '0.5rem' }}>Recipients &amp; amounts</h4>
        <p className="tm-intro" style={{ margin: '0 0 0.6rem' }}>
          One per line: <code>address, amount</code>. {mode === 'mint' ? 'Mints new supply to each recipient.' : 'Transfers from your balance to each recipient.'}
        </p>
        <div className="tm-row-actions" style={{ marginBottom: '0.6rem' }}>
          <label className="tm-checkbox"><input type="radio" name="dist-mode" checked={mode === 'mint'} onChange={() => setMode('mint')} /> Mint to recipients</label>
          <label className="tm-checkbox"><input type="radio" name="dist-mode" checked={mode === 'transfer'} onChange={() => setMode('transfer')} /> Transfer from my balance</label>
        </div>
        <textarea
          className="tm-textarea tm-mono"
          rows={7}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'0xabc…, 1000\n0xdef…, 2500'}
          aria-label="Recipients and amounts"
        />
        {errors.length > 0 && (
          <div className="tm-error" role="alert">{errors.slice(0, 5).join(' · ')}{errors.length > 5 ? ` · +${errors.length - 5} more` : ''}</div>
        )}
        {overLimit && (
          <div className="tm-error" role="alert">
            {rows.length} recipients exceeds the per-transaction limit of {MAX_BATCH}. Split into multiple batches.
          </div>
        )}
      </div>

      <div className="tm-card tm-rail">
        <h4 style={{ marginBottom: '0.75rem' }}>Distribution preview</h4>
        <div className="tm-kv"><span className="k">Mode</span><span>{mode === 'mint' ? 'Mint' : 'Transfer'}</span></div>
        <div className="tm-kv"><span className="k">Recipients</span><span className="tm-mono">{rows.length}</span></div>
        <div className="tm-kv"><span className="k">Total amount</span><span className="tm-mono">{total.toLocaleString()}</span></div>
        <div className="tm-kv"><span className="k">Per-tx limit</span><span className="tm-mono">{MAX_BATCH}</span></div>
        <button type="button" className="tm-btn tm-btn-primary" style={{ width: '100%', marginTop: '0.9rem' }} disabled={!canSubmit} onClick={distribute}>
          {busy ? 'Submitting…' : mode === 'mint' ? 'Mint & distribute' : 'Distribute'}
        </button>
        {mode === 'mint' && !canMint && <p className="tm-std-desc" style={{ marginTop: '0.5rem' }}>Minting requires the minter role. Switch to “Transfer from my balance” to distribute existing tokens.</p>}
      </div>
    </div>
  )
}
