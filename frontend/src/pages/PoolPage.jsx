import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePools } from '../hooks/usePools'
import { poolStateDisplay } from '../lib/pools/poolContracts'
import { deriveNickname } from '../lib/pools/nickname'
import Button from '../components/ui/Button'
import PoolLeaderboard from '../components/pools/PoolLeaderboard'
import PoolParticipants from '../components/pools/PoolParticipants'
import PoolResolutionActions from '../components/pools/PoolResolutionActions'
import './pools.css'

// Creator's device-local rank arrangement (until a sync channel ships — same honest limitation as the
// interim leaderboard, so other members keep the alphabetical view).
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
 * PoolPage (spec 034) — view a pool's live, on-chain state and take the state-appropriate action
 * (creator: close/cancel; member: approve the outcome or refund). Honest finality (Principle III):
 * pending, closed, resolved, and refund-eligible states are surfaced truthfully.
 */
export default function PoolPage() {
  const { address } = useParams()
  const pools = usePools()
  const {
    getPoolSummary, peekPoolIdentity, restorePoolIdentity, getMemberCommitments,
    closeJoining, cancelPool, vote, refund, status,
  } = pools
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  // The member's display identity ({ nickname, claimCode }) — auto-restored, never click-gated.
  const [identity, setIdentity] = useState(null)
  const [identityStatus, setIdentityStatus] = useState('idle') // idle | restoring | failed
  const [notice, setNotice] = useState(null)

  // The anonymous participant roster (alias cards) + the creator's device-local rank arrangement.
  const [participants, setParticipants] = useState(null)
  const [rankOrder, setRankOrder] = useState(() => readRankOrder(address))
  const handleReorder = (order) => {
    setRankOrder(order)
    writeRankOrder(address, order)
  }

  // Off-chain interim leaderboard (US4). Local to this session until the sync channel ships (T050);
  // PoolLeaderboard marks it non-final/off-chain so this is honest.
  const [standings, setStandings] = useState([])
  const lbId = useRef(0)
  const addPlayer = (nick) =>
    setStandings((s) => [...s, { id: `p${lbId.current++}`, nickname: nick, score: 0, eliminated: false }])
  const scoreChange = (id, score) =>
    setStandings((s) => s.map((e) => (e.id === id ? { ...e, score } : e)))
  const toggleEliminate = (id) =>
    setStandings((s) => s.map((e) => (e.id === id ? { ...e, eliminated: !e.eliminated } : e)))
  const removePlayer = (id) => setStandings((s) => s.filter((e) => e.id !== id))

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

  // Load the anonymous roster from PUBLIC Joined-event commitments (no signature) and derive each
  // member's alias — so everyone sees who's in, and the creator can rank (tester feedback, items 3–4).
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

  // Auto-populate the interim leaderboard from the roster so the creator never types names in by hand
  // (tester feedback, item 5). Manual additions stay possible for guests/edge cases.
  useEffect(() => {
    if (!participants || participants.length === 0) return
    setStandings((s) =>
      s.length ? s : participants.map((p) => ({ id: p.commitment, nickname: p.label, score: 0, eliminated: false }))
    )
  }, [participants])

  // ALWAYS auto-show a joined member's identity (live-app tester feedback): cache-first (no prompt at
  // all on the device they joined from); when the cache is missing (new device, cleared storage,
  // pre-cache join) restore it automatically with one wallet signature. Declining the signature falls
  // back to the manual Reveal button.
  useEffect(() => {
    if (!loaded || !summary.hasJoined || identity) return undefined
    let active = true
    ;(async () => {
      try {
        const peeked = await peekPoolIdentity?.(address)
        if (!active) return
        if (peeked?.nickname) {
          setIdentity({ nickname: peeked.nickname, claimCode: peeked.claimCode || null })
          return
        }
        setIdentityStatus('restoring')
        const restored = await restorePoolIdentity(address)
        if (!active) return
        setIdentity({ nickname: restored.nickname, claimCode: restored.claimCode })
        setIdentityStatus('idle')
      } catch {
        if (active) setIdentityStatus('failed')
      }
    })()
    return () => {
      active = false
    }
  }, [loaded, summary, identity, address, peekPoolIdentity, restorePoolIdentity])

  const run = async (fn) => {
    setNotice(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setNotice(e?.shortMessage || e?.message || String(e))
    }
  }

  // Manual fallback, only reached when the automatic restore failed (e.g. the signature was declined).
  const revealNickname = () =>
    run(async () => {
      const restored = await restorePoolIdentity(address)
      setIdentity({ nickname: restored.nickname, claimCode: restored.claimCode })
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

  return (
    <main className="page pool-page" aria-labelledby="pool-h">
      <h1 id="pool-h">Group pool</h1>

      <section className="pool-summary" aria-label="Pool details" data-testid="pool-summary">
        <dl>
          <dt>Status</dt>
          <dd data-testid="pool-state">{poolStateDisplay(summary.state)}</dd>
          <dt>Buy-in</dt>
          <dd>{summary.buyInFormatted} {summary.tokenSymbol}</dd>
          <dt>Members</dt>
          <dd>{summary.memberCount} / {summary.maxMembers}</dd>
          <dt>Approval threshold</dt>
          <dd>{summary.thresholdPct}% of members who join</dd>
        </dl>
      </section>

      {/* Identity is only meaningful for joined members — a viewer (or a creator who hasn't joined
          their own pool) has no alias here, so no Reveal button is dangled at them. */}
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

      {/* Anonymous roster: alias cards for everyone; the creator can drag/arrange the rank order */}
      {summary.state !== 3 && (
        <PoolParticipants
          participants={participants}
          isCreator={summary.isCreator}
          order={rankOrder}
          onReorder={handleReorder}
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
                <Button
                  data-testid="approve-outcome"
                  onClick={() => run(() => vote(address))}
                  disabled={status === 'voting'}
                >
                  {status === 'voting' ? 'Approving…' : 'Approve the proposed outcome'}
                </Button>
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
          <p data-testid="pool-resolved">This pool is resolved. Winners can claim their share to any address.</p>
        </section>
      )}

      {/* Reveal-claim-code, creator propose-builder, and winner claim (US1 resolution loop) */}
      {(summary.hasJoined || summary.isCreator || summary.state === 2) && summary.state !== 3 && (
        <PoolResolutionActions
          summary={summary}
          pools={pools}
          participants={participants}
          rankOrder={rankOrder}
          claimCode={identity?.claimCode || null}
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

      {/* Live unresolved leaderboard for multi-round formats (US4); hidden once cancelled */}
      {summary.state !== 3 && (
        <PoolLeaderboard
          entries={standings}
          isCreator={summary.isCreator}
          isFinal={summary.state === 2}
          onScoreChange={scoreChange}
          onToggleEliminate={toggleEliminate}
          onAddPlayer={addPlayer}
          onRemovePlayer={removePlayer}
        />
      )}

      {notice && <p role="alert" className="form-error" data-testid="pool-notice">{notice}</p>}
    </main>
  )
}
