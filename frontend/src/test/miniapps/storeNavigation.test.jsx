/**
 * Store navigation (spec 077, US2) — Market / My Apps / Search on the `?view=` seam.
 *
 * The properties under test are the contract's (contracts/store-ui.md §1):
 *
 *   1. **One listing, three lenses.** Every sub-view is a projection of the SAME fetched outcome.
 *      Switching views must not refetch — the fetch effect keys on the refresh counter alone —
 *      and My Apps is favorites ∩ the already-launchable-filtered list, never its own read.
 *   2. **Total routing.** Unknown `view` values land on the market; `submit` keeps its
 *      pre-existing exclusive surface.
 *   3. **An empty My Apps is the member's state, not the registry's.** It gets its own copy, and
 *      must never borrow "No apps are approved yet" (which asserts something about the chain).
 *   4. **The bar is honest chrome**: links with aria-current, absent only when there is no store
 *      at all (registry not deployed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'

const state = vi.hoisted(() => ({ fetchCatalog: null }))

vi.mock('../../lib/miniapps/registryClient', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchCatalog: (...args) => state.fetchCatalog(...args) }
})

// Only the ROUTING to the submission surface is under test here (its own suite renders the real
// thing with the wallet context it needs); a marker stands in so the wrapper's exclusive-render
// decision is observable without dragging that context into every case.
vi.mock('../../components/miniapps/SubmitAppPanel', () => ({
  default: () => <p>submit-surface-marker</p>,
}))

import { AppCategory, AppStatus } from '../../abis/miniAppRegistry'
import { REGISTRY_STATUS, UNREACHABLE_REASON, appSlug } from '../../lib/miniapps/registryClient'
import { toggleFavoriteApp, __resetFavoriteAppsForTests } from '../../lib/miniapps/favorites'
import CatalogPanel from '../../components/miniapps/CatalogPanel'

beforeEach(() => {
  localStorage.clear()
  __resetFavoriteAppsForTests()
  state.fetchCatalog = null
})

const CHAIN = 137
const REGISTRY = '0x5a168Cc9FeFaf40e7BC536C8C61669e6d547A0A2'
const VENDOR = '0x1234567890abcdef1234567890abcdef12345678'
const HASH = `0x${'ab'.repeat(32)}`
const ZERO_HASH = `0x${'0'.repeat(64)}`

function appRecord({ id, name, category = AppCategory.TRADE_SETTLEMENT, launchable = true }) {
  return Object.freeze({
    id,
    vendor: VENDOR,
    name,
    description: '',
    category,
    status: AppStatus.APPROVED,
    approved: Object.freeze({
      cid: launchable ? 'bafybeigdyrztktx5' : '',
      manifestHash: launchable ? HASH : ZERO_HASH,
      version: launchable ? 1 : 0,
      present: launchable,
    }),
    proposed: Object.freeze({ cid: '', manifestHash: ZERO_HASH, version: 0, present: false }),
    submittedAt: 1_700_000_000,
    approvedAt: 1_700_000_100,
    updatedAt: 1_700_000_200,
    launchable,
  })
}

function okOutcome(allApps) {
  return {
    status: REGISTRY_STATUS.OK,
    apps: Object.freeze(allApps.filter((app) => app.launchable)),
    allApps: Object.freeze(allApps),
    fetchedAt: Date.now(),
    ageMs: 0,
    cached: false,
    chainId: CHAIN,
    registryAddress: REGISTRY,
  }
}

const TWO_APPS = [
  appRecord({ id: 1, name: 'Settle Desk' }),
  appRecord({ id: 2, name: 'Ledger Match', category: AppCategory.RECONCILIATION }),
]

function favorite(app) {
  toggleFavoriteApp({ id: app.id, slug: appSlug(app.name), name: app.name })
}

async function renderAt(url) {
  const result = render(
    <MemoryRouter initialEntries={[url]}>
      <CatalogPanel />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByText('Loading the app catalog…')).toBeNull())
  return result
}

function listedApps() {
  return screen.queryAllByRole('heading', { level: 5 }).map((node) => node.textContent)
}

function storeBar() {
  return screen.queryByRole('navigation', { name: 'Store sections' })
}

describe('the store bar (spec 077 FR-007)', () => {
  it('renders Market / My Apps / Search as links, marking the active view with aria-current', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps')

    const bar = storeBar()
    expect(bar).toBeInTheDocument()
    const market = within(bar).getByRole('link', { name: /Market/ })
    const mine = within(bar).getByRole('link', { name: /My Apps/ })
    const search = within(bar).getByRole('link', { name: /Search/ })

    expect(market).toHaveAttribute('aria-current', 'page')
    expect(mine).not.toHaveAttribute('aria-current')
    expect(search).not.toHaveAttribute('aria-current')

    expect(market).toHaveAttribute('href', '/wallet?tab=apps')
    expect(mine).toHaveAttribute('href', '/wallet?tab=apps&view=mine')
    expect(search).toHaveAttribute('href', '/wallet?tab=apps&view=search')
  })

  it('is withheld when the registry is not deployed — three links into a store that does not exist', async () => {
    state.fetchCatalog = vi.fn(async () => ({
      status: REGISTRY_STATUS.NOT_DEPLOYED,
      chainId: CHAIN,
      registryAddress: null,
    }))
    await renderAt('/wallet?tab=apps')
    expect(storeBar()).toBeNull()
  })

  it('stays available during an outage — the honest states are per-view content, not chrome', async () => {
    state.fetchCatalog = vi.fn(async () => ({
      status: REGISTRY_STATUS.UNREACHABLE,
      chainId: CHAIN,
      registryAddress: REGISTRY,
      reason: UNREACHABLE_REASON.READ_FAILED,
      error: new Error('rpc down'),
      stale: null,
    }))
    await renderAt('/wallet?tab=apps')
    expect(storeBar()).toBeInTheDocument()
    expect(screen.getByText('Listings can’t be verified right now.')).toBeInTheDocument()
  })
})

describe('sub-view routing is total (contract §1)', () => {
  it('an unknown view value falls back to the market', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps&view=definitely-not-a-view')

    expect(listedApps()).toEqual(['Settle Desk', 'Ledger Match'])
    expect(within(storeBar()).getByRole('link', { name: /Market/ })).toHaveAttribute('aria-current', 'page')
  })

  it('view=submit keeps its exclusive surface — no store bar, no grid', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    render(
      <MemoryRouter initialEntries={['/wallet?tab=apps&view=submit']}>
        <CatalogPanel />
      </MemoryRouter>,
    )
    expect(screen.getByText('submit-surface-marker')).toBeInTheDocument()
    expect(storeBar()).toBeNull()
    expect(screen.queryByRole('heading', { level: 5 })).toBeNull()
  })
})

describe('My Apps (spec 077 FR-008)', () => {
  it('lists only favorited apps, with the same card treatment and working launch links', async () => {
    favorite(TWO_APPS[1]) // Ledger Match
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps&view=mine')

    expect(listedApps()).toEqual(['Ledger Match'])
    expect(screen.getByRole('link', { name: 'Launch Ledger Match' })).toHaveAttribute(
      'href',
      `/apps/${appSlug('Ledger Match')}`,
    )
    expect(within(storeBar()).getByRole('link', { name: /My Apps/ })).toHaveAttribute('aria-current', 'page')
  })

  it('shows its own empty state when nothing is favorited — never the registry\'s empty-catalog copy', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps&view=mine')

    expect(listedApps()).toEqual([])
    expect(screen.getByText('Nothing in My Apps yet')).toBeInTheDocument()
    expect(screen.queryByText('No apps are approved yet')).toBeNull()
    // The registry DOES hold apps; only the member's shelf is empty. No search over nothing.
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('unfavoriting from the card updates the view live', async () => {
    const user = userEvent.setup()
    favorite(TWO_APPS[0])
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps&view=mine')

    expect(listedApps()).toEqual(['Settle Desk'])
    await user.click(screen.getByRole('button', { name: 'Remove Settle Desk from Quick Access' }))

    expect(listedApps()).toEqual([])
    expect(screen.getByText('Nothing in My Apps yet')).toBeInTheDocument()
  })
})

describe('Search view (contract §1)', () => {
  it('focuses the search input on arrival, with the filters still available', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps&view=search')

    const input = screen.getByRole('searchbox', { name: /search apps/i })
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(screen.getByRole('button', { name: /^Filter/ })).toBeInTheDocument()
  })

  it('searching narrows the same listing the market shows', async () => {
    const user = userEvent.setup()
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps&view=search')

    await user.type(screen.getByRole('searchbox', { name: /search apps/i }), 'ledger')
    expect(listedApps()).toEqual(['Ledger Match'])
    expect(screen.getByText('Showing 1 of 2 apps.')).toBeInTheDocument()
  })
})

describe('one listing, three lenses — switching views never refetches (contract §1)', () => {
  it('clicking through Market → My Apps → Search issues exactly one catalog read', async () => {
    const user = userEvent.setup()
    favorite(TWO_APPS[0])
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    await renderAt('/wallet?tab=apps')

    expect(state.fetchCatalog).toHaveBeenCalledTimes(1)
    expect(listedApps()).toEqual(['Settle Desk', 'Ledger Match'])

    await user.click(within(storeBar()).getByRole('link', { name: /My Apps/ }))
    expect(listedApps()).toEqual(['Settle Desk'])

    await user.click(within(storeBar()).getByRole('link', { name: /Search/ }))
    expect(listedApps()).toEqual(['Settle Desk', 'Ledger Match'])

    await user.click(within(storeBar()).getByRole('link', { name: /Market/ }))
    expect(listedApps()).toEqual(['Settle Desk', 'Ledger Match'])

    // The whole tour rode the first read: sub-views are lenses, not fetches.
    expect(state.fetchCatalog).toHaveBeenCalledTimes(1)
  })
})

describe('accessibility (WCAG 2.1 AA)', () => {
  it('has no violations with the store bar over a populated market', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    const { container } = await renderAt('/wallet?tab=apps')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations on the My Apps empty state', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome(TWO_APPS))
    const { container } = await renderAt('/wallet?tab=apps&view=mine')
    expect(await axe(container)).toHaveNoViolations()
  })
})
