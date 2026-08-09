/**
 * Store redesign (spec 077, US1) — the market surface's new visual layer.
 *
 * Everything under test here is presentation the redesign ADDED. The rules it must not break —
 * `launchable` as the serving decision, the four honest states, launch refusals, favorites — are
 * pinned by `CatalogPanel.test.jsx` and stay green unchanged; this file covers what is new:
 *
 *   1. **The trust badge is a factual claim.** "On-chain verified market" renders over a verified
 *      listing and over NOTHING else — not the stale snapshot, not the outage, not the registry
 *      gap, not the loading line. A badge that survived into those states would be the exact
 *      dishonesty constitution III forbids.
 *   2. **Artwork is total and decorative.** Curated slugs get their own illustration, everything
 *      else gets the deliberate generic — never a broken image — and all of it is aria-hidden so
 *      the card's text remains the identity a screen reader hears.
 *   3. **Flavour never enters the accessible name.** The rocket in Launch and the glyphs in the
 *      trust blocks are decoration; names and copy read exactly as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'

const state = vi.hoisted(() => ({ fetchCatalog: null }))

vi.mock('../../lib/miniapps/registryClient', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchCatalog: (...args) => state.fetchCatalog(...args) }
})

import { AppCategory, AppStatus } from '../../abis/miniAppRegistry'
import { REGISTRY_STATUS, UNREACHABLE_REASON, appSlug } from '../../lib/miniapps/registryClient'
import { __resetFavoriteAppsForTests } from '../../lib/miniapps/favorites'
import { artworkFor } from '../../components/miniapps/appArtwork'
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

function staleOutcome(allApps, ageMs = 120_000) {
  return {
    status: REGISTRY_STATUS.UNREACHABLE,
    chainId: CHAIN,
    registryAddress: REGISTRY,
    reason: UNREACHABLE_REASON.READ_FAILED,
    error: new Error('rpc down'),
    stale: {
      apps: Object.freeze(allApps.filter((app) => app.launchable)),
      allApps: Object.freeze(allApps),
      fetchedAt: Date.now() - ageMs,
      ageMs,
    },
  }
}

async function renderSettled() {
  const result = render(
    <MemoryRouter>
      <CatalogPanel />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByText('Loading the app catalog…')).toBeNull())
  return result
}

const BADGE = 'On-chain verified market'

describe('artworkFor — total, curated, generic (FR-001)', () => {
  it('returns curated art for the shipped apps and the generic for everything else', () => {
    // The generic's identity is observable through the function itself: any two unknown slugs
    // share it, and neither curated entry does.
    const generic = artworkFor('never-heard-of-it').Art
    expect(artworkFor('also-unknown').Art).toBe(generic)
    expect(artworkFor('token-mint').Art).not.toBe(generic)
    expect(artworkFor('clearpath').Art).not.toBe(generic)
    expect(artworkFor('token-mint').Art).not.toBe(artworkFor('clearpath').Art)
  })

  it('is total over degenerate inputs — null, undefined, empty, garbage', () => {
    for (const input of [null, undefined, '', 0, 'CONSTRUCTOR', '__proto__']) {
      const { Art } = artworkFor(input)
      expect(typeof Art).toBe('function')
    }
    // `__proto__`/inherited keys must not leak an Object.prototype member out of the map.
    expect(artworkFor('toString').Art).toBe(artworkFor('never-heard-of-it').Art)
  })
})

describe('the trust badge renders over a verified listing and nothing else (FR-002)', () => {
  it('shows the badge with a verified catalog', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 1, name: 'Settle Desk' })]))
    await renderSettled()
    expect(screen.getByText(BADGE)).toBeInTheDocument()
  })

  it('withholds the badge on the unverified stale snapshot — the state it exists to distinguish', async () => {
    state.fetchCatalog = vi.fn(async () => staleOutcome([appRecord({ id: 1, name: 'Settle Desk' })]))
    await renderSettled()
    // The snapshot's cards ARE on screen; the badge still must not be.
    expect(screen.getByRole('heading', { level: 5, name: 'Settle Desk' })).toBeInTheDocument()
    expect(screen.queryByText(BADGE)).toBeNull()
  })

  it('withholds the badge on a bare outage', async () => {
    state.fetchCatalog = vi.fn(async () => ({
      status: REGISTRY_STATUS.UNREACHABLE,
      chainId: CHAIN,
      registryAddress: REGISTRY,
      reason: UNREACHABLE_REASON.READ_FAILED,
      error: new Error('rpc down'),
      stale: null,
    }))
    await renderSettled()
    expect(screen.queryByText(BADGE)).toBeNull()
  })

  it('withholds the badge when the registry is not deployed, and while loading', async () => {
    let release
    state.fetchCatalog = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: REGISTRY_STATUS.NOT_DEPLOYED, chainId: CHAIN, registryAddress: null })
        }),
    )
    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    )
    expect(screen.getByText('Loading the app catalog…')).toBeInTheDocument()
    expect(screen.queryByText(BADGE)).toBeNull()

    release()
    await waitFor(() => expect(screen.queryByText('Loading the app catalog…')).toBeNull())
    expect(screen.getByText('Apps aren’t available here.')).toBeInTheDocument()
    expect(screen.queryByText(BADGE)).toBeNull()
  })
})

describe('the trust story reads as prioritized blocks (FR-003)', () => {
  it('keeps both factual claims, split under their own lead-ins', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 1, name: 'Settle Desk' })]))
    await renderSettled()

    expect(screen.getByText('Reviewed on-chain.')).toBeInTheDocument()
    expect(screen.getByText(/reviewed and approved on-chain/i)).toBeInTheDocument()
    expect(screen.getByText('Hash-checked before launch.')).toBeInTheDocument()
    expect(screen.getByText(/checks the package against the hash recorded there/i)).toBeInTheDocument()
  })
})

describe('card artwork (FR-001) and flavour staying out of accessible names (FR-006)', () => {
  it('gives every card an aria-hidden illustration panel; unknown apps get the generic art', async () => {
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Token Mint' }), // slug: token-mint → curated
        appRecord({ id: 2, name: 'Settle Desk' }), // no curated entry → generic
      ]),
    )
    await renderSettled()

    for (const name of ['Token Mint', 'Settle Desk']) {
      const card = screen.getByRole('heading', { level: 5, name }).closest('li')
      const art = card.querySelector('.miniapp-card-art')
      expect(art).not.toBeNull()
      expect(art).toHaveAttribute('aria-hidden', 'true')
      expect(art.querySelector('svg.miniapp-art')).not.toBeNull()
    }
    // Sanity: the curated slug really is what the launch route uses.
    expect(appSlug('Token Mint')).toBe('token-mint')
  })

  it('a name with no slug still gets art (the generic), alongside its launch refusal', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 1, name: 'Ünïcode Desk' })]))
    await renderSettled()

    const card = screen.getByRole('heading', { level: 5, name: 'Ünïcode Desk' }).closest('li')
    expect(card.querySelector('.miniapp-card-art svg')).not.toBeNull()
    expect(within(card).getByText(/registered name can’t be used as a web address/i)).toBeInTheDocument()
  })

  it('the rocket is decoration: the launch link keeps its exact accessible name', async () => {
    state.fetchCatalog = vi.fn(async () => okOutcome([appRecord({ id: 1, name: 'Settle Desk' })]))
    await renderSettled()

    const launch = screen.getByRole('link', { name: 'Launch Settle Desk' })
    const glyph = launch.querySelector('svg')
    expect(glyph).not.toBeNull()
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('accessibility of the redesigned market (WCAG 2.1 AA)', () => {
  it('has no violations with badge, trust blocks, artwork and data boxes all rendered', async () => {
    state.fetchCatalog = vi.fn(async () =>
      okOutcome([
        appRecord({ id: 1, name: 'Token Mint', category: AppCategory.ASSET_SERVICING }),
        appRecord({ id: 2, name: 'Settle Desk' }),
      ]),
    )
    const { container } = await renderSettled()
    expect(await axe(container)).toHaveNoViolations()
  })
})
