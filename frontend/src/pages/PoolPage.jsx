import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePools } from '../hooks/usePools'
import { poolStateDisplay } from '../lib/pools/poolContracts'
import Button from '../components/ui/Button'
import PoolLeaderboard from '../components/pools/PoolLeaderboard'
import PoolResolutionActions from '../components/pools/PoolResolutionActions'
import './pools.css'

/**
 * PoolPage (spec 034) — view a pool's live, on-chain state and take the state-appropriate action
 * (creator: close/cancel; member: approve the outcome or refund). Honest finality (Principle III):
 * pending, closed, resolved, and refund-eligible states are surfaced truthfully.
 */
export default function PoolPage() {
  const { address } = useParams()
  const pools = usePools()
  const { getPoolSummary, getMyNickname, closeJoining, cancelPool, vote, refund, status } = pools
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [nickname, setNickname] = useState(null)
  const [notice, setNotice] = useState(null)

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

  const run = async (fn) => {
    setNotice(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setNotice(e?.shortMessage || e?.message || String(e))
    }
  }

  const revealNickname = () => run(async () => setNickname(await getMyNickname(address)))

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

      <section className="pool-identity" aria-label="Your identity">
        {nickname ? (
          <p>You are <strong data-testid="my-nickname">{nickname.label}</strong> in this pool.</p>
        ) : (
          <Button variant="secondary" onClick={revealNickname}>Reveal my nickname</Button>
        )}
      </section>

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
        <PoolResolutionActions summary={summary} pools={pools} onChanged={reload} />
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
