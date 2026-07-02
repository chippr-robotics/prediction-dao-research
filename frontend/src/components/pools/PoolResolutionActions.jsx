import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import Button from '../ui/Button'
import { payoutMatrixHash, payoutMatrixSum, serializeMatrix, parseMatrix } from '../../lib/pools/payout'
import { saveProposedMatrix, readProposedMatrix, readStoredMatrix } from '../../lib/pools/proposalStore'
import { sortParticipants } from '../../lib/pools/participantOrder'

/**
 * PoolResolutionActions (spec 034, US1 + pool-manager tester feedback) — the creator proposes a payout
 * outcome, members SEE and verify it before approving, and winners claim.
 *
 * Off-chain coordination (inherent to the anonymous design, no backend): each winner reveals their
 * "claim code" (claim-scope nullifier) to the creator; the creator builds the payout matrix
 * (claimCode → amount), proposes its hash on-chain, and shares the matrix preimage back so winners can
 * claim. Only the matrix HASH is on-chain; the preimage is copied/shared off-chain and verified against
 * the on-chain proposalId before anything renders as "the proposal".
 *
 * Controlled by the parent (PoolPage), which supplies the connected `pools` hook, the pool `summary`,
 * the anonymous `participants` roster, and the creator's `rankOrder`.
 */
export default function PoolResolutionActions({ summary, pools, participants = null, rankOrder = null, onChanged }) {
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

  // Creator propose-builder rows: { nickname?, claimCode, amount (human USDC) }
  const [rows, setRows] = useState([{ claimCode: '', amount: '' }])

  // Auto-populate the builder with one row per participant, in the creator's rank order (tester
  // feedback item 5) — the creator pairs each alias with the claim code that member reveals, instead
  // of assembling the list by hand. Only seeds while the builder is untouched.
  useEffect(() => {
    if (!participants || participants.length === 0) return
    setRows((rs) => {
      const pristine = rs.length === 1 && !rs[0].claimCode && !rs[0].amount && !rs[0].nickname
      if (!pristine) return rs
      return sortParticipants(participants, rankOrder).map((p) => ({ nickname: p.label, claimCode: '', amount: '' }))
    })
  }, [participants, rankOrder])
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

  // Members' view of the proposed split (tester bug item 7): the shared matrix, verified on-device
  // against the on-chain proposalId before it renders as "the proposal".
  const [sharedText, setSharedText] = useState('')
  useEffect(() => {
    if (summary.state !== 1 || !summary.currentProposalId) return
    const stored = readProposedMatrix(summary.address, summary.currentProposalId)
    if (stored) setSharedText((t) => t || stored.text)
  }, [summary.state, summary.currentProposalId, summary.address])

  // Prefill the claim form from this device's stored matrix once the pool resolves.
  useEffect(() => {
    if (summary.state !== 2) return
    const stored = readStoredMatrix(summary.address)
    if (stored) setMatrixText((t) => t || stored.text)
  }, [summary.state, summary.address])

  // Auto-detect the claimant's row: their claim code is unique in the matrix (tester feedback item 5).
  useEffect(() => {
    if (!claimCode || !matrixText) return
    const parsed = parseMatrix(matrixText)
    if (!parsed) return
    const idx = parsed.findIndex((e) => String(e.claimNullifier) === String(claimCode))
    if (idx >= 0) setClaimIndex(String(idx))
  }, [claimCode, matrixText])

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
      // Persist the preimage on this device so the creator can always re-copy it and the breakdown
      // renders after reload (only the hash lives on-chain).
      saveProposedMatrix(summary.address, proposalId, entries)
      setNotice('Outcome proposed. Share the matrix with the members so they can review and claim.')
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

  // Member-side verification of the shared proposal (item 7): render as "the proposal" ONLY when its
  // hash equals the on-chain proposalId; persist a verified paste so it survives reload.
  const sharedParsed = sharedText ? parseMatrix(sharedText) : null
  const sharedVerified = Boolean(
    sharedParsed && summary.currentProposalId && payoutMatrixHash(sharedParsed) === summary.currentProposalId
  )
  useEffect(() => {
    if (sharedVerified) saveProposedMatrix(summary.address, summary.currentProposalId, sharedParsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedVerified, sharedText])

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

      {/* What's actually being approved (item 7): visible + verified for every member during voting */}
      {summary.state === 1 && summary.currentProposalId && (
        <div className="pool-proposal-details" data-testid="proposal-details">
          <h2>Proposed payout</h2>
          {sharedVerified ? (
            <>
              <p data-testid="proposal-verified">
                Verified against the on-chain proposal ✓ — this is exactly what an approval endorses.
              </p>
              <table className="pool-proposal-table">
                <thead>
                  <tr><th scope="col">#</th><th scope="col">Claim code</th><th scope="col">Amount</th></tr>
                </thead>
                <tbody>
                  {sharedParsed.map((e, i) => {
                    const mine = claimCode != null && String(e.claimNullifier) === String(claimCode)
                    return (
                      <tr key={i} className={mine ? 'is-you' : undefined}>
                        <td>{i + 1}</td>
                        <td><code>{shortCode(e.claimNullifier)}</code>{mine ? ' (you)' : ''}</td>
                        <td>{ethers.formatUnits(BigInt(e.amount), decimals)} {summary.tokenSymbol}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <p>
                The creator proposed a split — only its fingerprint is on-chain. Paste the matrix the
                creator shared to see and verify exactly what you&apos;d be approving.
              </p>
              <label htmlFor="shared-matrix">Payout matrix (shared by the creator)</label>
              <textarea id="shared-matrix" rows={3} value={sharedText} onChange={(e) => setSharedText(e.target.value)} />
              {sharedText && !sharedVerified && (
                <p className="form-error" role="alert" data-testid="proposal-mismatch">
                  {sharedParsed
                    ? 'This matrix does NOT match the on-chain proposal — do not approve based on it.'
                    : 'Could not parse that matrix.'}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Creator: build + propose the payout outcome (while resolving) */}
      {summary.isCreator && summary.state === 1 && summary.withinResolutionWindow && (
        <div className="pool-propose" data-testid="propose-builder">
          <h2>Propose the payout</h2>
          <p>
            {rows.some((r) => r.nickname)
              ? 'One row per participant, in your rank order — pair each alias with the claim code that member reveals.'
              : 'Enter each winner’s claim code and amount.'}{' '}
            The total must equal the escrow ({ethers.formatUnits(escrow, decimals)} {summary.tokenSymbol}).
          </p>
          {rows.map((r, i) => (
            <div className="pool-propose-row" key={i}>
              {r.nickname && (
                <span className="pool-propose-nick" data-testid={`propose-nick-${i}`}>{r.nickname}</span>
              )}
              <input
                aria-label={`Claim code ${i + 1}`}
                placeholder={r.nickname ? `claim code from ${r.nickname}` : 'winner claim code'}
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

/** Truncate a long claim-code integer for table display. */
function shortCode(code) {
  const s = String(code)
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s
}
