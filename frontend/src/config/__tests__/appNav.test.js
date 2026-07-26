// Spec 068 (US6, FR-024) — Protect lives in Tools, not Finance.
//
// `groupForTab` is what SectionIconNav derives the mobile bottom-bar siblings from, so asserting the
// group here covers both navigation surfaces (drawer + bottom bar). The deep-link assertions guard
// the part of this change that must NOT be observable: the tab id and route are unchanged, so every
// saved link and bookmark keeps resolving.

import { describe, it, expect } from 'vitest'
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
    expect(siblings).toEqual(expect.arrayContaining(['addressbook', 'security', 'reports', 'network']))
    expect(siblings).not.toContain('earn')
  })

  it('keeps Protect visible through the chain-aware filter unless explicitly hidden', () => {
    const visible = visibleNavGroups({})
    expect(visible.find((g) => g.label === 'Tools').items.map((i) => i.id)).toContain('custody')

    const hidden = visibleNavGroups({ custody: false })
    expect(hidden.find((g) => g.label === 'Tools').items.map((i) => i.id)).not.toContain('custody')
  })
})
