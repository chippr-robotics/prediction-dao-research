/**
 * The perps jurisdiction + leverage-risk attestation (spec 083, T019).
 *
 * Three properties carry the weight: nothing arrives pre-ticked, a superseded version does not
 * satisfy the current one, and a browser with storage disabled neither crashes nor silently claims
 * to have kept a record. Plus the structural one — this module exports nothing that could gate an
 * exit (SC-004).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PERPS_ATTESTATION_KEY,
  PERPS_ATTESTATION_ITEMS,
  PERPS_ATTESTATION_ITEM_IDS,
  initialAttestationState,
  missingAttestationItems,
  isAttestationComplete,
  readAttestation,
  hasAttested,
  attestationState,
  recordAttestation,
  clearAttestation,
  subscribeAttestation,
} from '../../lib/perps/attestation'
import { PERPS_ATTESTATION_VERSION } from '../../config/perps'

// Vite rewrites `new URL(<relative>, import.meta.url)` into an asset URL, so resolve from the
// test file's own directory instead.
const SOURCE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../lib/perps/attestation.js')

const ALL = [...PERPS_ATTESTATION_ITEM_IDS]

beforeEach(() => {
  localStorage.clear()
  clearAttestation()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  clearAttestation()
})

describe('the items', () => {
  it('covers jurisdiction, leverage risk, circumvention and the venue’s terms as DISCRETE items', () => {
    expect(ALL).toEqual(['jurisdiction', 'leverage-risk', 'no-circumvention', 'venue-terms'])
    for (const item of PERPS_ATTESTATION_ITEMS) {
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(20)
    }
  })

  it('states plainly that the entire stake can be lost, and names VPN circumvention', () => {
    const byId = Object.fromEntries(PERPS_ATTESTATION_ITEMS.map((i) => [i.id, i.label]))
    expect(byId['leverage-risk']).toMatch(/entire stake/i)
    expect(byId['leverage-risk']).toMatch(/liquidat/i)
    expect(byId['no-circumvention']).toMatch(/VPN/)
    expect(byId['jurisdiction']).toMatch(/prohibited|sanctions/i)
    expect(byId['venue-terms']).toMatch(/third-party venue/i)
  })

  it('pre-ticks nothing', () => {
    const initial = initialAttestationState()
    expect(Object.keys(initial).sort()).toEqual([...ALL].sort())
    expect(Object.values(initial).every((v) => v === false)).toBe(true)
    expect(isAttestationComplete(initial)).toBe(false)
  })
})

describe('completeness', () => {
  it('requires every item', () => {
    expect(missingAttestationItems([])).toEqual(ALL)
    expect(missingAttestationItems(['jurisdiction'])).toEqual(ALL.filter((i) => i !== 'jurisdiction'))
    expect(missingAttestationItems(ALL)).toEqual([])
    expect(isAttestationComplete(ALL)).toBe(true)
  })

  it('accepts an array, a Set, or a checkbox map — and ignores false entries', () => {
    expect(isAttestationComplete(new Set(ALL))).toBe(true)
    expect(isAttestationComplete(Object.fromEntries(ALL.map((id) => [id, true])))).toBe(true)
    const oneUnticked = Object.fromEntries(ALL.map((id) => [id, id !== 'venue-terms']))
    expect(isAttestationComplete(oneUnticked)).toBe(false)
  })

  it('treats junk as incomplete rather than as agreement', () => {
    for (const junk of [null, undefined, 0, 'yes', [1, 2, 3], { jurisdiction: 'true' }]) {
      expect(isAttestationComplete(junk)).toBe(false)
    }
  })
})

describe('recording', () => {
  it('refuses a partial acknowledgement', () => {
    expect(recordAttestation(['jurisdiction', 'leverage-risk'])).toBeNull()
    expect(hasAttested()).toBe(false)
    expect(localStorage.getItem(PERPS_ATTESTATION_KEY)).toBeNull()
  })

  it('stores a complete one with its version and a timestamp', () => {
    const record = recordAttestation(ALL)
    expect(record.version).toBe(PERPS_ATTESTATION_VERSION)
    expect(record.items).toEqual(ALL)
    expect(Number.isNaN(Date.parse(record.at))).toBe(false)
    expect(JSON.parse(localStorage.getItem(PERPS_ATTESTATION_KEY))).toEqual(record)
    expect(hasAttested()).toBe(true)
  })

  it('clearing means the member is asked again', () => {
    recordAttestation(ALL)
    clearAttestation()
    expect(readAttestation()).toBeNull()
    expect(hasAttested()).toBe(false)
  })

  it('never throws on a corrupt stored record — it just does not satisfy the gate', () => {
    localStorage.setItem(PERPS_ATTESTATION_KEY, '{not json')
    expect(() => readAttestation()).not.toThrow()
    expect(hasAttested()).toBe(false)
  })
})

describe('version supersession', () => {
  it('a record at an older version does not satisfy the current one', () => {
    recordAttestation(ALL, 1)
    expect(hasAttested(1)).toBe(true)
    expect(hasAttested(2)).toBe(false)
    expect(attestationState(2).superseded).toBe(true)
    expect(attestationState(2).reason).toMatch(/updated/i)
  })

  it('a record at a newer version still satisfies an older requirement (a build rollback)', () => {
    recordAttestation(ALL, 5)
    expect(hasAttested(4)).toBe(true)
    expect(attestationState(4).superseded).toBe(false)
  })

  it('a record missing a currently-required item does not satisfy the gate', () => {
    localStorage.setItem(
      PERPS_ATTESTATION_KEY,
      JSON.stringify({ version: PERPS_ATTESTATION_VERSION, items: ['jurisdiction'], at: new Date().toISOString() }),
    )
    expect(hasAttested()).toBe(false)
  })

  it('a record with a junk version satisfies nothing', () => {
    localStorage.setItem(
      PERPS_ATTESTATION_KEY,
      JSON.stringify({ version: 'latest', items: ALL, at: new Date().toISOString() }),
    )
    expect(hasAttested()).toBe(false)
  })
})

describe('storage-disabled tolerance', () => {
  it('records for the session when writing throws, and says nothing was persisted', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => recordAttestation(ALL)).not.toThrow()
    expect(setItem).toHaveBeenCalled()
    // The member genuinely acknowledged, so this visit proceeds…
    expect(hasAttested()).toBe(true)
    // …but nothing reached storage, so a fresh browser is asked again.
    setItem.mockRestore()
    expect(localStorage.getItem(PERPS_ATTESTATION_KEY)).toBeNull()
  })

  it('reads as never-attested when reading throws', () => {
    recordAttestation(ALL)
    clearAttestation()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(() => readAttestation()).not.toThrow()
    expect(hasAttested()).toBe(false)
  })

  it('clearing survives a storage that refuses removal', () => {
    recordAttestation(ALL)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(() => clearAttestation()).not.toThrow()
  })
})

describe('subscription', () => {
  it('notifies in the same visit so an open sheet re-renders', () => {
    const seen = []
    const unsubscribe = subscribeAttestation((record) => seen.push(record))
    recordAttestation(ALL)
    clearAttestation()
    unsubscribe()
    recordAttestation(ALL)

    expect(seen.length).toBe(2)
    expect(seen[0].items).toEqual(ALL)
    expect(seen[1]).toBeNull()
  })
})

describe('this gate applies to OPENING only', () => {
  it('exports nothing an exit path could read as permission', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    const exported = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1])
    // A name a close/reduce/cancel path could plausibly call to decide whether to proceed.
    const forbidden = /close|reduce|cancel|exit|recover|manage|blocked|allowed|permit/i
    expect(exported.filter((name) => forbidden.test(name))).toEqual([])
    expect(exported).toContain('hasAttested')
  })

  it('says so in the header, where the next person will read it', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    const header = source.slice(0, source.indexOf('*/'))
    expect(header).toMatch(/OPENING/)
    expect(header).toMatch(/close, reduce, cancel or recovery/i)
  })
})
