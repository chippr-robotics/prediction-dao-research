import { describe, it, expect } from 'vitest'
import { HOME_ITEM, WAGERS_VIEW, WAGERS_PATH, NAV_GROUPS, groupForTab, pathForNavItem } from '../config/appNav'

/*
 * Wagers' destination, spec 053 → spec 073.
 *
 * It was an absolute `/wagers` page (spec 053) and was then planned as a mini-app package
 * (spec 073 T030–T033). It is neither: it is a VIEW inside Finance ▸ Transfer, beside Transfer
 * and Bridge. These pin the three things that decision has to keep true.
 */
describe('appNav — Wagers destination', () => {
  it('describes Wagers as a view of the Transfer section, not a section of its own', () => {
    expect(WAGERS_VIEW).toMatchObject({ id: 'wagers', label: 'Wagers', tab: 'paytransfer', view: 'wagers' })
    expect(WAGERS_PATH).toBe('/wallet?tab=paytransfer&view=wagers')
  })

  it('routes the wagers id to that view, so saved links built from the id still land on it', () => {
    expect(pathForNavItem('wagers')).toBe(WAGERS_PATH)
    expect(pathForNavItem(HOME_ITEM.id)).toBe('/app')
    expect(pathForNavItem('earn')).toBe('/wallet?tab=earn')
  })

  it('is not a nav item in any group — a `?view=` is not a section', () => {
    // The mobile bottom bar shows a tab's SIBLINGS. Claiming a group here would put Wagers in that
    // row as a peer of Earn and Trade while its URL is a sub-view of one of them.
    expect(groupForTab('wagers')).toBeNull()
    const everyItemId = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id))
    expect(everyItemId).not.toContain('wagers')
    // The section that DOES host it is still a first-class item.
    expect(everyItemId).toContain('paytransfer')
  })
})
