/**
 * AppSheet dialog mechanics (spec 077 iteration 2, FR-017).
 *
 * The row → sheet interaction is the store's whole navigation-to-detail gesture now, so its
 * dialog behavior gets its own suite: every dismissal path works, focus is managed (into the
 * sheet on open, back to the invoking row on close), the dialog is properly labelled, and the
 * overlay passes axe. The sheet's CONTENT rules (actions, refusals, honesty) live in
 * CatalogPanel.test.jsx and storeRedesign.test.jsx — this file is about the mechanics.
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

import { AppCategory, AppStatus } from '../../abis/miniAppRegistry'
import { REGISTRY_STATUS } from '../../lib/miniapps/registryClient'
import { __resetFavoriteAppsForTests } from '../../lib/miniapps/favorites'
import CatalogPanel from '../../components/miniapps/CatalogPanel'

beforeEach(() => {
  localStorage.clear()
  __resetFavoriteAppsForTests()
  state.fetchCatalog = null
})

const VENDOR = '0x1234567890abcdef1234567890abcdef12345678'
const HASH = `0x${'ab'.repeat(32)}`
const ZERO_HASH = `0x${'0'.repeat(64)}`

function appRecord({ id, name, description = '' }) {
  return Object.freeze({
    id,
    vendor: VENDOR,
    name,
    description,
    category: AppCategory.TRADE_SETTLEMENT,
    status: AppStatus.APPROVED,
    approved: Object.freeze({ cid: 'bafybeigdyrztktx5', manifestHash: HASH, version: 1, present: true }),
    proposed: Object.freeze({ cid: '', manifestHash: ZERO_HASH, version: 0, present: false }),
    submittedAt: 1_700_000_000,
    approvedAt: 1_700_000_100,
    updatedAt: 1_700_000_200,
    launchable: true,
  })
}

function okOutcome(allApps) {
  return {
    status: REGISTRY_STATUS.OK,
    apps: Object.freeze(allApps),
    allApps: Object.freeze(allApps),
    fetchedAt: Date.now(),
    ageMs: 0,
    cached: false,
    chainId: 137,
    registryAddress: '0x5a168Cc9FeFaf40e7BC536C8C61669e6d547A0A2',
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

const APP = appRecord({ id: 1, name: 'Settle Desk', description: 'Settles bilateral trades.' })

describe('AppSheet — dialog mechanics (FR-017)', () => {
  beforeEach(() => {
    state.fetchCatalog = vi.fn(async () => okOutcome([APP]))
  })

  it('opens labelled by the app name, aria-modal, with focus moved onto the close control', async () => {
    const user = userEvent.setup()
    await renderSettled()

    await user.click(screen.getByRole('button', { name: 'Settle Desk details' }))

    const sheet = screen.getByRole('dialog', { name: 'Settle Desk' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: /^Close/ }))
  })

  it('closes via the close button, returning focus to the row that opened it', async () => {
    const user = userEvent.setup()
    await renderSettled()

    const row = screen.getByRole('button', { name: 'Settle Desk details' })
    await user.click(row)
    await user.click(screen.getByRole('button', { name: 'Close Settle Desk details' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    // The member lands exactly where they left the list — the row keeps their place.
    expect(document.activeElement).toBe(row)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    await renderSettled()

    await user.click(screen.getByRole('button', { name: 'Settle Desk details' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settle Desk details' }))
  })

  it('closes on a backdrop tap, but not on a tap inside the sheet', async () => {
    const user = userEvent.setup()
    const { container } = await renderSettled()

    await user.click(screen.getByRole('button', { name: 'Settle Desk details' }))

    // A click INSIDE the sheet (its description) must not dismiss it.
    await user.click(screen.getByText('Settles bilateral trades.'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(container.querySelector('.miniapp-sheet-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no axe violations with the sheet open', async () => {
    const user = userEvent.setup()
    const { container } = await renderSettled()

    await user.click(screen.getByRole('button', { name: 'Settle Desk details' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
