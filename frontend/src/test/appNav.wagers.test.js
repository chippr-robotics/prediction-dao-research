import { describe, it, expect } from 'vitest'
import { HOME_ITEM, WAGERS_ITEM, pathForNavItem } from '../config/appNav'

describe('appNav — Wagers destination (spec 053)', () => {
  it('exposes a Wagers item routing to the dedicated /wagers page', () => {
    expect(WAGERS_ITEM).toMatchObject({ id: 'wagers', label: 'Wagers', to: '/wagers' })
  })

  it('pathForNavItem routes wagers + home to their absolute routes, others to wallet tabs', () => {
    expect(pathForNavItem('wagers')).toBe('/wagers')
    expect(pathForNavItem(HOME_ITEM.id)).toBe('/app')
    expect(pathForNavItem('earn')).toBe('/wallet?tab=earn')
  })
})
