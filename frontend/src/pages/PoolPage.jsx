import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePools } from '../hooks/usePools'
import { poolStateDisplay } from '../lib/pools/poolContracts'
import { deriveNickname } from '../lib/pools/nickname'
import { payoutDisplayMap } from '../lib/pools/payout'
import { readProposedMatrix, readStoredMatrix } from '../lib/pools/proposalStore'
import Button from '../components/ui/Button'
import PoolParticipants from '../components/pools/PoolParticipants'
import PoolResolutionActions from '../components/pools/PoolResolutionActions'
import './pools.css'

// Creator's device-local rank arrangement (until a cross-member sync channel ships, so other members
// keep the alphabetical view).
const rankKey = (pool) => `fairwins_pool_rank_v1_${String(pool || '').toLowerCase()}`
function readRankOrder(pool) {
  try {
    const raw = localStorage.getItem(rankKey(pool))
    const arr = raw ? JSON.parse(raw) : null
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}
function writeRankOrder(pool, order) {
  try {
    localStorage.setItem(rankKey(pool), JSON.stringify(order))
  } catch {
    /* private browsing / quota — degrade to session-only */
  }
}

/**
 * PoolPage (spec 034) — view a pool's live, on-chain state and take the state-appropriate action. The
 * roster, standings, and proposed payout are unified into one display (UX round 3): once a payout is
 * proposed, the members' cards show medals + amounts. Honest finality (Principle III): pending, closed,
 * resolved, and refund-eligible states are surfaced truthfully.
 */
export default function PoolPage() {
  const { address } = useParams()
  const pools = usePools()
  const {
    getPoolSummary, peekPoolIdentity, restorePoolIdentity, getMemberCommitments,
    joinPool, closeJoining, cancelPool, vote, refund, status,
  } = pools
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  // The member's display identity ({ nickname, claimCode, commitment }) — auto-restored, never click-gated.
  const [identity, setIdentity] = useState(null)
  const [identityStatus, setIdentityStatus] = useState('idle') // idle | restoring | failed
  const [notice, setNotice] = useState(null)
  const [voteProgress, setVoteProgress] = useState(null)

  // The anonymous participant roster (alias cards) + the creator's device-local rank arrangement.
  const [participants, setParticipants] = useState(null)
  const [rankOrder, setRankOrder] = useState(() => readRankOrder(address))
  const handleReorder = (order) => {
    setRankOrder(order)
    writeRankOrder(address, order)
  }

  // The verified proposed/locked payout (from the device-local store, keyed to the on-chain proposalId).
  // Bumped by `proposalNonce` when a member pastes a freshly-received payout so this re-reads.
  const [proposalNonce, setProposalNonce] = useState(0)
  const [verifiedProposal, setVerifiedProposal] = useState(null)

  const reload = useCallback(async () => {
    try {
      const s = await getPoolSummary(address)
      setSummary(s)
      setError(null)
    } catch (e) {
      setError(e?.shortMessage || e?.message || String(e))
      setSummary(null)
    }
  }, [address, getPoolSummary])

  useEffect(() => {
    let active = true
    getPoolSummary(address)
      .then((s) => active && (setSummary(s), setError(null)))
      .catch((e) => active && (setError(e?.shortMessage || e?.message || String(e)), setSummary(null)))
    return () => {
      active = false
    }
  }, [address, getPoolSummary])

  const loaded = summary && summary.address === address

  // Load the anonymous roster from PUBLIC Joined-event commitments (no signature) and derive each alias.
  useEffect(() => {
    if (!loaded) return undefined
    let active = true
    Promise.resolve()
      .then(() => getMemberCommitments(address))
      .then((commitments) => {
        if (!active || !Array.isArray(commitments)) return
        setParticipants(
          commitments.map((c) => {
            const n = deriveNickname(c, address)
            return { commitment: c.toString(), label: n.label, suffix: n.suffix }
          })
        )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [loaded, address, getMemberCommitments])

  // ALWAYS auto-show a joined member's identity: cache-first (no prompt on the device they joined from);
  // when the cache is missing, restore it automatically with one wallet signature. Declining falls back
  // to the manual Reveal button.
  useEffect(() => {
    if (!loaded || !summary.hasJoined || identity) return undefined
    let active = true
    ;(async () => {
      try {
        const peeked = await peekPoolIdentity?.(address)
        if (!active) return
        if (peeked?.nickname) {
          setIdentity({ nickname: peeked.nickname, claimCode: peeked.claimCode || null, commitment: peeked.commitment || null })
          return
        }
        setIdentityStatus('restoring')
        const restored = await restorePoolIdentity(address)
        if (!active) return
        setIdentity({ nickname: restored.nickname, claimCode: restored.claimCode, commitment: restored.commitment })
        setIdentityStatus('idle')
      } catch {
        if (active) setIdentityStatus('failed')
      }
    })()
    return () => {
      active = false
    }
  }, [loaded, summary, identity, address, peekPoolIdentity, restorePoolIdentity])

  // Read the device-local proposal that matches the current on-chain proposalId (or the locked outcome
  // once resolved), so the roster can render medals/amounts and the claim can auto-fill.
  useEffect(() => {
    if (!loaded) return
    if (summary.state === 1 && summary.currentProposalId) {
      const stored = readProposedMatrix(address, summary.currentProposalId)
      setVerifiedProposal(stored ? { entries: stored.entries, display: stored.display } : null)
    } else if (summary.state === 2) {
      const stored = readStoredMatrix(address)
      setVerifiedProposal(stored ? { entries: stored.entries, display: stored.display } : null)
    } else {
      setVerifiedProposal(null)
    }
  }, [loaded, summary?.state, summary?.currentProposalId, address, proposalNonce])

  // { commitment → amount } for the roster. Prefer the creator's shared display map; else fall back to
  // just the member's own row (so they at least see their own payout highlighted).
  const payoutByCommitment = useMemo(() => {
    if (!verifiedProposal) return null
    const map = payoutDisplayMap(verifiedProposal.entries, verifiedProposal.display)
    if (map) return map
    if (identity?.claimCode && identity?.commitment) {
      const mine = verifiedProposal.entries.find((e) => String(e.claimNullifier) === String(identity.claimCode))
      if (mine) return new Map([[String(identity.commitment), BigInt(mine.amount)]])
    }
    return null
  }, [verifiedProposal, identity])

  const run = async (fn) => {
    setNotice(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setNotice(e?.shortMessage || e?.message || String(e))
    }
  }

  const joinThisPool = () =>
    run(async () => {
      await joinPool(address)
      setIdentity(null) // force a fresh identity restore now that we're a member
    })

  const approve = () =>
    run(async () => {
      setVoteProgress('Preparing your anonymous approval…')
      try {
        await vote(address, (msg) => setVoteProgress(msg))
      } finally {
        setVoteProgress(null)
      }
    })

  // Manual fallback, only reached when the automatic identity restore failed (declined signature).
  const revealNickname = () =>
    run(async () => {
      const restored = await restorePoolIdentity(address)
      setIdentity({ nickname: restored.nickname, claimCode: restored.claimCode, commitment: restored.commitment })
      setIdentityStatus('idle')
    })

  if (error) {
    return (
      <main className="page pool-page" aria-labelledby="pool-h">
        <h1 id="pool-h">Pool</h1>
        <p role="alert" className="form-error">{error}</p>
      </main>
    )
  }

  if (!loaded) {
    return (
      <main className="page pool-page" aria-labelledby="pool-h">
        <h1 id="pool-h">Pool</h1>
        <p>Loading pool…</p>
      </main>
    )
  }

  const canJoin = !summary.hasJoined && summary.state === 0 && summary.slotsRemaining > 0

  return (
    <main className="page pool-page" aria-labelledby="pool-h">
      <h1 id="pool-h">Group pool</h1>

      {/* Pool details are collapsed by default (tester feedback: they took up too much space). The
          one-line summary keeps the essentials visible; expand for the full breakdown. */}
      <details className="pool-summary" aria-label="Pool details" data-testid="pool-summary">
        <summary className="pool-summary-line">
          <span className="pool-summary-status" data-testid="pool-state">{poolStateDisplay(summary.state)}</span>
          <span className="pool-summary-sep" aria-hidden="true">·</span>
          <span>{summary.buyInFormatted} {summary.tokenSymbol} buy-in</span>
          <span className="pool-summary-sep" aria-hidden="true">·</span>
          <span>{summary.memberCount}/{summary.maxMembers} members</span>
        </summary>
        <dl>
          <dt>Status</dt>
          <dd>{poolStateDisplay(summary.state)}</dd>
          <dt>Buy-in</dt>
          <dd>{summary.buyInFormatted} {summary.tokenSymbol}</dd>
          <dt>Members</dt>
          <dd>{summary.memberCount} / {summary.maxMembers}</dd>
          <dt>Approval threshold</dt>
          <dd>{summary.thresholdPct}% of members who join</dd>
        </dl>
      </details>

      {/* Identity is only meaningful for joined members. */}
      {summary.hasJoined && (
        <section className="pool-identity" aria-label="Your identity">
          {identity?.nickname ? (
            <p>You are <strong data-testid="my-nickname">{identity.nickname.label}</strong> in this pool.</p>
          ) : identityStatus === 'restoring' ? (
            <p data-testid="identity-restoring">
              Restoring your pool identity… confirm the signature in your wallet if prompted.
            </p>
          ) : (
            <Button variant="secondary" onClick={revealNickname}>Reveal my nickname</Button>
          )}
        </section>
      )}

      {/* Join — the creator (or any viewer) can take part in the pool while joining is open. */}
      {canJoin && (
        <section className="pool-actions" aria-label="Join">
          <Button data-testid="join-pool" onClick={joinThisPool} disabled={status === 'joining'}>
            {status === 'joining' ? 'Joining…' : `Join this pool — ${summary.buyInFormatted} ${summary.tokenSymbol}`}
          </Button>
          {summary.isCreator && <p className="pool-hint">You created this pool; join it to take part yourself.</p>}
        </section>
      )}

      {/* Unified roster + standings: alias cards for everyone; medals/amounts once a payout is proposed */}
      {summary.state !== 3 && (
        <PoolParticipants
          participants={participants}
          isCreator={summary.isCreator}
          order={rankOrder}
          onReorder={handleReorder}
          payoutByCommitment={payoutByCommitment}
          tokenSymbol={summary.tokenSymbol}
          tokenDecimals={summary.tokenDecimals}
          resolved={summary.state === 2}
        />
      )}

      {/* Creator controls while joining is open */}
      {summary.isCreator && summary.state === 0 && (
        <section className="pool-actions" aria-label="Creator actions">
          <Button data-testid="close-joining" onClick={() => run(() => closeJoining(address))} disabled={status === 'creating'}>
            Close joining now
          </Button>
          <Button variant="danger" data-testid="cancel-pool" onClick={() => run(() => cancelPool(address))}>
            Cancel pool
          </Button>
        </section>
      )}

      {/* Resolution: members approve the creator's proposed outcome */}
      {summary.state === 1 && summary.withinResolutionWindow && (
        <section className="pool-resolution" aria-label="Resolution">
          {summary.currentProposalId ? (
            <>
              <p data-testid="approval-progress">
                Approvals: {summary.approvalCount} / {summary.requiredApprovals} needed
              </p>
              {summary.hasJoined && (
                <>
                  <Button
                    data-testid="approve-outcome"
                    onClick={approve}
                    disabled={status === 'voting'}
                  >
                    {status === 'voting' ? 'Approving…' : 'Approve the proposed payout'}
                  </Button>
                  {voteProgress && <p className="pool-hint" role="status" data-testid="vote-progress">{voteProgress}</p>}
                </>
              )}
            </>
          ) : (
            <p data-testid="awaiting-proposal">
              Joining is closed. Waiting for the creator to propose how the pot is split.
            </p>
          )}
        </section>
      )}

      {summary.state === 2 && (
        <section className="pool-resolved" aria-label="Resolved">
          <p data-testid="pool-resolved">This pool is resolved. Winners can claim their share below.</p>
        </section>
      )}

      {/* Resolution loop: creator propose/revise, member receive+dispute, winner claim */}
      {(summary.hasJoined || summary.isCreator || summary.state === 2) && summary.state !== 3 && (
        <PoolResolutionActions
          summary={{ ...summary, myCommitment: identity?.commitment || null }}
          pools={pools}
          participants={participants}
          rankOrder={rankOrder}
          claimCode={identity?.claimCode || null}
          verifiedProposal={verifiedProposal}
          payoutByCommitment={payoutByCommitment}
          onProposalReceived={() => setProposalNonce((n) => n + 1)}
          onChanged={reload}
        />
      )}

      {summary.refundEligible && (
        <section className="pool-actions" aria-label="Refund">
          <Button data-testid="refund" onClick={() => run(() => refund(address))} disabled={status === 'refunding'}>
            {status === 'refunding' ? 'Refunding…' : `Refund my ${summary.buyInFormatted} ${summary.tokenSymbol}`}
          </Button>
        </section>
      )}

      {notice && <p role="alert" className="form-error" data-testid="pool-notice">{notice}</p>}
    </main>
  )
}
