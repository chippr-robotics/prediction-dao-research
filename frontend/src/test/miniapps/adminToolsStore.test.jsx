/**
 * Spec 093 follow-up — admin mini-apps in the Apps store ("Operator tools").
 *
 * The section is DERIVED, client-side, from the same matrix the Control Room
 * reads — never from the on-chain registry (which has no role-gated
 * visibility). Four properties:
 *   1. an account without qualifying roles gets no operator section at all;
 *   2. an entitled operator sees exactly the tools their flags derive, opening
 *      at their /admin addresses, never under the verified-market badge;
 *   3. the star pins a tool into the same favorites store registry apps use
 *      (disjoint id namespace), and My Apps shows pinned tools;
 *   4. the section renders independently of registry status — an unreachable
 *      registry does not take the operator's own tools down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({ catalog: null }))

vi.mock('../../lib/miniapps/registryClient', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchCatalog: vi.fn(() => Promise.resolve(m.catalog)),
  }
})

import CatalogPanel from '../../components/miniapps/CatalogPanel'
import { WalletContext } from '../../contexts/WalletContext'
import { ROLES, ADMIN_ROLES } from '../../contexts/RoleContext'
import {
  addFavoriteApp,
  loadFavoriteApps,
  __resetFavoriteAppsForTests,
} from '../../lib/miniapps/favorites'
import { adminToolFavoriteId } from '../../components/admin/adminToolCatalog'

const OK_EMPTY = {
  status: 'ok',
  apps: [],
  allApps: [],
  fetchedAt: Date.now(),
  ageMs: 0,
  cached: false,
  chainId: 63,
  registryAddress: '0x1',
}

function walletValue(roleNames) {
  const held = new Set(roleNames)
  return {
    hasRole: (r) => held.has(r),
    hasAnyRole: (rs) => rs.some((r) => held.has(r)),
  }
}

const renderStore = (roles, path = '/wallet?tab=apps') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <WalletContext.Provider value={walletValue(roles)}>
        <CatalogPanel />
      </WalletContext.Provider>
    </MemoryRouter>,
  )

beforeEach(() => {
  __resetFavoriteAppsForTests()
  window.localStorage.clear()
  m.catalog = OK_EMPTY
})

describe('who sees the section', () => {
  it('renders no operator section for an account with no qualifying role', async () => {
    renderStore([])
    await screen.findByText(/No apps are approved yet/i)
    expect(screen.queryByText('Operator tools')).toBeNull()
    expect(screen.queryByText(/role-gated/)).toBeNull()
  })

  it('renders exactly the tools the operator’s flags derive (fee admin ⇒ 2)', async () => {
    renderStore([ROLES.FEE_ADMIN])
    await screen.findByText('Operator tools')
    expect(screen.getByRole('link', { name: 'Open Membership & Revenue' }))
      .toHaveAttribute('href', '/admin/membership-revenue')
    expect(screen.getByRole('link', { name: 'Open Maintenance' }))
      .toHaveAttribute('href', '/admin/maintenance')
    expect(screen.queryByText('Incident Response')).toBeNull()
    expect(screen.queryByText('Access Control')).toBeNull()
  })

  it('sanity: the gate list this trusts is the real ADMIN_ROLES', () => {
    expect(ADMIN_ROLES).toContain(ROLES.FEE_ADMIN)
  })

  it('never places operator tools under the verified-market badge claim', async () => {
    renderStore([ROLES.FEE_ADMIN])
    const section = (await screen.findByText('Operator tools')).closest('section')
    expect(within(section).queryByText(/On-chain verified/i)).toBeNull()
    expect(within(section).getByText(/Built into this app and shown only to operators/i))
      .toBeInTheDocument()
  })
})

describe('pinning', () => {
  it('the star pins into the shared favorites store under the admin-tool namespace', async () => {
    renderStore([ROLES.FEE_ADMIN])
    await screen.findByText('Operator tools')

    fireEvent.click(screen.getByRole('button', { name: 'Pin Maintenance to Quick Access' }))

    expect(loadFavoriteApps()).toContainEqual({
      id: adminToolFavoriteId('maintenance'),
      slug: '',
      name: 'Maintenance',
    })
    // The control flips to unpin and the row discloses the pin.
    expect(screen.getByRole('button', { name: 'Unpin Maintenance from Quick Access' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Pinned')).toBeInTheDocument()
  })

  it('My Apps lists pinned tools only — and is not an empty shelf while one is pinned', async () => {
    // The shelf holds only what was pinned, so pin from the store first.
    addFavoriteApp({ id: adminToolFavoriteId('maintenance'), name: 'Maintenance' })

    renderStore([ROLES.FEE_ADMIN], '/wallet?tab=apps&view=mine')
    await screen.findByText('Operator tools')

    expect(screen.queryByText(/Nothing in My Apps yet/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Open Maintenance' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Membership & Revenue' })).toBeNull()
  })

  it('My Apps with nothing pinned anywhere stays the honest empty shelf', async () => {
    renderStore([ROLES.FEE_ADMIN], '/wallet?tab=apps&view=mine')
    expect(await screen.findByText(/Nothing in My Apps yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Operator tools')).toBeNull()
  })
})

describe('independence from registry status', () => {
  it('renders the tools even when the registry is unreachable', async () => {
    m.catalog = {
      status: 'unreachable',
      chainId: 63,
      registryAddress: '0x1',
      reason: 'rpc',
      error: new Error('down'),
      stale: null,
    }
    renderStore([ROLES.GUARDIAN])
    await screen.findByText(/Listings can’t be verified right now/i)
    expect(screen.getByText('Operator tools')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Incident Response' })).toBeInTheDocument()
  })

  it('search narrows the tools like any other row', async () => {
    renderStore([ROLES.ADMIN])
    await screen.findByText('Operator tools')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'callsign' } })

    expect(screen.getByRole('link', { name: 'Open Identity' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Maintenance' })).toBeNull()
  })
})
