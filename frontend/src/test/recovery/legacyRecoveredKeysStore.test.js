/**
 * Backup-synced recovered-keys store (spec 062, US4).
 * Uses jsdom localStorage via userStorage; asserts ciphertext-only, load/save
 * round-trip, and the address-keyed newest-wins merge.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadLegacyRecoveredKeys,
  saveLegacyRecoveredKeys,
  mergeLegacyRecoveredKeys,
  LEGACY_KEYS_STORAGE_KEY,
} from '../../lib/recovery/legacyRecoveredKeysStore'

const ACCOUNT = '0x' + '9'.repeat(40)
const ADDR_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const ADDR_B = '0x' + 'b'.repeat(40)
const entry = (address, importedAt, ct = 'cipher') => ({ v: 1, kind: 'privateKey', address, ct, iv: 'iv', salt: 'salt', importedAt })

beforeEach(() => globalThis.localStorage?.clear?.())

describe('load/save round-trip', () => {
  it('persists a ciphertext-only map keyed by lowercased address', () => {
    saveLegacyRecoveredKeys(ACCOUNT, { [ADDR_A]: entry(ADDR_A, 10) })
    const loaded = loadLegacyRecoveredKeys(ACCOUNT)
    expect(Object.keys(loaded)).toEqual([ADDR_A.toLowerCase()])
    expect(loaded[ADDR_A.toLowerCase()].ct).toBe('cipher')
  })

  it('drops malformed / plaintext-looking entries (must have ct)', () => {
    saveLegacyRecoveredKeys(ACCOUNT, { [ADDR_A]: { address: ADDR_A, secret: 'PLAINTEXT' } })
    expect(loadLegacyRecoveredKeys(ACCOUNT)).toEqual({})
  })

  it('uses the documented per-account storage key', () => {
    saveLegacyRecoveredKeys(ACCOUNT, { [ADDR_A]: entry(ADDR_A, 1) })
    const physical = `fw_user_${ACCOUNT.toLowerCase()}_${LEGACY_KEYS_STORAGE_KEY}`
    expect(globalThis.localStorage.getItem(physical)).toBeTruthy()
  })
})

describe('mergeLegacyRecoveredKeys', () => {
  it('unions by address; newest importedAt wins and differing ciphertext is flagged', () => {
    const current = { [ADDR_A.toLowerCase()]: entry(ADDR_A, 10, 'old') }
    const incoming = {
      [ADDR_A.toLowerCase()]: entry(ADDR_A, 20, 'new'),
      [ADDR_B.toLowerCase()]: entry(ADDR_B, 5),
    }
    const { value, conflicts } = mergeLegacyRecoveredKeys(current, incoming)
    expect(Object.keys(value).sort()).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()].sort())
    expect(value[ADDR_A.toLowerCase()].ct).toBe('new') // newer importedAt wins
    expect(conflicts).toEqual([{ address: ADDR_A.toLowerCase() }])
  })

  it('keeps the local entry when it is newer', () => {
    const current = { [ADDR_A.toLowerCase()]: entry(ADDR_A, 30, 'local') }
    const incoming = { [ADDR_A.toLowerCase()]: entry(ADDR_A, 20, 'remote') }
    const { value } = mergeLegacyRecoveredKeys(current, incoming)
    expect(value[ADDR_A.toLowerCase()].ct).toBe('local')
  })
})
