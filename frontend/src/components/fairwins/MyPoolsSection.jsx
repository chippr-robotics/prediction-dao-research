import { useNavigate } from 'react-router-dom'
import { useMyPools } from '../../hooks/useMyPools'
import './MyPoolsSection.css'

/**
 * Group pools in the consolidated My Wagers view (spec 037, US2 / FR-015..018; spec 040 US5).
 *
 * Lists the connected user's created + joined pools with a type indicator and status; selecting one
 * opens the pool's management page. Renders nothing when the user has no pools for the active tab, so
 * the existing wager-only view is unchanged. Pools known only from this device (anonymous on-chain
 * membership) are device-scoped (FR-024).
 *
 * Tab-aware (spec 040 US5 / FR-015..016): pools in a terminal state (resolved/cancelled) move out of
 * the active tabs and into the History tab alongside terminal wagers, so finished pools no longer
 * clutter the active view. The tab conveys the bucket, so the per-row Active/Past chip is dropped.
 */
export default function MyPoolsSection({ activeTab }) {
  const { items } = useMyPools()
  const navigate = useNavigate()

  const wantHistory = activeTab === 'history'
  const visible = items.filter((it) =>
    wantHistory ? it.bucket === 'history' : it.bucket !== 'history'
  )

  if (!visible.length) return null

  return (
    <section className="mm-pools-section" aria-label="Your group pools">
      <h3 className="mm-pools-heading">Group pools</h3>
      <ul className="mm-pools-list">
        {visible.map((it) => (
          <li key={it.id} className="mm-pool-item">
            <button
              type="button"
              className="mm-pool-link"
              onClick={() => navigate(it.route)}
              aria-label={`Open ${it.title} — ${it.status}`}
            >
              <span className="mm-pool-type">Pool</span>
              <span className="mm-pool-title">{it.title}</span>
              <span className="mm-pool-status">{it.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
