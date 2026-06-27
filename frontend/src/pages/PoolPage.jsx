import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePools } from '../hooks/usePools'

/**
 * PoolPage (spec 034) — view a single pool's live, on-chain state (honest finality, Principle III).
 * Identified by the pool's address in the route.
 */
export default function PoolPage() {
  const { address } = useParams()
  const { getPoolSummary } = usePools()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    getPoolSummary(address)
      .then((s) => {
        if (active) {
          setSummary(s)
          setError(null)
        }
      })
      .catch((e) => {
        if (active) {
          setError(e?.shortMessage || e?.message || String(e))
          setSummary(null)
        }
      })
    return () => {
      active = false
    }
  }, [address, getPoolSummary])

  // Show loading while a different pool is being fetched (avoids a stale summary on navigation).
  const loaded = summary && summary.address === address

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
          <dd data-testid="pool-state">{summary.stateLabel}</dd>
          <dt>Buy-in</dt>
          <dd>{summary.buyInFormatted} {summary.tokenSymbol}</dd>
          <dt>Members</dt>
          <dd>{summary.memberCount} / {summary.maxMembers}</dd>
          <dt>Approval threshold</dt>
          <dd>{summary.thresholdPct}% of members who join</dd>
        </dl>
      </section>
    </main>
  )
}
