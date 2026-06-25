import { describe, it, expect, beforeEach } from 'vitest'
import { syncedObjects } from '../../lib/backup/syncedObjects'
import { parseBundle } from '../../lib/backup/backupBundle'

// Spec 034 — the 'tokens' watchlist as a backup synced domain: network-scoped, additive
// merge by (address, chainId) (FR-015), and the bundle's network-tag guard (FR-014).

const tokens = syncedObjects.find((o) => o.key === 'tokens')
const ADDR = '0x3333333333333333333333333333333333333333'
const ADDR2 = '0x4444444444444444444444444444444444444444'
const ACCT = '0x8888888888888888888888888888888888888888'
const listWith = (address, chainId) => ({
  schemaVersion: 1,
  entries: [{ address, chainId, source: 'registry', symbol: 'T', name: 'T', decimals: 18, addedAt: 1 }],
  updatedAt: 1,
})

beforeEach(() => localStorage.clear())

describe('tokens synced domain (Spec 034)', () => {
  it('is network-scoped and merges additively by (address, chainId)', () => {
    expect(tokens.networkScoped).toBe(true)
    const { value } = tokens.merge(listWith(ADDR, 137), listWith(ADDR, 63))
    const keys = value.entries.map((e) => `${e.address}:${e.chainId}`)
    expect(keys).toContain(`${ADDR}:137`)
    expect(keys).toContain(`${ADDR}:63`)
    expect(value.entries).toHaveLength(2)
  })

  it('apply merge is additive across calls; apply replace overwrites', () => {
    tokens.apply(ACCT, listWith(ADDR, 137), 'merge')
    tokens.apply(ACCT, listWith(ADDR2, 137), 'merge')
    expect(tokens.load(ACCT).entries).toHaveLength(2)
    tokens.apply(ACCT, listWith(ADDR, 137), 'replace')
    expect(tokens.load(ACCT).entries).toHaveLength(1)
  })
})

describe('backup bundle tokens network-tag guard (FR-014)', () => {
  const bundle = (tokensObj) => ({
    schema: 'fairwins-data-backup',
    version: 1,
    createdAt: 1,
    wallet: ACCT,
    objects: { tokens: tokensObj },
  })

  it('rejects a token entry missing its chainId', () => {
    const bad = { schemaVersion: 1, entries: [{ address: ADDR, source: 'custom', symbol: 'X', decimals: 18 }], updatedAt: 1 }
    expect(() => parseBundle(bundle(bad))).toThrow()
  })

  it('accepts properly network-tagged entries', () => {
    expect(() => parseBundle(bundle(listWith(ADDR, 137)))).not.toThrow()
  })
})
