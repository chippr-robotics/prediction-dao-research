/**
 * Recovery audit record (spec 062, US5). Uses the real client ledger (jsdom
 * localStorage) to prove the record shape, idempotency, and — critically —
 * that no key material is ever written.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { captureLegacyRecovery } from '../../data/ledger/sources/legacyRecoverySource'
import { listClientRecords, listClientRecordsAllChains } from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0x' + '7'.repeat(40)
const CHAIN = 137
const LEGACY = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const MNEMONIC = 'test test test test test test test test test test test junk'

beforeEach(() => globalThis.localStorage?.clear?.())

describe('captureLegacyRecovery', () => {
  it('records address, time, and type — and nothing secret', () => {
    captureLegacyRecovery(ACCOUNT, CHAIN, { recoveredAddress: LEGACY, source: 'privateKey' })
    const records = listClientRecords(ACCOUNT, CHAIN)
    const rec = records.find((r) => r.kind === 'legacy_account_recovered')
    expect(rec).toBeTruthy()
    expect(rec.refs.recoveredAddress).toBe(LEGACY.toLowerCase())
    expect(rec.refs.source).toBe('privateKey')
    expect(rec.class).toBe('membership')
    expect(typeof rec.timestamp).toBe('number')
    // Never any key material in the serialized record.
    const blob = JSON.stringify(rec)
    expect(blob).not.toContain(PK)
    expect(blob).not.toContain(MNEMONIC)
  })

  it('is idempotent for the same account on the same chain (stable entryId)', () => {
    captureLegacyRecovery(ACCOUNT, CHAIN, { recoveredAddress: LEGACY, source: 'mnemonic' })
    captureLegacyRecovery(ACCOUNT, CHAIN, { recoveredAddress: LEGACY, source: 'mnemonic' })
    const recs = listClientRecordsAllChains(ACCOUNT).filter((r) => r.kind === 'legacy_account_recovered')
    expect(recs).toHaveLength(1)
  })

  it('no-ops without an account or address (never throws)', () => {
    expect(() => captureLegacyRecovery(null, CHAIN, { recoveredAddress: LEGACY })).not.toThrow()
    expect(() => captureLegacyRecovery(ACCOUNT, CHAIN, {})).not.toThrow()
    expect(listClientRecordsAllChains(ACCOUNT)).toHaveLength(0)
  })
})
