/**
 * CatalogPanel (spec 073 T023, US1) — the Apps tab.
 *
 * Two things are under test here, and only one of them is the grid.
 *
 * 1. **The admission test is `launchable`, never `status`.** The catalog must list a PENDING record
 *    that is still launchable — a live app whose vendor has an update in review, serving its last
 *    reviewed package (FR-003) — and must not list a suspended one. A panel that filtered on
 *    `status === Approved` would pass a naive "only approved apps are listed" test and still be
 *    wrong, so the fixture deliberately makes those two answers disagree.
 *
 * 2. **Four silences, four renderings.** No registry / unreadable registry / empty catalog /
 *    unverified snapshot are four different facts, and the panel is not allowed to render any of the
 *    first three as an empty grid or as each other. The stale case additionally has to disclose its
 *    age and refuse every launch — a stale listing offered with a working Launch button is the
 *    failure this whole state exists to prevent.
 *
 * The registry client is mocked at the outcome boundary: this file exercises how the panel presents
 * `fetchCatalog`'s discriminated results, not how those results are produced (that is
 * `registryClient.test.js`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'

const state = vi.hoisted(() => ({
  /** What `fetchCatalog` answers this test. Set per case; never a default that could mask a miss. */
  fetchCatalog: null,
}))

// Only the catalog read is replaced. `appSlug` — the shared name→route-slug normalization that the
// workspace route also uses — stays REAL, because a second definition of what a slug is would let
// this test agree with itself while the catalog linked members somewhere the workspace can't resolve.
vi.mock('../../lib/miniapps/registryClient', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchCatalog: (...args) => state.fetchCatalog(...args) }
})

import { AppCategory, AppStatus, APP_CATEGORY_LABELS } from '../../abis/miniAppRegistry'
import { REGISTRY_STATUS, UNREACHABLE_REASON, appSlug } from '../../lib/miniapps/registryClient'
import { loadFavoriteApps, __resetFavoriteAppsForTests } from '../../lib/miniapps/favorites'
import CatalogPanel from '../../components/miniapps/CatalogPanel'

beforeEach(() => {
  localStorage.clear()
  __resetFavoriteAppsForTests()
})

const CHAIN = 137
const REGISTRY = '0x5a168Cc9FeFaf40e7BC536C8C61669e6d547A0A2'
const VENDOR = '0x1234567890abcdef1234567890abcdef12345678'
const HASH = `0x${'ab'.repeat(32)}`
const ZERO_HASH = `0x${'0'.repeat(64)}`

/** A record shaped exactly like `normalizeApp` output — frozen, like the real client's. */
function appRecord({
  id,
  name,
  description = '',
  category = AppCategory.TRADE_SETTLEMENT,
  status = AppStatus.APPROVED,
  launchable = true,
  version = 1,
  vendor = VENDOR,
}) {
  return Object.freeze({
    id,
    vendor,
    name,
    description,
    category,
    status,
    approved: Object.freeze({
      cid: launchable ? 'bafybeigdyrztktx5' : '',
      manifestHash: launchable ? HASH : ZERO_HASH,
      version: launchable ? version : 0,
      present: launchable,
    }),
    proposed: Object.freeze({ cid: '', manifestHash: ZERO_HASH, version: 0, present: false }),
    submittedAt: 1_700_000_000,
    approvedAt: 1_700_000_100,
    updatedAt: 1_700_000_200,
    launchable,
  })
}

/**
 * A success outcome built the way the client builds one: `apps` is the launchable-only projection of
 * `allApps`. Handing the panel both lists is the point — if it ever reached for `allApps`, or
 * re-derived the filter from `status`, the fixtures below would catch it.
 */
function okOutcome(allApps, { fetchedAt = Date.now(), ageMs = 0, cached = false } = {}) {
  return {
    status: REGISTRY_STATUS.OK,
    apps: Object.freeze(allApps.filter((app) => app.launchable)),
    allApps: Object.freeze(allApps),
    fetchedAt,
    ageMs,
    cached,
    chainId: CHAIN,
    registryAddress: REGISTRY,
  }
}

function unreachableOutcome({ stale = null, reason = UNREACHABLE_REASON.READ_FAILED } = {}) {
  return {
    status: REGISTRY_STATUS.UNREACHABLE,
    chainId: CHAIN,
    registryAddress: REGISTRY,
    reason,
    error: new Error('rpc down'),
    stale,
  }
}

function staleSnapshot(allApps, ageMs) {
  const fetchedAt = Date.now() - ageMs
  return {
    apps: Object.freeze(allApps.filter((app) => app.launchable)),
    allApps: Object.freeze(allApps),
    fetchedAt,
    ageMs,
  }
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <CatalogPanel />
    </MemoryRouter>,
  )
}

/**
 * Render and wait for the initial read to land.
 *
 * Waiting on the loading line's DISAPPEARANCE rather than on any particular outcome is deliberate:
 * every degradation case below has to be observed after the read completed, and a helper that waited
 * for a grid would quietly pass a case that never rendered anything at all.
 */
async function renderSettled() {
  const result = renderPanel()
  await waitFor(() => expect(screen.queryByText('Loading the app catalog…')).toBeNull())
  return result
}

/**
 * The apps currently on screen, by card heading — the member's-eye view of the catalog.
 *
 * Level 5: the catalog groups apps under a level-4 category heading (`h3 Apps > h4 category >
 * h5 app name`), so the app names themselves sit one level deeper than they did before grouping.
 */
function listedApps() {
  return screen.queryAllByRole('heading', { level: 5 }).map((node) => node.textContent)
}

/** The category group headings currently on screen, in render order. */
function listedGroups() {
  return screen.queryAllByRole('heading', { level: 4 }).map((node) => node.textContent)
}

/** Opens the category filter chips, which sit behind the Filter disclosure inline with search. */
async function openFilters(user) {
  await user.click(screen.getByRole('button', { name: /^Filter/ }))
}

/** Taps an app's row (the stretched details button) and returns the opened sheet dialog. */
async function openSheet(user, name) {
  await user.click(screen.getByRole('button', { name: `${name} details` }))
  return screen.getByRole('dialog', { name })
}

describe('CatalogPanel — listing (spec 073 FR-003/FR-007)', () => {
  beforeEach(() => {
    state.fetchCatalog = null
  })

  it('lists only launchable apps — including a PENDING record that is still launchable', async () => {
    // Deliberately makes `status` and `launchable` disagree in both directions.
    const allApps = [
      appRecord({ id: 1, name: 'Settle Desk', status: AppStatus.APPROVED, launchable: true }),
      // Live app, update in review: Pending on-chain, still serving its last reviewed package.
      appRecord({ id: 2, name: 'Ledger Match', status: AppStatus.PENDING, launchable: true }),
      // Approved on paper but pulled: must not appear (a catalog that showed it would hide a
      // curator's suspension).
      appRecord({ id: 3, name: 'Rogue Reporter', status: AppStatus.SUSPENDED, launchable: false }),
      // Never approved: no servable package at all.
      appRecord({ id: 4, name: 'Fresh Submission', status: AppStatus.PENDING, launchable: false }),
      appRecord({ id: 5, name: 'Retired Tool', status: AppStatus.DEPRECATED, launchable: false }),
    ]
    state.fetchCatalog = vi.fn(async () => okOutcome(allApps))

    await renderSettled()

    expect(listedApps()).toEqual(['Settle Desk', 'Ledger Match'])
    expect(screen.queryByText('Rogue Reporter')).toBeNull()
    expect(screen.queryByText('Fresh Submission')).toBeNull()
    expect(screen.queryByText('Retired Tool')).toBeNull()
    expect(screen.getByText('Showing all 2 apps.')).toBeInTheDocument()
  })

  it('shows name, category, vendor and version on each row, and opens the details sheet on tap', async () => {
    const user = userEvent.setup()
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({
          id: 7,
          name: 'Treasury Sweep',
          description: 'Sweeps idle balances into the operating account.',
          category: AppCategory.TREASURY_LIQUIDITY,
          version: 4,
        }),
      ]),
    )

    await renderSettled()

    // The row: bold name heading, category • vendor metadata line, version chip. The description
    // and the launch affordance are NOT here — they moved to the sheet.
    const row = screen.getByRole('heading', { level: 5, name: 'Treasury Sweep' }).closest('li')
    expect(within(row).getByText(new RegExp(APP_CATEGORY_LABELS[AppCategory.TREASURY_LIQUIDITY]))).toBeInTheDocument()
    expect(within(row).getByText('v4')).toBeInTheDocument()
    expect(within(row).getByText('0x1234…5678')).toBeInTheDocument()
    expect(within(row).queryByText('Sweeps idle balances into the operating account.')).toBeNull()
    expect(within(row).queryByRole('link')).toBeNull()

    // The sheet: full detail plus the Open action, linked at the same /apps/<slug> the launch
    // route resolves.
    const sheet = await openSheet(user, 'Treasury Sweep')
    expect(within(sheet).getByText('Sweeps idle balances into the operating account.')).toBeInTheDocument()
    expect(within(sheet).getByText(VENDOR)).toBeInTheDocument()
    expect(within(sheet).getByText('v4')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Open Treasury Sweep' })).toHaveAttribute(
      'href',
      `/apps/${appSlug('Treasury Sweep')}`,
    )
  })

  it('offers no Open action for a name that has no slug, and says why in the sheet', async () => {
    // `appSlug` refuses a lossy best effort — a name it cannot fold into a valid slug returns null
    // rather than a mangled one, because two distinct on-chain listings must never share an address.
    // The catalog's job is to say that plainly instead of linking to `/apps/null`.
    expect(appSlug('Ünïcode Desk')).toBeNull()
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Ünïcode Desk' }),
        appRecord({ id: 2, name: 'Settle Desk' }),
      ]),
    )

    const user = userEvent.setup()
    await renderSettled()

    // The listing is still shown — it IS approved and it IS launchable; only its address is missing.
    expect(listedApps()).toEqual(['Ünïcode Desk', 'Settle Desk'])

    // Its sheet explains the refusal and offers no Open action…
    const refused = await openSheet(user, 'Ünïcode Desk')
    expect(within(refused).getByText(/registered name can’t be used as a web address/i)).toBeInTheDocument()
    expect(within(refused).queryByRole('link', { name: /^Open / })).toBeNull()
    await user.click(within(refused).getByRole('button', { name: /^Close/ }))

    // …and it does not contaminate its neighbour.
    const ok = await openSheet(user, 'Settle Desk')
    expect(within(ok).getByRole('link', { name: 'Open Settle Desk' })).toHaveAttribute(
      'href',
      `/apps/${appSlug('Settle Desk')}`,
    )
  })

  it('offers the developer submission entry point', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 1, name: 'Settle Desk' })]))
    await renderSettled()

    expect(screen.getByRole('link', { name: 'Submit an app' })).toHaveAttribute(
      'href',
      '/wallet?tab=apps&view=submit',
    )
  })
})

describe('CatalogPanel — search and category filters (FR-008)', () => {
  const SEARCHABLE = [
    appRecord({
      id: 1,
      name: 'Settle Desk',
      description: 'Matches and settles bilateral trades.',
      category: AppCategory.TRADE_SETTLEMENT,
    }),
    appRecord({
      id: 2,
      name: 'Ledger Match',
      description: 'Breaks and reconciles custodian statements.',
      category: AppCategory.RECONCILIATION,
    }),
  ]

  beforeEach(() => {
    state.fetchCatalog = vi.fn(async () => okOutcome(SEARCHABLE))
  })

  it('narrows the list by a term in the name', async () => {
    const user = userEvent.setup()
    await renderSettled()

    await user.type(screen.getByRole('searchbox', { name: /search apps/i }), 'ledger')

    expect(listedApps()).toEqual(['Ledger Match'])
    expect(screen.getByText('Showing 1 of 2 apps.')).toBeInTheDocument()
  })

  it('narrows the list by a term in the description', async () => {
    const user = userEvent.setup()
    await renderSettled()

    await user.type(screen.getByRole('searchbox', { name: /search apps/i }), 'custodian')

    expect(listedApps()).toEqual(['Ledger Match'])
  })

  it('says so honestly when nothing matches, rather than showing a bare empty grid', async () => {
    const user = userEvent.setup()
    await renderSettled()

    await user.type(screen.getByRole('searchbox', { name: /search apps/i }), 'zzzz')

    expect(listedApps()).toEqual([])
    expect(screen.getByText('No apps match')).toBeInTheDocument()
    expect(screen.getByText('Showing 0 of 2 apps.')).toBeInTheDocument()
  })

  it('filters by each of the six operational categories, and clears back to the full list', async () => {
    const user = userEvent.setup()
    // One app per category, so a chip that filtered on the wrong ordinal shows the wrong name.
    const perCategory = Object.values(AppCategory).map((category) =>
      appRecord({ id: category + 1, name: `App ${APP_CATEGORY_LABELS[category]}`, category }),
    )
    state.fetchCatalog = vi.fn(async () => okOutcome(perCategory))

    await renderSettled()
    expect(listedApps()).toHaveLength(6)
    await openFilters(user)

    for (const category of Object.values(AppCategory)) {
      const label = APP_CATEGORY_LABELS[category]
      const chip = screen.getByRole('button', { name: label })

      // Keyboard operable: the chip is a real button, so it toggles on Enter without a mouse.
      chip.focus()
      await user.keyboard('{Enter}')
      expect(chip).toHaveAttribute('aria-pressed', 'true')
      expect(listedApps()).toEqual([`App ${label}`])
      // The result count is in a polite live region, so the narrowing is announced, not silent.
      expect(screen.getByText('Showing 1 of 6 apps.')).toBeInTheDocument()

      await user.keyboard('{Enter}')
      expect(chip).toHaveAttribute('aria-pressed', 'false')
      expect(listedApps()).toHaveLength(6)
    }
  })

  it('combines two category selections rather than replacing one with the other', async () => {
    const user = userEvent.setup()
    const perCategory = Object.values(AppCategory).map((category) =>
      appRecord({ id: category + 1, name: `App ${APP_CATEGORY_LABELS[category]}`, category }),
    )
    state.fetchCatalog = vi.fn(async () => okOutcome(perCategory))
    await renderSettled()
    await openFilters(user)

    await user.click(screen.getByRole('button', { name: APP_CATEGORY_LABELS[AppCategory.RECONCILIATION] }))
    await user.click(screen.getByRole('button', { name: APP_CATEGORY_LABELS[AppCategory.REPORTING_AUDIT] }))

    expect(listedApps()).toEqual([
      `App ${APP_CATEGORY_LABELS[AppCategory.RECONCILIATION]}`,
      `App ${APP_CATEGORY_LABELS[AppCategory.REPORTING_AUDIT]}`,
    ])

    await user.click(screen.getByRole('button', { name: 'All categories' }))
    expect(listedApps()).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CatalogPanel — category chips sit behind a Filter disclosure', () => {
  beforeEach(() => {
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Settle Desk', category: AppCategory.TRADE_SETTLEMENT }),
        appRecord({ id: 2, name: 'Ledger Match', category: AppCategory.RECONCILIATION }),
      ]),
    )
  })

  it('hides the category chips until Filter is pressed', async () => {
    await renderSettled()

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All categories' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveAttribute('aria-expanded', 'false')

    const user = userEvent.setup()
    await openFilters(user)

    expect(screen.getByRole('button', { name: 'All categories' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps the active-filter count on the toggle label even while the chips are collapsed', async () => {
    const user = userEvent.setup()
    await renderSettled()
    await openFilters(user)

    await user.click(screen.getByRole('button', { name: APP_CATEGORY_LABELS[AppCategory.RECONCILIATION] }))
    await openFilters(user) // collapse

    expect(screen.queryByRole('button', { name: 'All categories' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filter (1)' })).toBeInTheDocument()
    // The narrowing itself survives collapsing the chip row — only the chips hide.
    expect(listedApps()).toEqual(['Ledger Match'])
  })
})

describe('CatalogPanel — apps grouped by category', () => {
  it('renders a heading per category, in the on-chain enum order, over only the categories present', async () => {
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Ledger Match', category: AppCategory.RECONCILIATION }),
        appRecord({ id: 2, name: 'Settle Desk', category: AppCategory.TRADE_SETTLEMENT }),
        appRecord({ id: 3, name: 'Second Settle Desk', category: AppCategory.TRADE_SETTLEMENT }),
      ]),
    )
    await renderSettled()

    // Trade Settlement is ordinal 0, Reconciliation is ordinal 1 — the group order follows the
    // enum, not discovery order, and only categories that actually have an app appear at all.
    expect(listedGroups()).toEqual([
      APP_CATEGORY_LABELS[AppCategory.TRADE_SETTLEMENT],
      APP_CATEGORY_LABELS[AppCategory.RECONCILIATION],
    ])

    const tradeGroup = screen.getByRole('heading', {
      level: 4,
      name: APP_CATEGORY_LABELS[AppCategory.TRADE_SETTLEMENT],
    }).closest('section')
    expect(within(tradeGroup).getAllByRole('heading', { level: 5 }).map((n) => n.textContent)).toEqual([
      'Settle Desk',
      'Second Settle Desk',
    ])
  })

  it('narrowing to one category leaves exactly one group heading', async () => {
    const user = userEvent.setup()
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Settle Desk', category: AppCategory.TRADE_SETTLEMENT }),
        appRecord({ id: 2, name: 'Ledger Match', category: AppCategory.RECONCILIATION }),
      ]),
    )
    await renderSettled()

    await user.type(screen.getByRole('searchbox', { name: /search apps/i }), 'ledger')

    expect(listedGroups()).toEqual([APP_CATEGORY_LABELS[AppCategory.RECONCILIATION]])
  })
})

describe('CatalogPanel — My Apps (Quick Access favorites, toggled from the sheet)', () => {
  it('offers no My Apps toggle in the sheet of an app that cannot be launched by URL', async () => {
    const user = userEvent.setup()
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 1, name: 'Ünïcode Desk' })]))
    await renderSettled()

    const sheet = await openSheet(user, 'Ünïcode Desk')
    expect(within(sheet).queryByRole('button', { name: /My Apps/ })).toBeNull()
  })

  it('offers no My Apps toggle on an unverified stale snapshot', async () => {
    const user = userEvent.setup()
    state.fetchCatalog = vi.fn(async () =>
      unreachableOutcome({ stale: staleSnapshot([appRecord({ id: 1, name: 'Settle Desk' })], 60_000) }),
    )
    await renderSettled()

    const sheet = await openSheet(user, 'Settle Desk')
    expect(within(sheet).queryByRole('button', { name: /My Apps/ })).toBeNull()
  })

  it('adds a launchable app to My Apps from its sheet, persists it, and removes it on a second press', async () => {
    const user = userEvent.setup()
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 9, name: 'Settle Desk' })]))
    await renderSettled()

    const sheet = await openSheet(user, 'Settle Desk')
    const toggle = within(sheet).getByRole('button', { name: 'Add Settle Desk to My Apps' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)

    const active = within(sheet).getByRole('button', { name: 'Remove Settle Desk from My Apps' })
    expect(active).toHaveAttribute('aria-pressed', 'true')
    expect(loadFavoriteApps()).toEqual([{ id: 9, slug: appSlug('Settle Desk'), name: 'Settle Desk' }])

    // The row picks up the state as a non-interactive indicator chip.
    await user.click(within(sheet).getByRole('button', { name: /^Close/ }))
    const row = screen.getByRole('heading', { level: 5, name: 'Settle Desk' }).closest('li')
    expect(within(row).getByText('My Apps')).toBeInTheDocument()

    const reopened = await openSheet(user, 'Settle Desk')
    await user.click(within(reopened).getByRole('button', { name: 'Remove Settle Desk from My Apps' }))
    expect(loadFavoriteApps()).toEqual([])
  })
})

describe('CatalogPanel — honest degradation (spec.md edge cases)', () => {
  it('while the first read is in flight: says it is loading, and shows neither a grid nor an empty state', async () => {
    let release
    state.fetchCatalog = vi.fn(() => new Promise((resolve) => { release = () => resolve(okOutcome([])) }))

    renderPanel()

    // "Still reading" is its own state. Falling through to the grid here would assert "nothing is
    // approved" before the registry had said anything at all.
    expect(screen.getByText('Loading the app catalog…')).toBeInTheDocument()
    expect(screen.queryByText('No apps are approved yet')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()

    release()
    await waitFor(() => expect(screen.queryByText('Loading the app catalog…')).toBeNull())
    expect(screen.getByText('No apps are approved yet')).toBeInTheDocument()
  })

  it('registry not deployed: explains the section is unavailable, and offers no refresh or submission', async () => {
    state.fetchCatalog = vi.fn(async () => ({
      status: REGISTRY_STATUS.NOT_DEPLOYED,
      chainId: CHAIN,
      registryAddress: null,
    }))

    await renderSettled()

    expect(screen.getByText('Apps aren’t available here.')).toBeInTheDocument()
    expect(screen.getByText(/no registry address there/i)).toBeInTheDocument()
    expect(screen.getByText(/deployment gap rather than an outage/i)).toBeInTheDocument()

    // Distinct from every other state: not an outage, not an empty catalog, not a stale list.
    expect(screen.queryByText('Listings can’t be verified right now.')).toBeNull()
    expect(screen.queryByText('No apps are approved yet')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Submit an app' })).toBeNull()
  })

  it('registry unreachable: says listings cannot be verified, and never renders as an empty catalog', async () => {
    state.fetchCatalog = vi.fn(async () => unreachableOutcome())

    await renderSettled()

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Listings can’t be verified right now.')).toBeInTheDocument()
    expect(within(alert).getByText(/launches are refused/i)).toBeInTheDocument()
    expect(within(alert).getByText(/suspended for a security problem looks exactly like/i)).toBeInTheDocument()

    // The load-bearing negative: an outage must never borrow the empty-catalog copy, and there is
    // nothing to launch.
    expect(screen.queryByText('No apps are approved yet')).toBeNull()
    expect(screen.queryByText('Apps aren’t available here.')).toBeNull()
    expect(listedApps()).toEqual([])
    expect(screen.queryByRole('link', { name: /^Open / })).toBeNull()
  })

  it('registry unreachable with no route: names the missing connection rather than blaming the registry', async () => {
    state.fetchCatalog = vi.fn(async () => unreachableOutcome({ reason: UNREACHABLE_REASON.NO_ROUTE }))

    await renderSettled()

    expect(screen.getByText(/no connection to/i)).toBeInTheDocument()
    expect(screen.queryByText(/did not answer/i)).toBeNull()
  })

  it('genuinely empty catalog: an honest empty state, attributed to the registry having answered', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome([]))

    await renderSettled()

    expect(screen.getByText('No apps are approved yet')).toBeInTheDocument()
    expect(screen.getByText(/The registry answered/i)).toBeInTheDocument()

    // Distinct from the other three states.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Apps aren’t available here.')).toBeNull()
    // Refresh stays available: this one CAN change on a retry.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('stale snapshot: discloses the age, marks it not current, and refuses every launch', async () => {
    const allApps = [
      appRecord({ id: 1, name: 'Settle Desk' }),
      appRecord({ id: 2, name: 'Ledger Match', status: AppStatus.PENDING, launchable: true }),
    ]
    // 7m30s → rounds UP to 8 minutes; never flatters the snapshot's freshness.
    state.fetchCatalog = vi.fn(async () => unreachableOutcome({ stale: staleSnapshot(allApps, 450_000) }))

    await renderSettled()

    expect(screen.getByText('Listings can’t be verified right now.')).toBeInTheDocument()
    expect(screen.getByText(/last verified, 8 minutes ago/)).toBeInTheDocument()
    expect(screen.getByText(/it is not current, and nothing in it can be launched/i)).toBeInTheDocument()

    // The snapshot IS shown — that is what makes this state different from the bare outage — but
    // every launch affordance is gone, and an opened sheet says why instead of offering Open.
    expect(listedApps()).toEqual(['Settle Desk', 'Ledger Match'])
    expect(screen.queryByRole('link', { name: /^Open / })).toBeNull()

    const user = userEvent.setup()
    const sheet = await openSheet(user, 'Settle Desk')
    expect(within(sheet).getByText('Launch unavailable — this listing could not be verified.')).toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: /^Open / })).toBeNull()
  })

  it('a throwing registry client is an outage, not an empty catalog', async () => {
    state.fetchCatalog = vi.fn(async () => {
      throw new Error('provider exploded')
    })

    await renderSettled()

    expect(screen.getByText('Listings can’t be verified right now.')).toBeInTheDocument()
    expect(screen.queryByText('No apps are approved yet')).toBeNull()
  })

  it('re-reads the registry, bypassing the browsing memo, when the member refreshes', async () => {
    const settled = okOutcome([appRecord({ id: 1, name: 'Settle Desk' })])
    // A refresh the test controls, so the in-flight window is observable rather than raced.
    let releaseRefresh
    state.fetchCatalog = vi
      .fn()
      .mockResolvedValueOnce(settled)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseRefresh = () => resolve(settled) }))

    const user = userEvent.setup()
    await renderSettled()

    expect(state.fetchCatalog).toHaveBeenCalledWith({ force: false })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(state.fetchCatalog).toHaveBeenLastCalledWith({ force: true })

    // While the re-read is in flight the member keeps the list they were reading — blanking it to a
    // loading line would make a refresh look like the catalog had emptied.
    expect(listedApps()).toEqual(['Settle Desk'])
    // `aria-disabled`, NOT `disabled` (T047): see the keyboard case below for why.
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Loading the app catalog…')).toBeNull()

    releaseRefresh()
    await screen.findByRole('button', { name: 'Refresh' })
    expect(listedApps()).toEqual(['Settle Desk'])
  })

  it('keeps focus on Refresh for the whole read, and refuses a second press during it', async () => {
    // The `disabled` attribute would take this control out of the tab order the instant it was
    // pressed, dropping focus to <body>: a keyboard member is thrown to the top of the page
    // mid-refresh, and never hears that it finished because the label change happens on a
    // control they are no longer standing on. `aria-disabled` keeps them there — which only
    // works if the handler itself refuses the repeat press.
    const settled = okOutcome([appRecord({ id: 1, name: 'Settle Desk' })])
    let releaseRefresh
    state.fetchCatalog = vi
      .fn()
      .mockResolvedValueOnce(settled)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseRefresh = () => resolve(settled) }))

    const user = userEvent.setup()
    await renderSettled()

    const refresh = screen.getByRole('button', { name: 'Refresh' })
    refresh.focus()
    await user.keyboard('{Enter}')

    const inFlight = screen.getByRole('button', { name: 'Refreshing…' })
    expect(document.activeElement).toBe(inFlight)
    expect(inFlight).toHaveAttribute('aria-busy', 'true')

    // Focusable does not mean operable: a second read must not be started.
    await user.keyboard('{Enter}')
    expect(state.fetchCatalog).toHaveBeenCalledTimes(2)

    releaseRefresh()
    const settledBtn = await screen.findByRole('button', { name: 'Refresh' })
    // Still the same element, still focused — so the label returning to "Refresh" is announced.
    expect(document.activeElement).toBe(settledBtn)
  })
})

describe('CatalogPanel — accessibility (WCAG 2.1 AA)', () => {
  it('has no violations with a populated catalog', async () => {
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Settle Desk', description: 'Matches and settles bilateral trades.' }),
        appRecord({
          id: 2,
          name: 'Ledger Match',
          description: 'Breaks and reconciles custodian statements.',
          category: AppCategory.RECONCILIATION,
          status: AppStatus.PENDING,
        }),
      ]),
    )
    const { container } = await renderSettled()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in the unreachable-with-stale state', async () => {
    state.fetchCatalog = vi.fn(async () =>
      unreachableOutcome({ stale: staleSnapshot([appRecord({ id: 1, name: 'Settle Desk' })], 120_000) }),
    )
    const { container } = await renderSettled()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in the not-deployed state', async () => {
    state.fetchCatalog = vi.fn(async () => ({
      status: REGISTRY_STATUS.NOT_DEPLOYED,
      chainId: CHAIN,
      registryAddress: null,
    }))
    const { container } = await renderSettled()
    expect(await axe(container)).toHaveNoViolations()
  })
})
