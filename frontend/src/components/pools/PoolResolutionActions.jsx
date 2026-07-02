import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import Button from '../ui/Button'
import { payoutMatrixHash, payoutMatrixSum, serializeMatrix, parseMatrix } from '../../lib/pools/payout'

/**
 * PoolResolutionActions (spec 034, US1) — the creator proposes a payout outcome and winners claim.
 *
 * Off-chain coordination (inherent to the anonymous design, no backend): each winner reveals their
 * "claim code" (claim-scope nullifier) to the creator; the creator builds the payout matrix
 * (claimCode → amount), proposes its hash on-chain, and shares the matrix preimage back so winners can
 * claim. Only the matrix HASH is on-chain; the preimage is copied/shared off-chain.
 *
 * Controlled by the parent (PoolPage), which supplies the connected `pools` hook + the pool `summary`.
 */
export default function PoolResolutionActions({ summary, pools, onChanged }) {
  const { proposeOutcome, claimWinnings, getMyClaimCode, peekPoolIdentity, status } = pools
  const decimals = summary.tokenDecimals || 6
  const escrow = BigInt(summary.frozenDenominator || summary.memberCount || 0) * BigInt(summary.buyIn || 0)

  const [claimCode, setClaimCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  // Auto-show the member's claim code (tester feedback) — cache-only read, derived at join time; the
  // Reveal button stays as the fallback for members who joined before caching existed.
  useEffect(() => {
    if (!summary.hasJoined || claimCode) return
    let active = true
    peekPoolIdentity?.(summary.address)
      .then((id) => active && id?.claimCode && setClaimCode(id.claimCode))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [summary.hasJoined, summary.address, claimCode, peekPoolIdentity])

  // Creator propose-builder rows: { claimCode, amount (human USDC) }
  const [rows, setRows] = useState([{ claimCode: '', amount: '' }])
  const entries = rows
    .filter((r) => r.claimCode && r.amount)
    .map((r) => ({ claimNullifier: r.claimCode.trim(), amount: ethers.parseUnits(String(r.amount), decimals) }))
  const matrixComplete = entries.length === rows.filter((r) => r.claimCode || r.amount).length && entries.length > 0
  const sum = matrixComplete ? payoutMatrixSum(entries) : 0n
  const sumOk = matrixComplete && sum === escrow
  const proposalId = sumOk ? payoutMatrixHash(entries) : null

  // Winner claim inputs
  const [matrixText, setMatrixText] = useState('')
  const [claimIndex, setClaimIndex] = useState('0')
  const [recipient, setRecipient] = useState('')

  const reveal = async () => {
    setBusy(true)
    setNotice(null)
    try {
      setClaimCode(await getMyClaimCode(summary.address))
    } catch (e) {
      setNotice(e?.shortMessage || e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const propose = async () => {
    setNotice(null)
    try {
      await proposeOutcome(summary.address, proposalId)
      setNotice('Outcome proposed. Share the matrix with winners so they can claim.')
      onChanged?.()
    } catch (e) {
      setNotice(e?.shortMessage || e?.message || String(e))
    }
  }

  const claim = async () => {
    setNotice(null)
    const parsed = parseMatrix(matrixText)
    if (!parsed) {
      setNotice('Could not parse the payout matrix the creator shared.')
      return
    }
    try {
      await claimWinnings(summary.address, {
        entries: parsed.map((e) => ({ claimNullifier: e.claimNullifier, amount: e.amount })),
        index: Number(claimIndex),
        recipient, // required (button disabled when empty)
      })
      setNotice('Claimed.')
      onChanged?.()
    } catch (e) {
      setNotice(e?.shortMessage || e?.message || String(e))
    }
  }

  const setRow = (i, k) => (e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))

  return (
    <section className="pool-resolution-actions" aria-label="Resolution actions">
      {/* Any joined member can reveal their claim code to give to the creator */}
      {summary.hasJoined && (
        <div className="pool-claim-code">
          {claimCode ? (
            <p>
              Your claim code (give this to the creator to receive a payout):{' '}
              <code data-testid="my-claim-code">{claimCode}</code>
            </p>
          ) : (
            <Button variant="secondary" onClick={reveal} disabled={busy}>
              {busy ? 'Revealing…' : 'Reveal my claim code'}
            </Button>
          )}
        </div>
      )}

      {/* Creator: build + propose the payout outcome (while resolving) */}
      {summary.isCreator && summary.state === 1 && summary.withinResolutionWindow && (
        <div className="pool-propose" data-testid="propose-builder">
          <h2>Propose the payout</h2>
          <p>
            Enter each winner&apos;s claim code and amount. The total must equal the escrow (
            {ethers.formatUnits(escrow, decimals)} {summary.tokenSymbol}).
          </p>
          {rows.map((r, i) => (
            <div className="pool-propose-row" key={i}>
              <input
                aria-label={`Claim code ${i + 1}`}
                placeholder="winner claim code"
                value={r.claimCode}
                onChange={setRow(i, 'claimCode')}
              />
              <input
                aria-label={`Amount ${i + 1}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="amount"
                value={r.amount}
                onChange={setRow(i, 'amount')}
              />
            </div>
          ))}
          <div className="pool-propose-controls">
            <Button variant="secondary" onClick={() => setRows((rs) => [...rs, { claimCode: '', amount: '' }])}>
              Add winner
            </Button>
            {matrixComplete && !sumOk && (
              <span className="form-error" role="alert">
                Total {ethers.formatUnits(sum, decimals)} ≠ escrow {ethers.formatUnits(escrow, decimals)}
              </span>
            )}
            {sumOk && (
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(serializeMatrix(entries))}>
                Copy matrix
              </Button>
            )}
            <Button data-testid="propose-outcome" onClick={propose} disabled={!sumOk}>
              Propose outcome
            </Button>
          </div>
        </div>
      )}

      {/* Resolved: winners claim by pasting the shared matrix */}
      {summary.state === 2 && (
        <div className="pool-claim" data-testid="claim-form">
          <h2>Claim your winnings</h2>
          <label htmlFor="claim-matrix">Payout matrix (shared by the creator)</label>
          <textarea id="claim-matrix" value={matrixText} onChange={(e) => setMatrixText(e.target.value)} rows={3} />
          <label htmlFor="claim-index">Your row index</label>
          <input id="claim-index" type="number" min="0" value={claimIndex} onChange={(e) => setClaimIndex(e.target.value)} />
          <label htmlFor="claim-recipient">Pay to address</label>
          <input id="claim-recipient" placeholder="0x… (any address)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <Button data-testid="claim" onClick={claim} disabled={status === 'claiming' || !matrixText || !recipient}>
            {status === 'claiming' ? 'Claiming…' : 'Claim'}
          </Button>
        </div>
      )}

      {notice && <p role="alert" className="pool-resolution-notice">{notice}</p>}
    </section>
  )
}
