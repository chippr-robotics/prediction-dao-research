/**
 * Hardware-wallet audit records (spec 086, FR-007). Uses the real client
 * ledger (jsdom localStorage) to prove the record shape, idempotency of the
 * stable entryId, and — critically — that refs carry ONLY address/vendor/path,
 * nothing a device could be fingerprinted by.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  captureHardwareAccountAdded,
  captureHardwareAccountRemoved,
} from '../../data/ledger/sources/hardwareWalletSource'
import { listClientRecords, listClientRecordsAllChains } from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0x' + '7'.repeat(40)
const CHAIN = 137
const HW = '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const PATH = "m/44'/60'/0'/0/0"
const info = { address: HW, vendor: 'ledger', path: PATH, deviceId: 'SHOULD-NEVER-APPEAR' }

beforeEach(() => globalThis.localStorage?.clear?.())

describe('captureHardwareAccountAdded', () => {
  it('records address, vendor, and path — and nothing else in refs', () => {
    captureHardwareAccountAdded(ACCOUNT, CHAIN, info)
    const rec = listClientRecords(ACCOUNT, CHAIN).find((r) => r.kind === 'hardware_account_added')
    expect(rec).toBeTruthy()
    expect(rec.refs.hardwareAddress).toBe(HW.toLowerCase())
    expect(rec.refs.vendor).toBe('ledger')
    expect(rec.refs.path).toBe(PATH)
    // Metadata ONLY — no extra keys ever ride into the record (FR-007).
    expect(Object.keys(rec.refs).sort()).toEqual(['hardwareAddress', 'path', 'vendor'])
    expect(JSON.stringify(rec)).not.toContain('SHOULD-NEVER-APPEAR')
    expect(rec.class).toBe('membership')
    expect(rec.chainId).toBe(CHAIN)
    expect(rec.account).toBe(ACCOUNT.toLowerCase())
    expect(typeof rec.timestamp).toBe('number')
  })

  it('is idempotent for the same chain + address (stable entryId)', () => {
    captureHardwareAccountAdded(ACCOUNT, CHAIN, info)
    captureHardwareAccountAdded(ACCOUNT, CHAIN, { address: HW.toLowerCase(), vendor: 'ledger', path: PATH })
    const recs = listClientRecordsAllChains(ACCOUNT).filter((r) => r.kind === 'hardware_account_added')
    expect(recs).toHaveLength(1)
  })

  it('the same address on a different chain is a distinct record', () => {
    captureHardwareAccountAdded(ACCOUNT, 137, info)
    captureHardwareAccountAdded(ACCOUNT, 1, info)
    const recs = listClientRecordsAllChains(ACCOUNT).filter((r) => r.kind === 'hardware_account_added')
    expect(recs).toHaveLength(2)
    expect(new Set(recs.map((r) => r.entryId)).size).toBe(2)
  })
})

describe('captureHardwareAccountRemoved', () => {
  it('a remove after an add is a distinct event with its own entryId', () => {
    captureHardwareAccountAdded(ACCOUNT, CHAIN, info)
    captureHardwareAccountRemoved(ACCOUNT, CHAIN, info)
    const recs = listClientRecords(ACCOUNT, CHAIN)
    const added = recs.find((r) => r.kind === 'hardware_account_added')
    const removed = recs.find((r) => r.kind === 'hardware_account_removed')
    expect(added).toBeTruthy()
    expect(removed).toBeTruthy()
    expect(removed.entryId).not.toBe(added.entryId)
    expect(removed.refs.hardwareAddress).toBe(HW.toLowerCase())
    expect(Object.keys(removed.refs).sort()).toEqual(['hardwareAddress', 'path', 'vendor'])
  })

  it('remove is itself idempotent', () => {
    captureHardwareAccountRemoved(ACCOUNT, CHAIN, info)
    captureHardwareAccountRemoved(ACCOUNT, CHAIN, info)
    const recs = listClientRecordsAllChains(ACCOUNT).filter((r) => r.kind === 'hardware_account_removed')
    expect(recs).toHaveLength(1)
  })
})

describe('no-op guards', () => {
  it('no-ops without an account or address (never throws)', () => {
    expect(() => captureHardwareAccountAdded(null, CHAIN, info)).not.toThrow()
    expect(() => captureHardwareAccountAdded(ACCOUNT, CHAIN, {})).not.toThrow()
    expect(() => captureHardwareAccountRemoved(null, CHAIN, info)).not.toThrow()
    expect(() => captureHardwareAccountRemoved(ACCOUNT, CHAIN, { vendor: 'ledger', path: PATH })).not.toThrow()
    expect(listClientRecordsAllChains(ACCOUNT)).toHaveLength(0)
  })
})
