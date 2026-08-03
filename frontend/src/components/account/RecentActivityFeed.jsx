import { useEffect, useMemo, useRef, useState } from 'react'
import { getNetwork } from '../../config/networks'
import { formatUsd, formatRelativeTime, dayGroupLabel, weekGroupLabel } from '../../lib/account/format'
import SensitiveValue from '../common/SensitiveValue'
import NavIcon from '../nav/NavIcon'
import EmptyState from './EmptyState'
import './RecentActivityFeed.css'

/** kind → icon/label/tone for every ledger activity class (spec 051 US1). */
const KIND_META = {
  deposit: { icon: '↑', label: 'Deposit', tone: 'out' },
  payout: { icon: '↓', label: 'Payout', tone: 'in' },
  refund: { icon: '↩', label: 'Refund', tone: 'in' },
  send: { icon: '➡', label: 'Transfer', tone: 'out' },
  vault_deposit: { icon: '🌱', label: 'Earn deposit', tone: 'out' },
  vault_withdraw: { icon: '🌾', label: 'Earn withdrawal', tone: 'in' },
  reward_claim: { icon: '✦', label: 'Rewards claimed', tone: 'in' },
  pool_join: { icon: '⛳', label: 'Pool join', tone: 'out' },
  pool_claim: { icon: '🏆', label: 'Pool claim', tone: 'in' },
  pool_refund: { icon: '↩', label: 'Pool refund', tone: 'in' },
  voucher_purchase: { icon: '🎟', label: 'Voucher purchase', tone: 'out' },
  voucher_redeem: { icon: '🎟', label: 'Voucher redeemed', tone: 'in' },
}

const CLASS_FILTERS = [
  { key: null, label: 'All activity' },
  { key: 'wager', label: 'Wagers' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'earn', label: 'Earn' },
  { key: 'pool', label: 'Pools' },
  { key: 'membership', label: 'Membership' },
]

/** Group-by options for the activity list (spec 074 follow-up). 'day' is the default. */
const GROUP_OPTIONS = [
  { key: 'day', label: 'By day' },
  { key: 'week', label: 'By week' },
  { key: 'none', label: 'No grouping' },
]

function explorerTxUrl(chainId, txHash) {
  // Only real 66-char tx hashes are explorer-linkable (not userOp/intent ids).
  if (!txHash || String(txHash).length !== 66) return null
  const net = getNetwork(Number(chainId))
  const base = net?.explorer?.baseUrl
  if (!base) return null
  return `${base.replace(/\/$/, '')}/tx/${txHash}`
}

function amountLine(e) {
  if (e.valueUsd != null) return formatUsd(e.valueUsd)
  if (e.amount != null) return String(e.amount)
  return null
}

/**
 * Case-insensitive search across everything a member might remember about a
 * transaction: what it was (label/kind/class), the token, the amounts (raw and
 * USD-formatted), the tx hash, and a failure reason.
 */
function entryMatchesQuery(e, meta, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    meta.label,
    e.kind,
    e.class,
    e.tokenSymbol,
    e.amount != null ? String(e.amount) : null,
    e.valueUsd != null ? formatUsd(e.valueUsd) : null,
    e.txHash,
    e.failureReason,
    e.status,
  ]
  return haystack.some((v) => v != null && String(v).toLowerCase().includes(q))
}

/**
 * RecentActivityFeed — the Account tab's canonical activity record
 * (spec 051 US1): every ledger class, newest first, with honest failed states
 * and an explicit "date unavailable" state instead of a fabricated relative
 * time (FR-006).
 *
 * Spec 074 follow-up: the class-filter chip row moved behind a Filter button
 * (dropdown), and a search field lives behind a Search icon — the feed leads
 * with the transactions themselves, and the tools appear on demand. A Group
 * button (dropdown, default "By day") interleaves subtle date-bucket headers
 * ahead of the rows they cover.
 */
function RecentActivityFeed({ entries = [], chainId, staleClasses = [], prunedBefore = null }) {
  const [classFilter, setClassFilter] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [groupBy, setGroupBy] = useState('day')
  const [groupOpen, setGroupOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filterRef = useRef(null)
  const groupRef = useRef(null)
  const searchInputRef = useRef(null)

  // Close the filter/group dropdowns on outside click / Escape.
  useEffect(() => {
    if (!filterOpen && !groupOpen) return undefined
    const onDown = (event) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(event.target)) setFilterOpen(false)
      if (groupOpen && groupRef.current && !groupRef.current.contains(event.target)) setGroupOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setFilterOpen(false)
        setGroupOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [filterOpen, groupOpen])

  // Opening search focuses the field so "icon → type" is one motion.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const rows = useMemo(() => {
    const byClass = classFilter ? entries.filter((e) => e.class === classFilter) : entries
    if (!query.trim()) return byClass
    return byClass.filter((e) =>
      entryMatchesQuery(e, KIND_META[e.kind] || { label: e.kind }, query),
    )
  }, [entries, classFilter, query])

  const activeFilter = CLASS_FILTERS.find((f) => f.key === classFilter) || CLASS_FILTERS[0]
  const activeGroup = GROUP_OPTIONS.find((g) => g.key === groupBy) || GROUP_OPTIONS[0]
  const isFiltering = classFilter != null || query.trim() !== ''

  // Interleave date-group headers (default: by day) ahead of the rows they
  // cover. Entries arrive newest-first, so same-bucket rows are always
  // contiguous and a header only needs to print when the bucket changes.
  const groupedRows = useMemo(() => {
    if (groupBy === 'none') return rows.map((entry) => ({ type: 'entry', entry }))
    const labelFor = groupBy === 'week' ? weekGroupLabel : dayGroupLabel
    const items = []
    let lastLabel = null
    for (const entry of rows) {
      const label = labelFor(entry.timestamp)
      if (label !== lastLabel) {
        items.push({ type: 'header', label })
        lastLabel = label
      }
      items.push({ type: 'entry', entry })
    }
    return items
  }, [rows, groupBy])

  return (
    <section className="account-feed" aria-label="Recent activity">
      <div className="account-feed-header">
        <h3 className="account-feed-title">Recent activity</h3>
        <div className="account-feed-tools">
          <button
            type="button"
            className={`account-feed-tool${searchOpen || query ? ' active' : ''}`}
            aria-label={searchOpen ? 'Hide activity search' : 'Search activity'}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => {
                if (open) setQuery('')
                return !open
              })
            }}
          >
            <NavIcon name="search" size={16} />
          </button>
          <div className="account-feed-filter-wrap" ref={filterRef}>
            <button
              type="button"
              className={`account-feed-tool${classFilter != null ? ' active' : ''}`}
              aria-label="Filter activity by type"
              aria-haspopup="menu"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((o) => !o)}
            >
              <NavIcon name="sliders" size={16} />
              {classFilter != null && (
                <span className="account-feed-tool-badge">{activeFilter.label}</span>
              )}
            </button>
            {filterOpen && (
              <ul className="account-feed-filter-menu" role="menu" aria-label="Filter activity by type">
                {CLASS_FILTERS.map((f) => (
                  <li key={f.label} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={classFilter === f.key}
                      className={`account-feed-filter-option${classFilter === f.key ? ' active' : ''}`}
                      onClick={() => {
                        setClassFilter(f.key)
                        setFilterOpen(false)
                      }}
                    >
                      <span className="account-feed-filter-check" aria-hidden="true">
                        {classFilter === f.key ? <NavIcon name="check" size={14} /> : null}
                      </span>
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="account-feed-filter-wrap" ref={groupRef}>
            <button
              type="button"
              className={`account-feed-tool${groupBy !== 'day' ? ' active' : ''}`}
              aria-label="Group activity"
              aria-haspopup="menu"
              aria-expanded={groupOpen}
              onClick={() => setGroupOpen((o) => !o)}
            >
              <NavIcon name="layers" size={16} />
              {groupBy !== 'day' && (
                <span className="account-feed-tool-badge">{activeGroup.label}</span>
              )}
            </button>
            {groupOpen && (
              <ul className="account-feed-filter-menu" role="menu" aria-label="Group activity by">
                {GROUP_OPTIONS.map((g) => (
                  <li key={g.key} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={groupBy === g.key}
                      className={`account-feed-filter-option${groupBy === g.key ? ' active' : ''}`}
                      onClick={() => {
                        setGroupBy(g.key)
                        setGroupOpen(false)
                      }}
                    >
                      <span className="account-feed-filter-check" aria-hidden="true">
                        {groupBy === g.key ? <NavIcon name="check" size={14} /> : null}
                      </span>
                      {g.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="account-feed-search">
          <input
            ref={searchInputRef}
            type="search"
            className="account-feed-search-input"
            placeholder="Search by type, token, amount, or tx hash"
            aria-label="Search activity"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {staleClasses.length > 0 && (
        <p className="account-feed-stale" role="status">
          Some activity may be out of date: {staleClasses.join(', ')} could not be refreshed.
        </p>
      )}
      {rows.length === 0 ? (
        isFiltering ? (
          <EmptyState
            compact
            title="No matching activity"
            message="Nothing matches the current filter or search. Clear them to see all activity."
          />
        ) : (
          <EmptyState
            compact
            title="No recent activity"
            message="Your wagers, transfers, earn, pool, and membership activity will appear here."
          />
        )
      ) : (
        <ul className="account-feed-list">
          {groupedRows.map((item, idx) => {
            if (item.type === 'header') {
              return (
                <li key={`group-${idx}`} className="account-feed-group-header" role="presentation">
                  {item.label}
                </li>
              )
            }
            const e = item.entry
            const meta = KIND_META[e.kind] || { icon: '•', label: e.kind, tone: 'out' }
            const url = explorerTxUrl(e.chainId ?? chainId, e.txHash)
            const relative = e.timestamp != null ? formatRelativeTime(e.timestamp) : null
            const amount = amountLine(e)
            const failed = e.status === 'failed'
            return (
              <li className={`account-feed-row${failed ? ' failed' : ''}`} key={e.entryId}>
                <span className={`account-feed-icon tone-${failed ? 'failed' : meta.tone}`} aria-hidden="true">
                  {failed ? '✕' : meta.icon}
                </span>
                <span className="account-feed-main">
                  <span className="account-feed-label">
                    {meta.label}
                    {failed && <span className="account-feed-badge-failed"> Failed</span>}
                    {e.valuationStatus === 'unvalued' && (
                      <span className="account-feed-badge-unvalued" title="No USD value could be determined for this entry"> · unvalued</span>
                    )}
                  </span>
                  {amount != null && (
                    <span className="account-feed-amount">
                      <SensitiveValue>{amount}</SensitiveValue>{' '}
                      <span className="account-feed-token">{e.tokenSymbol || ''}</span>
                    </span>
                  )}
                  {failed && e.failureReason && (
                    <span className="account-feed-reason">{e.failureReason}</span>
                  )}
                </span>
                <span className="account-feed-meta">
                  {relative != null ? (
                    <time>{relative}</time>
                  ) : (
                    <span className="account-feed-nodate">date unavailable</span>
                  )}
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="account-feed-link">
                      View tx
                    </a>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {prunedBefore != null && (
        <p className="account-feed-pruned">
          Entries before {new Date(prunedBefore).toLocaleDateString()} were pruned from device history; on-chain
          activity remains recoverable.
        </p>
      )}
    </section>
  )
}

export default RecentActivityFeed
