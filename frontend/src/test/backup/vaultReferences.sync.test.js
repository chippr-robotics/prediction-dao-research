// Spec 043 — vault reference store + backup integration. Verifies the store round-trips, merge unions by
// (chainId, address) with newest label winning, the bundle includes vaultReferences, and network-tag
// validation rejects an untagged reference on restore.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadVaultReferences,
  upsertVaultReference,
  removeVaultReference,
  mergeVaultReferences,
  vaultKey,
} from '../../lib/custody/vaultReferences'
import { buildBundle, parseBundle } from '../../lib/backup/backupBundle'

const ACCOUNT = '0x00000000000000000000000000000000000000a1'
const V1 = '0x1111111111111111111111111111111111111111'
const V2 = '0x2222222222222222222222222222222222222222'

beforeEach(() => {
  localStorage.clear()
})

describe('vaultReferences store', () => {
  it('upserts, loads, and removes by (chainId, address)', () => {
    upsertVaultReference(ACCOUNT, { chainId: 63, address: V1, label: 'Coop', role: 'owner' }, 100)
    upsertVaultReference(ACCOUNT, { chainId: 137, address: V1, label: 'Coop L2' }, 100)
    let refs = loadVaultReferences(ACCOUNT)
    expect(refs).toHaveLength(2) // same address, different chains → distinct
    upsertVaultReference(ACCOUNT, { chainId: 63, address: V1, label: 'Renamed' }, 200)
    refs = loadVaultReferences(ACCOUNT)
    expect(refs).toHaveLength(2)
    expect(refs.find((r) => r.chainId === 63).label).toBe('Renamed')
    removeVaultReference(ACCOUNT, 63, V1)
    expect(loadVaultReferences(ACCOUNT).map((r) => vaultKey(r.chainId, r.address))).toEqual([vaultKey(137, V1)])
  })

  it('ignores invalid addresses / missing chainId', () => {
    upsertVaultReference(ACCOUNT, { chainId: 63, address: 'not-an-address', label: 'x' }, 1)
    upsertVaultReference(ACCOUNT, { chainId: NaN, address: V2, label: 'y' }, 1)
    expect(loadVaultReferences(ACCOUNT)).toHaveLength(0)
  })
})

describe('mergeVaultReferences', () => {
  it('unions by key; newest addedAt wins the label', () => {
    const current = [{ chainId: 63, address: V1, label: 'Old', addedAt: 100, role: 'owner' }]
    const incoming = [
      { chainId: 63, address: V1, label: 'New', addedAt: 200, role: 'owner' },
      { chainId: 63, address: V2, label: 'Other', addedAt: 150, role: 'watch' },
    ]
    const { value } = mergeVaultReferences(current, incoming)
    expect(value).toHaveLength(2)
    expect(value.find((r) => r.address === V1).label).toBe('New')
  })
})

describe('backup bundle integration', () => {
  it('includes vaultReferences and round-trips through parseBundle', () => {
    upsertVaultReference(ACCOUNT, { chainId: 63, address: V1, label: 'Coop', role: 'owner' }, 100)
    const bundle = buildBundle(ACCOUNT, 12345)
    expect(bundle.objects.vaultReferences).toHaveLength(1)
    expect(() => parseBundle(bundle)).not.toThrow()
  })

  it('rejects a restore whose vault reference is missing its chainId (network-tag guard)', () => {
    const bad = {
      schema: 'fairwins-data-backup',
      version: 1,
      createdAt: 1,
      wallet: ACCOUNT,
      objects: { vaultReferences: [{ address: V1, label: 'x' }] }, // no chainId
    }
    expect(() => parseBundle(bad)).toThrow(/chainId/)
  })
})
