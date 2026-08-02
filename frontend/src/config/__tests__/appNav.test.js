// Spec 068 (US6, FR-024) — Protect lives in Tools, not Finance.
//
// `groupForTab` is what SectionIconNav derives the mobile bottom-bar siblings from, so asserting the
// group here covers both navigation surfaces (drawer + bottom bar). The deep-link assertions guard
// the part of this change that must NOT be observable: the tab id and route are unchanged, so every
// saved link and bookmark keeps resolving.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { NAV_GROUPS, groupForTab, pathForNavItem, visibleNavGroups } from '../appNav'

const groupNamed = (label) => NAV_GROUPS.find((g) => g.label === label)
const idsIn = (label) => (groupNamed(label)?.items || []).map((i) => i.id)

describe('appNav — Protect placement (spec 068 FR-024)', () => {
  it('lists Protect under Tools', () => {
    expect(idsIn('Tools')).toContain('custody')
    expect(groupForTab('custody').label).toBe('Tools')
  })

  it('no longer lists Protect under Finance', () => {
    expect(idsIn('Finance')).not.toContain('custody')
  })

  it('keeps the tab id and route unchanged so existing deep links resolve', () => {
    const item = groupNamed('Tools').items.find((i) => i.id === 'custody')
    expect(item.label).toBe('Protect')
    expect(pathForNavItem('custody')).toBe('/wallet?tab=custody')
  })

  it('shows Protect its Tools siblings in the section nav', () => {
    // SectionIconNav renders groupForTab(activeTab).items — the mobile bottom bar for Protect.
    const siblings = groupForTab('custody').items.map((i) => i.id)
    expect(siblings).toEqual(expect.arrayContaining(['addressbook', 'security', 'reports']))
    expect(siblings).not.toContain('earn')
  })

  it('keeps Protect visible through the chain-aware filter unless explicitly hidden', () => {
    const visible = visibleNavGroups({})
    expect(visible.find((g) => g.label === 'Tools').items.map((i) => i.id)).toContain('custody')

    const hidden = visibleNavGroups({ custody: false })
    expect(hidden.find((g) => g.label === 'Tools').items.map((i) => i.id)).not.toContain('custody')
  })
})

// Spec 069 (FR-001) — Network moved out of Tools onto the account button beside Preferences.
// The app reads every supported network at once, so the active chain is a per-transaction
// detail, and the panel is now mostly endpoint configuration: member settings, not a tool.
describe('appNav — Network placement (spec 069 FR-001)', () => {
  it('no longer lists Network in any nav group', () => {
    const allIds = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id))
    expect(allIds).not.toContain('network')
  })

  it('reports no section group for the network tab, so no bottom bar claims it', () => {
    // SectionIconNav renders nothing for a null group — same as account/membership/preferences.
    expect(groupForTab('network')).toBeNull()
  })

  it('keeps the route resolvable so saved links and bookmarks still work', () => {
    expect(pathForNavItem('network')).toBe('/wallet?tab=network')
  })
})

// Spec 073 (US1, FR-009) — the Apps group is the mini-app CATALOG, not a hardcoded app list.
//
// The nav can no longer name the apps: which ones exist is decided by the on-chain registry, so
// the group collapses to one entry that opens the catalog. The half of this change that must be
// invisible is the legacy one — ClearPath and Token Mint left the MENU, not the app, and their
// tabs keep rendering until their packages are actually published (T027 / T029, R11 phasing).
describe('appNav — Apps group is the mini-app catalog (spec 073 FR-009)', () => {
  it('collapses the group to a single catalog entry', () => {
    expect(groupNamed('Apps').items).toEqual([{ id: 'apps', label: 'Apps', icon: 'grid' }])
  })

  it('routes the catalog to /wallet?tab=apps and keeps it in the Apps group', () => {
    expect(pathForNavItem('apps')).toBe('/wallet?tab=apps')
    expect(groupForTab('apps').label).toBe('Apps')
  })

  it('no longer surfaces ClearPath or Token Mint anywhere in the nav model', () => {
    const allIds = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id))
    expect(allIds).not.toContain('clearpath')
    expect(allIds).not.toContain('tokens')
    const allLabels = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label))
    expect(allLabels).not.toContain('ClearPath')
    expect(allLabels).not.toContain('Token Mint')
  })

  it('leaves both legacy tabs routable, so saved deep links keep resolving', () => {
    // These are NOT redirected to mini-apps yet — the packages do not exist (T027/T029). The
    // route helper still answers for them so nothing that builds a link from a tab id breaks.
    expect(pathForNavItem('clearpath')).toBe('/wallet?tab=clearpath')
    expect(pathForNavItem('tokens')).toBe('/wallet?tab=tokens')
    // They belong to no group now, so no mobile bottom bar claims them as siblings — the same
    // treatment 'network' got when it moved to the account button.
    expect(groupForTab('clearpath')).toBeNull()
    expect(groupForTab('tokens')).toBeNull()
  })

  it('keeps Wagers out of the group model — it is a view inside Transfer, not a section', () => {
    expect(groupNamed('Apps').items.map((item) => item.id)).not.toContain('wagers')
    expect(pathForNavItem('wagers')).toBe('/wallet?tab=paytransfer&view=wagers')
  })

  it('drops the catalog entry through the chain-aware filter like any other item', () => {
    const hidden = visibleNavGroups({ apps: false })
    expect(hidden.some((group) => group.label === 'Apps')).toBe(false)
    expect(visibleNavGroups({}).some((group) => group.label === 'Apps')).toBe(true)
  })
})

// Tenant gating (spec 072 FR-002 × spec 073): 'miniapps' is a tenant feature. NAV_GROUPS is built
// at module load from the frozen tenant manifest, so the only way to observe a different tenant is
// to re-import the module against a mocked feature set.
describe('appNav — Apps group is tenant-gated on the miniapps feature', () => {
  afterEach(() => {
    vi.doUnmock('../tenant')
    vi.resetModules()
  })

  async function navWithoutFeature(featureId) {
    vi.resetModules()
    vi.doMock('../tenant', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        isFeatureEnabled: (id) => id !== featureId && actual.isFeatureEnabled(id),
      }
    })
    return import('../appNav')
  }

  it('removes the group entirely for a tenant without miniapps — never present-but-empty', async () => {
    const nav = await navWithoutFeature('miniapps')
    expect(nav.isNavItemEnabledForTenant('apps')).toBe(false)
    expect(nav.NAV_GROUPS.some((group) => group.label === 'Apps')).toBe(false)
    expect(nav.groupForTab('apps')).toBeNull()
    // Nothing else moves: the other sections are exactly as the default tenant sees them.
    expect(nav.NAV_GROUPS.map((group) => group.label)).toEqual(['Finance', 'Tools'])
  })

  it('leaves the Apps group intact for the default tenant, which enables miniapps', async () => {
    // Same re-import path with a feature the tenant never had, proving the gate above is the
    // 'miniapps' flag rather than an artefact of re-importing the module.
    const nav = await navWithoutFeature('not-a-real-feature')
    expect(nav.isNavItemEnabledForTenant('apps')).toBe(true)
    expect(nav.NAV_GROUPS.find((group) => group.label === 'Apps').items).toEqual([
      { id: 'apps', label: 'Apps', icon: 'grid' },
    ])
  })
})
