/**
 * Store section rails (spec 093/077 follow-up) — a section's height is bounded
 * whatever the app count.
 *
 * The PinnedAppsStrip rules at store scale: a section shows at most
 * SECTION_VISIBLE_CAP cards in a horizontal rail; past the cap, a "More"
 * control BELOW the rail (never a trailing card inside it) states how many
 * are hidden and opens a modal listing the whole set. The modal follows
 * AppSheet's dialog mechanics, and a details sheet opened from inside it owns
 * the next Escape — one press must not close both layers.
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
import { SECTION_VISIBLE_CAP } from '../../components/miniapps/CatalogSection'
import { __resetFavoriteAppsForTests } from '../../lib/miniapps/favorites'

const app = (id, name) => ({
  id,
  name,
  description: `${name} does things.`,
  vendor: '0x52502d9C7C2d63f7a4f0a612ce1B0e4Bfd80F6e1',
  category: 0,
  status: 1,
  launchable: true,
  approved: { present: true, version: '1.0.0' },
  proposed: { present: false },
  submittedAt: 0,
  approvedAt: 0,
  updatedAt: 0,
})

// 13 launchable apps in ONE category — three past the cap.
const MANY = Array.from({ length: 13 }, (_, i) => app(i + 1, `Tool ${String(i + 1).padStart(2, '0')}`))

const renderStore = () =>
  render(
    <MemoryRouter initialEntries={['/wallet?tab=apps']}>
      <CatalogPanel />
    </MemoryRouter>,
  )

beforeEach(() => {
  __resetFavoriteAppsForTests()
  window.localStorage.clear()
  m.catalog = {
    status: 'ok',
    apps: MANY,
    allApps: MANY,
    fetchedAt: Date.now(),
    ageMs: 0,
    cached: false,
    chainId: 63,
    registryAddress: '0x1',
  }
})

describe('the rail caps at SECTION_VISIBLE_CAP and discloses the rest', () => {
  it('shows 10 cards and a More control naming the section and the hidden count', async () => {
    renderStore()
    const section = (await screen.findByText('Trade Settlement')).closest('section')

    expect(within(section).getAllByRole('listitem')).toHaveLength(SECTION_VISIBLE_CAP)
    expect(SECTION_VISIBLE_CAP).toBe(10)
    const more = within(section).getByRole('button', { name: 'More Trade Settlement apps (+3)' })
    // Below the rail, not a listitem inside it.
    expect(more.closest('li')).toBeNull()
  })

  it('renders no More control when the section fits the cap', async () => {
    m.catalog = { ...m.catalog, apps: MANY.slice(0, 10), allApps: MANY.slice(0, 10) }
    renderStore()
    const section = (await screen.findByText('Trade Settlement')).closest('section')
    expect(within(section).getAllByRole('listitem')).toHaveLength(10)
    expect(within(section).queryByRole('button', { name: /^More / })).toBeNull()
  })
})

describe('the full-list modal', () => {
  it('lists every app of the section, with a stated count, and closes on Escape back to More', async () => {
    renderStore()
    const section = (await screen.findByText('Trade Settlement')).closest('section')
    const more = within(section).getByRole('button', { name: /^More Trade Settlement/ })

    fireEvent.click(more)

    const dialog = screen.getByRole('dialog', { name: 'Trade Settlement' })
    expect(within(dialog).getByText('All 13 apps')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(13)
    // Focus lands on the close control (AppSheet's rule).
    expect(within(dialog).getByRole('button', { name: /Close the full/ })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Trade Settlement' })).toBeNull()
    expect(more).toHaveFocus()
  })

  it('a details sheet opened from inside the modal owns the next Escape', async () => {
    renderStore()
    const section = (await screen.findByText('Trade Settlement')).closest('section')
    fireEvent.click(within(section).getByRole('button', { name: /^More Trade Settlement/ }))

    const dialog = screen.getByRole('dialog', { name: 'Trade Settlement' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tool 13 details' }))

    // Both layers are up: the section modal and the app sheet above it.
    expect(screen.getByRole('dialog', { name: 'Tool 13' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    // The sheet closed; the section modal did NOT.
    expect(screen.queryByRole('dialog', { name: 'Tool 13' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Trade Settlement' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Trade Settlement' })).toBeNull()
  })
})
