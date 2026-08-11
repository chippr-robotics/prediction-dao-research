import { describe, it, expect, beforeEach } from 'vitest'
import {
  NAV_SECTIONS_PREF_KEY,
  NAV_DENSITY_PREF_KEY,
  NAV_DENSITIES,
  DEFAULT_EXPANDED_SECTIONS,
  sectionKey,
  loadSectionState,
  isSectionExpanded,
  setSectionExpanded,
  toggleSection,
  loadNavDensity,
  setNavDensity,
  subscribeNavPreferences,
  navPreferencesRevision,
  __resetNavPreferencesForTests,
} from '../lib/nav/navPreferences'
import { saveGlobalPreference, getGlobalPreference } from '../utils/userStorage'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Spec 081 — the device-scoped store behind the nav drawer's folds and row density.
describe('navPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetNavPreferencesForTests()
  })

  describe('sectionKey', () => {
    it('derives a stable key from a group label', () => {
      expect(sectionKey('Quick Access')).toBe('quick-access')
      expect(sectionKey('Finance')).toBe('finance')
      expect(sectionKey('  Tools  ')).toBe('tools')
    })

    it('never emits leading or trailing separators', () => {
      expect(sectionKey('— Apps —')).toBe('apps')
      expect(sectionKey('')).toBe('')
    })
  })

  describe('section state', () => {
    it('opens Quick Access and Finance by default and folds everything else', () => {
      expect(loadSectionState()).toEqual({})
      expect(isSectionExpanded('quick-access')).toBe(true)
      expect(isSectionExpanded('finance')).toBe(true)
      expect(isSectionExpanded('tools')).toBe(false)
      expect(isSectionExpanded('apps')).toBe(false)
      // The defaults are the source of that behaviour, not a coincidence of the assertions.
      expect(DEFAULT_EXPANDED_SECTIONS).toEqual({ 'quick-access': true, finance: true })
    })

    it('persists a member choice and survives a fresh read of storage', () => {
      setSectionExpanded('tools', true)
      expect(getGlobalPreference(NAV_SECTIONS_PREF_KEY)).toEqual({ tools: true })

      __resetNavPreferencesForTests()
      expect(isSectionExpanded('tools')).toBe(true)
    })

    it('lets a member close a section that is open by default', () => {
      setSectionExpanded('finance', false)
      __resetNavPreferencesForTests()
      expect(isSectionExpanded('finance')).toBe(false)
    })

    it('toggles through the defaults rather than assuming collapsed', () => {
      // Finance defaults OPEN, so the first toggle must close it — not open an already-open
      // section, which is what a naive `!stored[key]` would do.
      toggleSection('finance')
      expect(isSectionExpanded('finance')).toBe(false)
      toggleSection('finance')
      expect(isSectionExpanded('finance')).toBe(true)
    })

    it('ignores an empty key rather than persisting one', () => {
      setSectionExpanded('', true)
      expect(loadSectionState()).toEqual({})
    })

    it('falls back to the defaults when the stored blob is not a section map', () => {
      for (const junk of ['nope', 42, ['tools'], null]) {
        localStorage.clear()
        __resetNavPreferencesForTests()
        saveGlobalPreference(NAV_SECTIONS_PREF_KEY, junk)
        expect(loadSectionState()).toEqual({})
        expect(isSectionExpanded('finance')).toBe(true)
        expect(isSectionExpanded('tools')).toBe(false)
      }
    })

    it('drops non-boolean entries but keeps the valid ones', () => {
      saveGlobalPreference(NAV_SECTIONS_PREF_KEY, { tools: true, apps: 'yes', finance: 0 })
      expect(loadSectionState()).toEqual({ tools: true })
      expect(isSectionExpanded('apps')).toBe(false)
      // finance was dropped, so it falls back to its default rather than to the falsy 0.
      expect(isSectionExpanded('finance')).toBe(true)
    })

    it('keeps a stored key for a section that no longer renders, inert', () => {
      setSectionExpanded('a-section-that-was-removed', true)
      expect(isSectionExpanded('a-section-that-was-removed')).toBe(true)
      // It affects nothing else.
      expect(isSectionExpanded('tools')).toBe(false)
    })
  })

  describe('density', () => {
    it('defaults to comfortable', () => {
      expect(loadNavDensity()).toBe('comfortable')
      expect(NAV_DENSITIES).toEqual(['comfortable', 'compact'])
    })

    it('persists a chosen density', () => {
      setNavDensity('compact')
      expect(getGlobalPreference(NAV_DENSITY_PREF_KEY)).toBe('compact')
      __resetNavPreferencesForTests()
      expect(loadNavDensity()).toBe('compact')
    })

    it('ignores an unknown density instead of persisting it', () => {
      setNavDensity('compact')
      setNavDensity('microscopic')
      expect(loadNavDensity()).toBe('compact')
      expect(getGlobalPreference(NAV_DENSITY_PREF_KEY)).toBe('compact')
    })

    it('resolves a foreign stored value to comfortable', () => {
      saveGlobalPreference(NAV_DENSITY_PREF_KEY, { size: 'small' })
      expect(loadNavDensity()).toBe('comfortable')
    })
  })

  describe('subscribers', () => {
    it('notifies once per commit and bumps the revision', () => {
      const seen = []
      const unsubscribe = subscribeNavPreferences((rev) => seen.push(rev))

      setSectionExpanded('tools', true)
      setNavDensity('compact')
      expect(seen).toEqual([1, 2])
      expect(navPreferencesRevision()).toBe(2)

      unsubscribe()
      setSectionExpanded('apps', true)
      expect(seen).toEqual([1, 2])
    })

    it('does not let a throwing subscriber break the save', () => {
      subscribeNavPreferences(() => {
        throw new Error('bad subscriber')
      })
      expect(() => setNavDensity('compact')).not.toThrow()
      expect(loadNavDensity()).toBe('compact')
    })

    it('does not notify for a rejected density', () => {
      const seen = []
      subscribeNavPreferences((rev) => seen.push(rev))
      setNavDensity('enormous')
      expect(seen).toEqual([])
    })
  })

  describe('stays out of the synced backup', () => {
    it('is absent from the spec-032 synced object registry', () => {
      // These are per-device display choices, not account data — same call already made for
      // `miniapp_favorites` (spec 073) and `network_endpoints` (spec 069). Adding either key to
      // the backup would export how one phone's menu is folded to every other device.
      const registry = readFileSync(
        resolve(process.cwd(), 'src/lib/backup/syncedObjects.js'),
        'utf-8',
      )
      expect(registry).not.toContain(NAV_SECTIONS_PREF_KEY)
      expect(registry).not.toContain(NAV_DENSITY_PREF_KEY)
      expect(registry).not.toContain('navPreferences')
    })
  })
})
