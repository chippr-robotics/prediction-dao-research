// Spec 086 — the device-local account-card cosmetics store: CRUD + sanitization + reactivity
// (FR-005/FR-007/FR-010), and the guarantee that it stays OUT of the synced backup.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ACCOUNT_PROFILES_STORAGE_KEY,
  CARD_TINTS,
  CARD_PATTERNS,
  MAX_IMAGE_DATA_URL_LENGTH,
  getAccountProfile,
  setAccountProfile,
  clearAccountProfile,
  subscribeAccountProfiles,
  getAccountProfilesRevision,
} from '../../lib/account/accountProfilesStore'

const ADDR = '0xAaAa000000000000000000000000000000000001'
const IMG = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => {
  localStorage.clear()
  clearAccountProfile(ADDR) // also resets the in-memory snapshot for this key
})

describe('accountProfilesStore', () => {
  it('returns null for an address with no cosmetics (absence is the default, FR-010)', () => {
    expect(getAccountProfile(ADDR)).toBeNull()
    expect(getAccountProfile(null)).toBeNull()
  })

  it('stores and merges cosmetics case-insensitively', () => {
    setAccountProfile(ADDR, { tint: 'mint' })
    setAccountProfile(ADDR.toLowerCase(), { pattern: 'dots' })
    const profile = getAccountProfile(ADDR.toUpperCase().replace('0X', '0x'))
    expect(profile).toMatchObject({ tint: 'mint', pattern: 'dots' })
  })

  it('persists under its own device-scoped key', () => {
    setAccountProfile(ADDR, { tint: 'sky' })
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_PROFILES_STORAGE_KEY))
    expect(raw[ADDR.toLowerCase()]).toMatchObject({ tint: 'sky' })
  })

  it("clears a field with null/'none' and removes an emptied profile entirely", () => {
    setAccountProfile(ADDR, { image: IMG, tint: 'rose' })
    setAccountProfile(ADDR, { image: null, tint: 'none' })
    expect(getAccountProfile(ADDR)).toBeNull()
    expect(JSON.parse(localStorage.getItem(ACCOUNT_PROFILES_STORAGE_KEY))).toEqual({})
  })

  it('accepts only curated tint/pattern ids and only small data-URL images (FR-007)', () => {
    setAccountProfile(ADDR, { tint: 'chartreuse', pattern: 'zebra' })
    expect(getAccountProfile(ADDR)).toBeNull() // unknown ids sanitize away

    expect(() => setAccountProfile(ADDR, { image: 'https://evil.example/a.png' })).toThrow(/on-device/)
    expect(() => setAccountProfile(ADDR, { image: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_LENGTH)}` })).toThrow()
    expect(getAccountProfile(ADDR)).toBeNull()

    setAccountProfile(ADDR, { image: IMG })
    expect(getAccountProfile(ADDR).image).toBe(IMG)
  })

  it('ignores garbage in storage instead of crashing', () => {
    localStorage.setItem(ACCOUNT_PROFILES_STORAGE_KEY, '{not json')
    clearAccountProfile(ADDR) // force a fresh read on next get
    expect(getAccountProfile(ADDR)).toBeNull()
  })

  it('notifies subscribers and bumps the revision on every write', () => {
    const seen = vi.fn()
    const unsubscribe = subscribeAccountProfiles(seen)
    const before = getAccountProfilesRevision()
    setAccountProfile(ADDR, { tint: 'violet' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(getAccountProfilesRevision()).toBeGreaterThan(before)
    unsubscribe()
    clearAccountProfile(ADDR)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('exposes the curated sets the sheet renders', () => {
    expect(CARD_TINTS).toContain('none')
    expect(CARD_PATTERNS).toContain('none')
  })

  // The navPreferences (spec 081) pattern: cosmetics are device state, not account data, and the
  // image blobs must never bloat the encrypted backup. Read the registry source and assert.
  describe('stays out of the synced backup (FR-005)', () => {
    it('is absent from the spec-032 synced object registry', () => {
      const registry = readFileSync(resolve(process.cwd(), 'src/lib/backup/syncedObjects.js'), 'utf-8')
      expect(registry).not.toContain(ACCOUNT_PROFILES_STORAGE_KEY)
      expect(registry).not.toContain('accountProfiles')
    })
  })
})
