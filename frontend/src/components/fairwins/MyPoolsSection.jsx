import { useNavigate } from 'react-router-dom'
import { useMyPools } from '../../hooks/useMyPools'
import './MyPoolsSection.css'

/**
 * Group pools in the consolidated My Wagers view (spec 037, US2 / FR-015..018).
 *
 * Lists the connected user's created + joined pools with a type indicator, status, and active/history
 * grouping; selecting one opens the pool's management page. Renders nothing when the user has no pools,
 * so the existing wager-only view is unchanged (FR-019). Pools known only from this device (anonymous
 * on-chain membership) are device-scoped (FR-024).
 */
export default function MyPoolsSection() {
  const { items } = useMyPools()
  const navigate = useNavigate()

  if (!items.length) return null

  return (
    <section className="mm-pools-section" aria-label="Your group pools">
      <h3 className="mm-pools-heading">Group pools</h3>
      <ul className="mm-pools-list">
        {items.map((it) => (
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
              <span className={`mm-pool-bucket mm-pool-bucket--${it.bucket}`}>
                {it.bucket === 'history' ? 'Past' : 'Active'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
