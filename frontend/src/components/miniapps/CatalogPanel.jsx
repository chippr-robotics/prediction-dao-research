/**
 * CatalogPanel (spec 073 T023, US1) — the Apps tab: the curated mini-app catalog.
 *
 * This is the member's view of the registry, and its whole job is to be honest about a distinction
 * the registry client works hard to preserve: what the chain SAID, versus what we could not read.
 *
 *   1. **`launchable`, never `status`.** The list rendered here is `fetchCatalog`'s already-filtered
 *      `apps` array — the records the CHAIN reported as launchable (`AppView.launchable`, FR-010).
 *      This component never looks at `status` and never re-derives the admission test. A Pending
 *      record can be launchable: that is a live app whose vendor has an update in review, still
 *      serving its last reviewed package (FR-003). Filtering on `status === Approved` here would
 *      drop that app out of the catalog the moment its vendor submitted anything — handing every
 *      vendor an offline switch for their own live app. `allApps` (every status) exists for the
 *      curator queue and the vendor's own list; nothing on this surface may touch it.
 *
 *   2. **Four different silences, four different renderings.** "No registry on this build",
 *      "the registry could not be read", "the registry answered and holds nothing", and "this is
 *      what the registry said a while ago" are four different facts, and only ONE of them is an
 *      empty catalog. Rendering an unreachable registry as an empty grid would read to a member as
 *      "nothing is approved" — which is exactly how a curator suspending a compromised app looks
 *      from here. So the unreachable branch says so out loud and refuses launches; a previously
 *      verified snapshot is offered only under that disclosure, with its age, and with no launch
 *      affordance at all (spec.md edge case: never stale-as-verified).
 *
 *   3. **Browsing is not launching.** The list may be served from the client's short memo (≤60s) and
 *      that is fine — nothing here decides what executes. The workspace re-reads the single record
 *      it is about to run at launch time (FR-010), so a curator suspension lands even for a member
 *      who has had this page open.
 *
 * Search and the six operational-category filters (FR-008) are plain buttons and a plain search
 * input — keyboard operable by construction — with a polite live region announcing the result count
 * so a screen-reader user learns that a filter changed the list rather than having to go find out.
 * The category chips sit behind a disclosure button inline with the search box rather than always
 * on screen — the button's own label carries the active count, so collapsing them never hides
 * *that* a filter is applied, only the chips used to change it. The visible list is then grouped
 * under a heading per category (FR-007's category is otherwise readable only per-card), in the
 * same on-chain enum order the chip row already uses, so browsing and filtering agree on one order.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './miniapps.css'
import AppSheet from './AppSheet'
import SubmitAppPanel from './SubmitAppPanel'
import StoreBar from './StoreBar'
import { STORE_VIEWS, resolveStoreView } from './storeViews'
import { RefreshGlyph, VerifiedBadgeGlyph } from './appArt'
import { artworkFor } from './appArtwork'
import EmptyState from '../account/EmptyState'
import NavIcon from '../nav/NavIcon'
import { APP_CATEGORY_LABELS } from '../../abis/miniAppRegistry'
import { networkName } from '../../lib/chains/estate'
import {
  REGISTRY_STATUS,
  UNREACHABLE_REASON,
  appSlug,
  fetchCatalog,
} from '../../lib/miniapps/registryClient'
import { loadFavoriteApps, subscribeFavoriteApps, toggleFavoriteApp } from '../../lib/miniapps/favorites'
import { adminToolEntries } from '../admin/adminToolCatalog'
import { useOperatorFlags } from '../admin/useOperatorFlags'

/**
 * Where a developer goes to submit an app or a version update (FR-021).
 *
 * The submission form is a later task; this is only the entry point to it, and it lives on the same
 * tab so the member never leaves the Apps section to reach it.
 */
const SUBMIT_ROUTE = '/wallet?tab=apps&view=submit'

/**
 * The six operational categories (FR-008), in the on-chain enum order.
 *
 * Sorted explicitly rather than trusting object key order: these keys are integer-like, so JS does
 * happen to enumerate them ascending, but the filter row's order is a UI contract and should not
 * rest on a language rule that a future non-numeric key would quietly break.
 */
const CATEGORY_FILTERS = Object.entries(APP_CATEGORY_LABELS)
  .map(([ordinal, label]) => ({ value: Number(ordinal), label }))
  .sort((a, b) => a.value - b.value)

/** Vendor addresses are shown short; the full value stays available as a tooltip/copy target. */
function shortAddress(address) {
  return typeof address === 'string' && address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address || '—'
}

/**
 * Coarse "how old is this" phrasing for a snapshot we could not re-verify.
 *
 * Rounds UP at every boundary. The failure mode that matters is understating age — a member deciding
 * whether to trust a list they cannot verify is better served by "3 minutes" for 2m10s than by a
 * flattering "2 minutes". An exact timestamp is rendered alongside this, so precision is available
 * to anyone who needs it.
 */
function formatAge(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return 'an unknown amount of time'
  if (value < 60_000) return 'less than a minute'
  const minutes = Math.ceil(value / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.ceil(value / 3_600_000)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.ceil(value / 86_400_000)
  return `${days} day${days === 1 ? '' : 's'}`
}

/**
 * One catalog entry as a store row (spec 077 iteration 2, FR-017): leading art, bold name, a
 * category-and-vendor metadata line, a version chip, and — when favorited — a non-interactive
 * "My Apps" indicator. The whole row is tappable and opens the app's details sheet; the launch
 * link, the favorite toggle, and the refusal explanations all live THERE now, so the row makes
 * no promise the sheet has to walk back.
 *
 * Structure note: the tap target is a "stretched" button laid over the row rather than a button
 * wrapping the content — a heading (h5, which the grouping semantics and screen-reader listings
 * rely on) is not valid phrasing content inside a <button>. The overlay keeps the row's own
 * semantics intact while making every pixel tappable, and its accessible name pairs the app's
 * name with what tapping does.
 */
function AppRow({ app, isFavorite, onOpen }) {
  const categoryLabel = APP_CATEGORY_LABELS[app.category] ?? `Category ${app.category}`
  const slug = appSlug(app.name)
  // Curated host-side art; a slug the host doesn't know — or a name with no slug at all — gets
  // the deliberate generic illustration (spec 077 FR-001, never a broken or borrowed image).
  const { Art } = artworkFor(slug)

  return (
    <li className="miniapp-row">
      <div className="miniapp-row-art" aria-hidden="true">
        <Art />
      </div>
      <div className="miniapp-row-body">
        <h5 className="miniapp-row-name">{app.name}</h5>
        <p className="miniapp-row-meta">
          {categoryLabel} • <code title={app.vendor || undefined}>{shortAddress(app.vendor)}</code>
        </p>
        <p className="miniapp-row-chips">
          <span className="miniapp-row-chip">v{app.approved.version}</span>
          {isFavorite && (
            <span className="miniapp-row-chip is-favorite">
              <NavIcon name="star" size={12} />
              My Apps
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        className="miniapp-row-tap"
        onClick={(event) => onOpen(app, event.currentTarget)}
      >
        <span className="sr-only">{app.name} details</span>
      </button>
    </li>
  )
}

/**
 * One operator tool as a store row (spec 093 follow-up). These are the admin
 * mini-apps — FIRST-PARTY, host-bundled, role-gated — surfaced in the store so
 * an operator can find and pin the tools they reach for. Deliberately NOT
 * registry records: no version chip, no vendor, never under the "On-chain
 * verified market" badge, and never rendered for an account whose roles derive
 * no tools. The row opens the tool at its /admin address (where the real gate
 * lives); the star pins it to Quick Access exactly like a registry app.
 */
function AdminToolRow({ tool, isFavorite }) {
  return (
    <li className="miniapp-row miniapp-row--admin-tool">
      <div className="miniapp-row-art miniapp-row-art--glyph" aria-hidden="true">
        <NavIcon name={tool.icon} size={26} />
      </div>
      <div className="miniapp-row-body">
        <h5 className="miniapp-row-name">{tool.name}</h5>
        <p className="miniapp-row-meta">{tool.description}</p>
        <p className="miniapp-row-chips">
          <span className="miniapp-row-chip">
            {tool.permissionless ? 'Operator tool' : 'Operator tool · role-gated'}
          </span>
          {isFavorite && (
            <span className="miniapp-row-chip is-favorite">
              <NavIcon name="star" size={12} />
              Pinned
            </span>
          )}
        </p>
      </div>
      <Link className="miniapp-row-tap" to={tool.path}>
        <span className="sr-only">Open {tool.name}</span>
      </Link>
      <button
        type="button"
        className={`miniapp-admin-pin${isFavorite ? ' is-pinned' : ''}`}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? `Unpin ${tool.name} from Quick Access` : `Pin ${tool.name} to Quick Access`}
        onClick={() => toggleFavoriteApp({ id: tool.favoriteId, name: tool.name })}
      >
        <NavIcon name="star" size={16} />
      </button>
    </li>
  )
}

function CatalogView({ view = STORE_VIEWS.MARKET }) {
  /**
   * The last completed read, tagged with the request it answered.
   *
   * Pairing the outcome with its request key means "a read is in flight" is DERIVED rather than a
   * second piece of state the effect has to set on the way in — so a refresh never blanks a list the
   * member is reading, and the loading line appears only when there is genuinely nothing yet.
   * `outcome === null` is therefore exactly "we have never had an answer", and it is never allowed to
   * fall through to the grid: an empty grid is an assertion ("nothing is approved") we have not
   * earned yet.
   */
  const [catalogRead, setCatalogRead] = useState({ key: -1, outcome: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState(() => new Set())
  // The category chip row starts collapsed behind the Filter button — see the module header.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(loadFavoriteApps().map((fav) => fav.id)))

  /**
   * Operator tools (spec 093 follow-up): derived from the SAME matrix the
   * Control Room reads, from the app-wide role flags already loaded in
   * WalletContext — no extra network read runs for members, and an account
   * with no qualifying role derives an empty list (the section then never
   * renders). Deliberately WITHOUT the curator authority read: that is a
   * registry round-trip the store must not add for everyone, so a
   * curator-holding-nothing-else reaches curation via /admin (which asks the
   * registry properly) rather than via this listing.
   */
  const { isOperator, flags } = useOperatorFlags()
  const adminTools = useMemo(
    () => (isOperator ? adminToolEntries(flags) : []),
    [isOperator, flags],
  )

  const outcome = catalogRead.outcome
  const refreshing = catalogRead.key !== reloadKey

  // Reflects changes made from either surface that touches favorites (this panel, or a removal from
  // the nav drawer's Quick Access group) without threading state between them.
  useEffect(
    () => subscribeFavoriteApps(() => setFavoriteIds(new Set(loadFavoriteApps().map((fav) => fav.id)))),
    [],
  )

  function handleToggleFavorite(app, slug) {
    toggleFavoriteApp({ id: app.id, slug, name: app.name })
  }

  useEffect(() => {
    let cancelled = false

    async function read() {
      let result
      try {
        // `force` only on an explicit Refresh. The first read may serve the client's ≤60s memo,
        // which is browsing data only — the launch path re-reads its own record (FR-010).
        result = await fetchCatalog({ force: reloadKey > 0 })
      } catch (error) {
        // `fetchCatalog` returns outcomes rather than throwing, but a throw from it (or from the
        // chain/provider resolution beneath it) still means "we could not read the registry". The one
        // thing it must never become is an empty catalog, so it is normalised to the unreachable
        // outcome and gets the unreachable copy.
        result = {
          status: REGISTRY_STATUS.UNREACHABLE,
          chainId: null,
          registryAddress: null,
          reason: UNREACHABLE_REASON.READ_FAILED,
          error,
          stale: null,
        }
      }
      // A read superseded by a newer Refresh is dropped by the cleanup below, so an out-of-order
      // response can never overwrite a fresher answer.
      if (!cancelled) setCatalogRead({ key: reloadKey, outcome: result })
    }

    read()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  /**
   * The list we are allowed to put on screen, and whether it is verified.
   *
   * Both sources are the registry client's already-launchable-filtered arrays (`apps` on success,
   * `stale.apps` on the snapshot). Nothing here re-filters on `status` — see rule 1 in the header.
   */
  const listing = useMemo(() => {
    if (!outcome) return null
    if (outcome.status === REGISTRY_STATUS.OK) {
      return { apps: outcome.apps, verified: true, fetchedAt: outcome.fetchedAt, ageMs: outcome.ageMs }
    }
    if (outcome.status === REGISTRY_STATUS.UNREACHABLE && outcome.stale) {
      return {
        apps: outcome.stale.apps,
        verified: false,
        fetchedAt: outcome.stale.fetchedAt,
        ageMs: outcome.stale.ageMs,
      }
    }
    return null
  }, [outcome])

  /**
   * The sub-view's app set (spec 077, US2). My Apps is a pure FILTER of the one fetched listing —
   * favorites ∩ launchable — so it inherits the market's trust semantics wholesale: same cards,
   * same launch rules, same verified/stale treatment. Nothing here refetches or re-derives.
   */
  const storeApps = useMemo(() => {
    if (!listing) return []
    if (view !== STORE_VIEWS.MINE) return listing.apps
    return listing.apps.filter((app) => favoriteIds.has(app.id))
  }, [listing, view, favoriteIds])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return storeApps.filter((app) => {
      // An empty selection means "every category", not "no category" — the filter row starts
      // unfiltered and clearing it must return the whole list rather than emptying the grid.
      if (selectedCategories.size > 0 && !selectedCategories.has(app.category)) return false
      if (!term) return true
      return (
        String(app.name).toLowerCase().includes(term) ||
        String(app.description).toLowerCase().includes(term)
      )
    })
  }, [storeApps, query, selectedCategories])

  /**
   * `visible`, grouped under a heading per category (FR-007) in the chip row's own order.
   *
   * A category ordinal ahead of this build's label map (see `AppRow`'s fallback) still gets a
   * group — under its raw ordinal — rather than being dropped: grouping must never quietly shrink
   * the list `visible` already promised via the result count above it.
   */
  const groupedVisible = useMemo(() => {
    const byCategory = new Map()
    for (const app of visible) {
      const bucket = byCategory.get(app.category)
      if (bucket) bucket.push(app)
      else byCategory.set(app.category, [app])
    }
    const groups = []
    for (const category of CATEGORY_FILTERS) {
      const apps = byCategory.get(category.value)
      if (apps?.length) groups.push({ key: category.value, label: category.label, apps })
      byCategory.delete(category.value)
    }
    for (const [value, apps] of byCategory) {
      groups.push({ key: value, label: `Category ${value}`, apps })
    }
    return groups
  }, [visible])

  function toggleCategory(value) {
    setSelectedCategories((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  /**
   * The operator tools this view shows. My Apps is the member's shelf, so
   * there it is pinned tools only; Market/Search list every entitled tool.
   * The search term narrows them the same way it narrows registry rows.
   */
  const visibleAdminTools = useMemo(() => {
    const base =
      view === STORE_VIEWS.MINE
        ? adminTools.filter((tool) => favoriteIds.has(tool.favoriteId))
        : adminTools
    const term = query.trim().toLowerCase()
    if (!term) return base
    return base.filter(
      (tool) =>
        tool.name.toLowerCase().includes(term) || tool.description.toLowerCase().includes(term),
    )
  }, [adminTools, view, favoriteIds, query])

  const totalCount = storeApps.length
  // Controls appear only when there is something to narrow. A search box over a list that is empty —
  // or that we could not read at all — is an affordance that cannot do anything. Operator tools
  // count: an operator with tools but an empty registry still needs the search box.
  const showControls = totalCount > 0 || adminTools.length > 0

  /**
   * The Search sub-view is the market with search emphasized: same listing, same filters — the
   * input is simply focused on arrival so a member who chose "Search" can type immediately. The
   * effect (rather than `autoFocus`) covers the switch from another sub-view, where the input is
   * already mounted and would otherwise keep focus wherever it was.
   */
  const searchInputRef = useRef(null)
  useEffect(() => {
    if (view === STORE_VIEWS.SEARCH) searchInputRef.current?.focus()
  }, [view, showControls])

  /**
   * The open app-details sheet (iteration 2, FR-017), by app id — id rather than the record so a
   * Refresh that drops the app from the listing closes the sheet instead of showing a ghost.
   * `sheetReturnFocus` is the row button that opened it; focus goes back there on close, so a
   * keyboard member lands exactly where they left the list.
   */
  const [sheetAppId, setSheetAppId] = useState(null)
  const sheetReturnFocus = useRef(null)
  const sheetApp = sheetAppId !== null ? (listing?.apps.find((app) => app.id === sheetAppId) ?? null) : null

  function handleOpenSheet(app, trigger) {
    sheetReturnFocus.current = trigger
    setSheetAppId(app.id)
  }

  function handleCloseSheet() {
    setSheetAppId(null)
    sheetReturnFocus.current?.focus()
    sheetReturnFocus.current = null
  }

  // The fixed bottom navigation needs breathing room under the list so it never occludes the
  // last row; the spacer class applies exactly when the bar renders.
  const showStoreBar = outcome && outcome.status !== REGISTRY_STATUS.NOT_DEPLOYED

  return (
    <section className={`miniapp-catalog${showStoreBar ? ' miniapp-catalog-with-bar' : ''}`} aria-label="Apps">
      <div className="miniapp-catalog-header">
        <div className="miniapp-store-hero">
          <div className="miniapp-store-title">
            <h3>Apps</h3>
            {/* The trust badge is a factual claim about THIS listing, so it renders only when the
                listing is actually verified (spec 077 FR-002) — never over a stale snapshot, an
                outage, or a registry gap. */}
            {listing?.verified && (
              <p className="miniapp-store-badge">
                <VerifiedBadgeGlyph />
                On-chain verified market
              </p>
            )}
          </div>
          {/* No explanation prose here (iteration 2, FR-003 superseded): the badge is the trust
              signal, and the verification story lives in the developer docs. */}
        </div>
        {/* No registry means nothing to refresh and nowhere to submit — offering either would be an
            affordance that leads nowhere. */}
        {outcome && outcome.status !== REGISTRY_STATUS.NOT_DEPLOYED && (
          <div className="miniapp-catalog-actions">
            {/* `aria-disabled` rather than `disabled` while the re-read is in flight (T047).
                A control that goes `disabled` under the pointer that just activated it is
                removed from the tab order, and the browser drops focus to <body> — so a
                keyboard member loses their place mid-refresh and has to tab in from the top of
                the page. Staying focusable keeps them where they were AND makes the outcome
                audible: `aria-busy` announces the wait, and the label returning to "Refresh"
                on the still-focused button announces that it finished. The click is refused in
                the handler, so a second press during the read is still a no-op. */}
            <button
              type="button"
              className="miniapp-catalog-refresh"
              onClick={() => {
                if (refreshing) return
                setReloadKey((key) => key + 1)
              }}
              // Icon-only (iteration 2, FR-018): the aria-label carries the same state change the
              // visible text used to, so the still-focused control keeps announcing the outcome.
              aria-label={refreshing ? 'Refreshing…' : 'Refresh'}
              aria-disabled={refreshing || undefined}
              aria-busy={refreshing || undefined}
            >
              <RefreshGlyph />
            </button>
            <Link className="miniapp-catalog-submit" to={SUBMIT_ROUTE}>
              Submit an app
            </Link>
          </div>
        )}
      </div>

      {outcome === null && (
        <p className="miniapp-catalog-loading" role="status">
          Loading the app catalog…
        </p>
      )}

      {outcome?.status === REGISTRY_STATUS.NOT_DEPLOYED && (
        <div className="miniapp-catalog-unavailable" role="status">
          <p className="miniapp-catalog-state-title">Apps aren’t available here.</p>
          <p>
            The app catalog is published by a registry on {networkName(outcome.chainId)}, and this
            build has no registry address there — so there is nothing to list and nothing to launch.
            This is a deployment gap rather than an outage: retrying will not change it.
          </p>
        </div>
      )}

      {outcome?.status === REGISTRY_STATUS.UNREACHABLE && (
        <div className="miniapp-catalog-unverified" role="alert">
          <p className="miniapp-catalog-state-title">Listings can’t be verified right now.</p>
          <p>
            {outcome.reason === UNREACHABLE_REASON.NO_ROUTE
              ? `This build currently has no connection to ${networkName(outcome.chainId)}, where the app registry lives.`
              : `The app registry on ${networkName(outcome.chainId)} did not answer.`}{' '}
            Until it does, we can’t confirm which apps are approved, so launches are refused. We won’t
            show you an empty catalog instead: an app suspended for a security problem looks exactly
            like an app that was never listed once the registry goes quiet.
          </p>
          {listing && (
            <p className="miniapp-catalog-stale">
              Below is the catalog as it was last verified, {formatAge(listing.ageMs)} ago (
              {new Date(listing.fetchedAt).toLocaleString()}). It is shown for reference only — it is
              not current, and nothing in it can be launched.
            </p>
          )}
        </div>
      )}

      {showControls && (
        <div className="miniapp-catalog-controls">
          <div className="miniapp-catalog-searchrow">
            <label className="miniapp-catalog-search">
              <span className="sr-only">Search apps by name or description</span>
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Search apps…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            {/* The chip row itself is the state; this button only shows/hides it, so its own
                pressed state is the disclosure — the active count stays on the label so closing
                the panel never hides THAT a filter is applied, only the chips that set it. */}
            <button
              type="button"
              className={`miniapp-catalog-filter-toggle${selectedCategories.size > 0 ? ' is-active' : ''}`}
              aria-expanded={filtersOpen}
              aria-controls={filtersOpen ? 'miniapp-catalog-filters' : undefined}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <NavIcon name="sliders" size={16} />
              Filter{selectedCategories.size > 0 ? ` (${selectedCategories.size})` : ''}
            </button>
          </div>

          {filtersOpen && (
            <div
              className="miniapp-catalog-filters"
              id="miniapp-catalog-filters"
              role="group"
              aria-label="Filter by operational category"
            >
              <button
                type="button"
                className={`miniapp-catalog-filter${selectedCategories.size === 0 ? ' is-active' : ''}`}
                aria-pressed={selectedCategories.size === 0}
                onClick={() => setSelectedCategories(new Set())}
              >
                All categories
              </button>
              {CATEGORY_FILTERS.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  className={`miniapp-catalog-filter${selectedCategories.has(category.value) ? ' is-active' : ''}`}
                  aria-pressed={selectedCategories.has(category.value)}
                  onClick={() => toggleCategory(category.value)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          )}

          {/* Polite live region: a filter or search term changes the grid silently for a screen-reader
              user, so the resulting count is announced rather than left to be discovered. Registry
              apps only — the operator section below carries its own heading and count. */}
          {totalCount > 0 && (
            <p className="miniapp-catalog-count" role="status">
              {visible.length === totalCount
                ? `Showing all ${totalCount} app${totalCount === 1 ? '' : 's'}.`
                : `Showing ${visible.length} of ${totalCount} apps.`}
            </p>
          )}
        </div>
      )}

      {/* Operator tools (spec 093 follow-up): host-bundled admin mini-apps, listed ONLY for an
          account whose roles derive at least one. A separate section with its own explanation —
          never mixed into the registry groups, never under the verified badge: these are not
          registry records, and the distinction is the trust story. Rendered regardless of
          registry status (an unreachable registry does not take the operator's own tools down). */}
      {visibleAdminTools.length > 0 && (
        <section className="miniapp-catalog-group miniapp-catalog-group--admin" aria-labelledby="miniapp-admin-tools-title">
          <h4 className="miniapp-catalog-group-title" id="miniapp-admin-tools-title">
            Operator tools
          </h4>
          <p className="miniapp-admin-tools-note">
            Built into this app and shown only to operators — your roles unlock{' '}
            {visibleAdminTools.length === adminTools.length
              ? `${adminTools.length} tool${adminTools.length === 1 ? '' : 's'}`
              : `${visibleAdminTools.length} of ${adminTools.length}`}
            . Pin one to Quick Access with the star.
          </p>
          <ul className="miniapp-catalog-grid">
            {visibleAdminTools.map((tool) => (
              <AdminToolRow key={tool.favoriteId} tool={tool} isFavorite={favoriteIds.has(tool.favoriteId)} />
            ))}
          </ul>
        </section>
      )}

      {/* The genuinely-empty catalog: the registry answered, and it holds nothing launchable. Gated on
          `verified` so an unreadable registry can never borrow this copy — and on the market/search
          views, because an empty My Apps is the member's own state, not the registry's (below). */}
      {view !== STORE_VIEWS.MINE && listing && listing.verified && totalCount === 0 && (
        <EmptyState
          title="No apps are approved yet"
          message="The registry answered — it simply holds no approved apps for this environment. Anything a curator approves will appear here."
        />
      )}

      {/* My Apps with nothing favorited: the member's empty shelf, never confusable with an empty
          registry. The listing exists (verified or stale) — there is simply nothing starred. An
          operator whose shelf holds pinned tools is not on an empty shelf. */}
      {view === STORE_VIEWS.MINE && listing && totalCount === 0 && visibleAdminTools.length === 0 && (
        <EmptyState
          title="Nothing in My Apps yet"
          message="Star an app in the Market and it will appear here for quick access."
        />
      )}

      {/* "No apps match" is about the REGISTRY list a filter narrowed — it renders only when there
          were registry apps to narrow, so it can never sit under a populated operator section
          claiming nothing matched. */}
      {totalCount > 0 && visible.length === 0 && (
        <EmptyState
          title="No apps match"
          message="No approved app matches your search term or the categories you picked. Clear a filter or try a different term."
        />
      )}

      {groupedVisible.map((group) => (
        <section
          key={group.key}
          className="miniapp-catalog-group"
          aria-labelledby={`miniapp-catalog-group-${group.key}`}
        >
          <h4 className="miniapp-catalog-group-title" id={`miniapp-catalog-group-${group.key}`}>
            {group.label}
          </h4>
          <ul className="miniapp-catalog-grid">
            {group.apps.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                isFavorite={favoriteIds.has(app.id)}
                onOpen={handleOpenSheet}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* The app-details sheet (iteration 2, FR-017). `listing` is non-null whenever a row
          existed to open it; `verified` carries the listing's provenance into the sheet's
          action rules unchanged. */}
      {sheetApp && listing && (
        <AppSheet
          app={sheetApp}
          slug={appSlug(sheetApp.name)}
          verified={listing.verified}
          isFavorite={favoriteIds.has(sheetApp.id)}
          onToggleFavorite={handleToggleFavorite}
          onClose={handleCloseSheet}
        />
      )}

      {/* The store's own section navigation (spec 077, US2 as amended): a fixed bottom
          navigation bar, withheld only when there is no store at all (no registry on this
          build), where all three entries would lead nowhere. */}
      {showStoreBar && <StoreBar active={view} />}
    </section>
  )
}

/**
 * The Apps tab has two surfaces, and this chooses between them.
 *
 * The developer submission surface (FR-021/FR-023) lives behind `?view=submit` — the entry point
 * {@link SUBMIT_ROUTE} already links to — so a developer never leaves the Apps section to reach it and
 * a browser Back returns them to the catalog. They are mutually exclusive rather than stacked: the
 * catalog's registry paging has no business running behind a form someone is filling in, and the
 * submission panel's own reads have no business running behind a catalog nobody asked to leave.
 *
 * The switch is a wrapper rather than an early return inside the catalog, because an early return
 * would make every hook below it conditional — the view can change without remounting the route.
 */
export default function CatalogPanel() {
  const [searchParams] = useSearchParams()
  const rawView = searchParams.get('view')
  if (rawView === 'submit') return <SubmitAppPanel />
  // Everything else is the store: market / mine / search, with unknown values falling back to
  // market (`resolveStoreView` is total) so a stale bookmark still lands somewhere real.
  return <CatalogView view={resolveStoreView(rawView)} />
}
