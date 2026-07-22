/**
 * Backup round-trip for the legacyRecoveredKeys domain (spec 062, US4).
 * Verifies the encrypted recovered-keys map is included in the bundle and
 * restored in both merge and replace modes without duplication.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { buildBundle, applyBundle } from '../../lib/backup/backupBundle'
import {
  loadLegacyRecoveredKeys,
  saveLegacyRecoveredKeys,
} from '../../lib/recovery/legacyRecoveredKeysStore'

const SRC = '0x' + '1'.repeat(40)
const DST = '0x' + '2'.repeat(40)
const ADDR_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const ADDR_B = '0x' + 'b'.repeat(40)
const entry = (address, importedAt, ct = 'cipher') => ({ v: 1, kind: 'privateKey', address, ct, iv: 'iv', salt: 'salt', importedAt })

beforeEach(() => globalThis.localStorage?.clear?.())

describe('legacyRecoveredKeys backup sync', () => {
  it('includes the domain in the bundle and restores it (merge)', () => {
    saveLegacyRecoveredKeys(SRC, { [ADDR_A.toLowerCase()]: entry(ADDR_A, 100) })
    const bundle = buildBundle(SRC, 1)
    expect(bundle.objects.legacyRecoveredKeys[ADDR_A.toLowerCase()].ct).toBe('cipher')

    // Destination already has a different recovered account; merge keeps both.
    saveLegacyRecoveredKeys(DST, { [ADDR_B.toLowerCase()]: entry(ADDR_B, 50) })
    applyBundle(DST, bundle, 'merge')
    const merged = loadLegacyRecoveredKeys(DST)
    expect(Object.keys(merged).sort()).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()].sort())
  })

  it('replace overwrites the destination with the bundle', () => {
    saveLegacyRecoveredKeys(SRC, { [ADDR_A.toLowerCase()]: entry(ADDR_A, 100) })
    const bundle = buildBundle(SRC, 1)
    saveLegacyRecoveredKeys(DST, { [ADDR_B.toLowerCase()]: entry(ADDR_B, 50) })
    applyBundle(DST, bundle, 'replace')
    expect(Object.keys(loadLegacyRecoveredKeys(DST))).toEqual([ADDR_A.toLowerCase()])
  })

  it('a second merge restore does not duplicate', () => {
    saveLegacyRecoveredKeys(SRC, { [ADDR_A.toLowerCase()]: entry(ADDR_A, 100) })
    const bundle = buildBundle(SRC, 1)
    applyBundle(DST, bundle, 'merge')
    applyBundle(DST, bundle, 'merge')
    expect(Object.keys(loadLegacyRecoveredKeys(DST))).toEqual([ADDR_A.toLowerCase()])
  })
})
