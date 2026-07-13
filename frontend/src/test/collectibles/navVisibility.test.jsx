/**
 * Chain-aware nav visibility (spec 055 FR-007/SC-003) — the Collectibles item disappears
 * from every menu surface on unsupported networks; nothing else is disturbed.
 */
import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, visibleNavGroups, groupForTab } from '../../config/appNav'

describe('appNav — collectibles item', () => {
  it('lives in the Finance group with the shared icon set', () => {
    const finance = NAV_GROUPS.find((g) => g.label === 'Finance')
    const item = finance.items.find((i) => i.id === 'collectibles')
    expect(item).toMatchObject({ id: 'collectibles', label: 'Collectibles', icon: 'gem' })
    expect(groupForTab('collectibles')?.label).toBe('Finance')
  })
})

describe('visibleNavGroups', () => {
  it('drops the collectibles item when its visibility is false', () => {
    const groups = visibleNavGroups({ collectibles: false })
    const finance = groups.find((g) => g.label === 'Finance')
    expect(finance.items.some((i) => i.id === 'collectibles')).toBe(false)
    // Nothing else is filtered.
    expect(finance.items.map((i) => i.id)).toEqual(
      NAV_GROUPS.find((g) => g.label === 'Finance')
        .items.map((i) => i.id)
        .filter((id) => id !== 'collectibles')
    )
    expect(groups.length).toBe(NAV_GROUPS.length)
  })

  it('keeps the item when visible, and defaults unlisted ids to visible', () => {
    const finance = visibleNavGroups({ collectibles: true }).find((g) => g.label === 'Finance')
    expect(finance.items.some((i) => i.id === 'collectibles')).toBe(true)
    const untouched = visibleNavGroups({}).find((g) => g.label === 'Finance')
    expect(untouched.items.length).toBe(NAV_GROUPS.find((g) => g.label === 'Finance').items.length)
  })

  it('removes a group entirely when every item is hidden', () => {
    const finance = NAV_GROUPS.find((g) => g.label === 'Finance')
    const hideAll = Object.fromEntries(finance.items.map((i) => [i.id, false]))
    expect(visibleNavGroups(hideAll).some((g) => g.label === 'Finance')).toBe(false)
  })
})
