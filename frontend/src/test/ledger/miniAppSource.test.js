/**
 * Spec 073 T021 — the mini-app audit source (data-model.md §3 · FR-019/FR-020).
 *
 * Three things are load-bearing here: the class value is appended without
 * disturbing any existing one (the client ledger and the encrypted backup store
 * these strings verbatim), every capture is idempotent so a remount or a
 * restored backup cannot inflate the trail, and a record carries only what the
 * helper names — never bytes, never a store value, never anything an app slipped
 * into a payload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MINIAPP_KIND,
  miniAppEntryId,
  captureMiniAppLaunch,
  captureMiniAppTxSubmitted,
  captureMiniAppIntegrityFailure,
  captureMiniAppStateChange,
  captureMiniAppLog,
  listMiniAppEntries,
  listAllMiniAppRecords,
  readMiniAppEntry,
  createMiniAppLedgerSource,
} from '../../data/ledger/sources/miniAppSource'
import { getDefaultLedgerRepository } from '../../data/ledger'
import { listClientRecords, __clearClientLedger } from '../../data/ledger/ledgerClientStore'
import { normalizeEntry } from '../../data/ledger/normalize'
import { LEDGER_CLASS, LEDGER_CLASSES, LEDGER_STATUS, LEDGER_DIRECTION } from '../../data/ledger/constants'

const ACCOUNT = '0xAbCd000000000000000000000000000000000073'
const CHAIN = 137
const APP = 'token-mint'
const TX = '0x' + '73'.repeat(32)
const MANIFEST_HASH = '0x' + 'ab'.repeat(32)
const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

beforeEach(() => {
  __clearClientLedger()
  localStorage.clear()
})

const miniAppRecords = () => listClientRecords(ACCOUNT, CHAIN).filter((r) => r.class === LEDGER_CLASS.MINIAPP)

describe('spec 073 ledger class (T021)', () => {
  it('appends `miniapp` without disturbing an existing class value', () => {
    expect(LEDGER_CLASS.MINIAPP).toBe('miniapp')
    // Literals, not references: a rename would orphan historical entries.
    expect(LEDGER_CLASS.WAGER).toBe('wager')
    expect(LEDGER_CLASS.TRANSFER).toBe('transfer')
    expect(LEDGER_CLASS.EARN).toBe('earn')
    expect(LEDGER_CLASS.STAKING).toBe('staking')
    expect(LEDGER_CLASS.POOL).toBe('pool')
    expect(LEDGER_CLASS.MEMBERSHIP).toBe('membership')
    expect(LEDGER_CLASS.BRIDGE).toBe('bridge')
    expect(LEDGER_CLASS.LIQUIDITY).toBe('liquidity')
    expect(LEDGER_CLASSES).toEqual(expect.arrayContaining(['miniapp']))
  })

  it('normalizes a mini-app entry instead of rejecting it as unknown', () => {
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: APP, version: '3.1.0', manifestHash: MANIFEST_HASH, cid: CID })
    const normalized = normalizeEntry(miniAppRecords()[0], { account: ACCOUNT.toLowerCase(), chainId: CHAIN })
    expect(normalized.class).toBe('miniapp')
    expect(normalized.direction).toBe(LEDGER_DIRECTION.NONE)
    expect(normalized.amountRaw).toBe(null)
  })
})

describe('captureMiniAppLaunch', () => {
  it('records which package ran, with a device timestamp', () => {
    const at = 1_700_000_000_000
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: APP, version: '3.1.0', manifestHash: MANIFEST_HASH, cid: CID, at })
    const [record] = miniAppRecords()
    expect(record.kind).toBe(MINIAPP_KIND.LAUNCHED)
    expect(record.class).toBe(LEDGER_CLASS.MINIAPP)
    expect(record.status).toBe(LEDGER_STATUS.SETTLED)
    expect(record.timestamp).toBe(at)
    expect(record.timestampProvenance).toBe('device')
    expect(record.provenance).toBe('client')
    expect(record.refs).toMatchObject({ appId: APP, version: '3.1.0', manifestHash: MANIFEST_HASH, cid: CID })
  })

  it('is idempotent per package: a remount is not a new fact, a new version is', () => {
    const info = { appId: APP, version: '3.1.0', manifestHash: MANIFEST_HASH, cid: CID }
    captureMiniAppLaunch(ACCOUNT, CHAIN, info)
    captureMiniAppLaunch(ACCOUNT, CHAIN, info)
    captureMiniAppLaunch(ACCOUNT, CHAIN, info)
    expect(miniAppRecords()).toHaveLength(1)

    captureMiniAppLaunch(ACCOUNT, CHAIN, { ...info, version: '3.2.0', manifestHash: '0x' + 'cd'.repeat(32) })
    expect(miniAppRecords()).toHaveLength(2)
  })

  it('keeps one app out of another app’s entry ids', () => {
    const a = miniAppEntryId('app-one', MINIAPP_KIND.LAUNCHED, `${CHAIN}:1.0.0:${MANIFEST_HASH}`)
    const b = miniAppEntryId('app-two', MINIAPP_KIND.LAUNCHED, `${CHAIN}:1.0.0:${MANIFEST_HASH}`)
    expect(a).not.toBe(b)
    expect(a.startsWith('cl:miniapp:app-one:')).toBe(true)
  })
})

describe('captureMiniAppTxSubmitted', () => {
  it('attributes the request to the app without claiming a value', () => {
    captureMiniAppTxSubmitted(ACCOUNT, CHAIN, { appId: APP, txHash: TX, to: '0xDEAD00000000000000000000000000000000BEEF' })
    const [record] = miniAppRecords()
    expect(record.kind).toBe(MINIAPP_KIND.TX_SUBMITTED)
    expect(record.txHash).toBe(TX)
    expect(record.status).toBe(LEDGER_STATUS.PENDING)
    expect(record.direction).toBe(LEDGER_DIRECTION.NONE)
    expect(record.amountRaw).toBeUndefined()
    expect(record.refs.to).toBe('0xdead00000000000000000000000000000000beef')
    expect(record.refs.appId).toBe(APP)
  })

  it('is idempotent per transaction', () => {
    captureMiniAppTxSubmitted(ACCOUNT, CHAIN, { appId: APP, txHash: TX })
    captureMiniAppTxSubmitted(ACCOUNT, CHAIN, { appId: APP, txHash: TX.toUpperCase().replace('0X', '0x') })
    expect(miniAppRecords()).toHaveLength(1)
  })

  it('supersedes the submission when the transaction resolves (append-only)', () => {
    const submitted = captureMiniAppTxSubmitted(ACCOUNT, CHAIN, { appId: APP, txHash: TX })
    const settled = captureMiniAppTxSubmitted(ACCOUNT, CHAIN, {
      appId: APP,
      txHash: TX,
      status: LEDGER_STATUS.SETTLED,
    })
    expect(settled).not.toBe(submitted)

    // Resolved view: one entry, the terminal one.
    const resolved = miniAppRecords()
    expect(resolved).toHaveLength(1)
    expect(resolved[0].status).toBe(LEDGER_STATUS.SETTLED)
    expect(resolved[0].refs.supersedes).toBe(submitted)
    // Audit view: both records survive.
    expect(listAllMiniAppRecords(ACCOUNT, CHAIN)).toHaveLength(2)
  })

  it('records a failure with its reason', () => {
    captureMiniAppTxSubmitted(ACCOUNT, CHAIN, {
      appId: APP,
      txHash: TX,
      status: LEDGER_STATUS.FAILED,
      failureReason: 'wrong network',
    })
    const [record] = miniAppRecords()
    expect(record.status).toBe(LEDGER_STATUS.FAILED)
    expect(record.failureReason).toBe('wrong network')
  })
})

describe('captureMiniAppIntegrityFailure', () => {
  it('records the refusal and its digests, never the package', () => {
    const packageBytes = 'ZXhwbG9pdC1wYXlsb2FkLWJ5dGVz'
    captureMiniAppIntegrityFailure(ACCOUNT, CHAIN, {
      appId: APP,
      reason: 'manifest_hash_mismatch',
      cid: CID,
      path: 'entry.js',
      expected: MANIFEST_HASH,
      actual: '0x' + 'ef'.repeat(32),
      // A caller passing extra properties gets none of them written: the helper
      // records only the fields it names.
      bytes: packageBytes,
      secret: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    })
    const [record] = miniAppRecords()
    expect(record.kind).toBe(MINIAPP_KIND.INTEGRITY_FAILED)
    expect(record.status).toBe(LEDGER_STATUS.FAILED)
    expect(record.failureReason).toBe('manifest_hash_mismatch')
    expect(record.refs).toMatchObject({ reason: 'manifest_hash_mismatch', cid: CID, path: 'entry.js' })
    const blob = JSON.stringify(record)
    expect(blob).not.toContain(packageBytes)
    expect(blob).not.toContain('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
  })

  it('is idempotent for the same failing artifact', () => {
    const info = { appId: APP, reason: 'file_digest_mismatch', cid: CID, path: 'entry.js' }
    captureMiniAppIntegrityFailure(ACCOUNT, CHAIN, info)
    captureMiniAppIntegrityFailure(ACCOUNT, CHAIN, info)
    expect(miniAppRecords()).toHaveLength(1)
    captureMiniAppIntegrityFailure(ACCOUNT, CHAIN, { ...info, path: 'style.css' })
    expect(miniAppRecords()).toHaveLength(2)
  })
})

describe('captureMiniAppStateChange', () => {
  it('records the key that changed and never its value', () => {
    const at = 1_700_000_100_000
    captureMiniAppStateChange(ACCOUNT, CHAIN, { appId: APP, storeKey: 'drafts', at, value: 'private note' })
    const [record] = miniAppRecords()
    expect(record.kind).toBe(MINIAPP_KIND.STATE_CHANGED)
    expect(record.refs).toEqual({ appId: APP, storeKey: 'drafts' })
    expect(JSON.stringify(record)).not.toContain('private note')
  })

  it('is idempotent for a re-record of the same change, and two real changes are two entries', () => {
    const at = 1_700_000_100_000
    captureMiniAppStateChange(ACCOUNT, CHAIN, { appId: APP, storeKey: 'drafts', at })
    captureMiniAppStateChange(ACCOUNT, CHAIN, { appId: APP, storeKey: 'drafts', at })
    expect(miniAppRecords()).toHaveLength(1)
    captureMiniAppStateChange(ACCOUNT, CHAIN, { appId: APP, storeKey: 'drafts', at: at + 60_000 })
    expect(miniAppRecords()).toHaveLength(2)
  })
})

describe('captureMiniAppLog', () => {
  it('keeps the app-supplied kind in refs so an app cannot mint a host kind', () => {
    captureMiniAppLog(ACCOUNT, CHAIN, {
      appId: APP,
      kind: 'miniapp_launched', // an app impersonating a host record
      refs: { batch: 'b-1' },
      at: 1_700_000_200_000,
    })
    const [record] = miniAppRecords()
    expect(record.kind).toBe(MINIAPP_KIND.APP_LOGGED)
    expect(record.refs.appKind).toBe('miniapp_launched')
    expect(record.refs.batch).toBe('b-1')
  })

  it('reduces an app payload to bounded scalars', () => {
    captureMiniAppLog(ACCOUNT, CHAIN, {
      appId: APP,
      kind: 'settlement_reviewed',
      at: 1_700_000_300_000,
      refs: {
        count: 3,
        ok: true,
        empty: null,
        note: 'x'.repeat(500),
        blob: { nested: 'dropped' },
        list: [1, 2, 3],
        fn: () => 'dropped',
        'not a key': 'dropped',
        ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i])),
      },
    })
    const [record] = miniAppRecords()
    expect(record.refs.count).toBe(3)
    expect(record.refs.ok).toBe(true)
    expect(record.refs.empty).toBe(null)
    expect(record.refs.note.length).toBe(200)
    expect(record.refs.blob).toBeUndefined()
    expect(record.refs.list).toBeUndefined()
    expect(record.refs.fn).toBeUndefined()
    expect(record.refs['not a key']).toBeUndefined()
    // appId + appKind + at most the bounded payload.
    expect(Object.keys(record.refs).length).toBeLessThanOrEqual(14)
  })

  it('is stable across re-records when the caller can name the event', () => {
    const info = { appId: APP, kind: 'settlement_reviewed', dedupeKey: 'batch-42' }
    captureMiniAppLog(ACCOUNT, CHAIN, info)
    captureMiniAppLog(ACCOUNT, CHAIN, info)
    expect(miniAppRecords()).toHaveLength(1)
  })
})

describe('mini-app audit reads (FR-020)', () => {
  it('filters by app, kind and time range', () => {
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: APP, version: '1.0.0', manifestHash: MANIFEST_HASH, at: 1_000 })
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: 'clearpath', version: '1.0.0', manifestHash: MANIFEST_HASH, at: 2_000 })
    captureMiniAppTxSubmitted(ACCOUNT, CHAIN, { appId: APP, txHash: TX, at: 3_000 })

    expect(listMiniAppEntries(ACCOUNT, CHAIN)).toHaveLength(3)
    expect(listMiniAppEntries(ACCOUNT, CHAIN, { appId: APP })).toHaveLength(2)
    expect(listMiniAppEntries(ACCOUNT, CHAIN, { kind: MINIAPP_KIND.LAUNCHED })).toHaveLength(2)
    expect(listMiniAppEntries(ACCOUNT, CHAIN, { fromMs: 2_000, toMs: 2_500 })).toHaveLength(1)
    expect(listMiniAppEntries(ACCOUNT, CHAIN, { appId: APP, fromMs: 2_500 })[0].kind).toBe(
      MINIAPP_KIND.TX_SUBMITTED,
    )
  })

  it('reads nothing for another account or another chain', () => {
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: APP, version: '1.0.0', manifestHash: MANIFEST_HASH })
    expect(listMiniAppEntries('0xf00d000000000000000000000000000000000073', CHAIN)).toHaveLength(0)
    expect(listMiniAppEntries(ACCOUNT, 63)).toHaveLength(0)
  })

  it('returns null from readMiniAppEntry for a record of another class', () => {
    expect(readMiniAppEntry({ class: LEDGER_CLASS.TRANSFER })).toBe(null)
    expect(readMiniAppEntry(null)).toBe(null)
  })
})

describe('mini-app source registration and safety', () => {
  it('is collected by the default repository (an unregistered source is invisible)', async () => {
    // The other domain sources reach a subgraph; answer them with nothing so
    // this test is about registration, not about the network.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })))
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: APP, version: '3.1.0', manifestHash: MANIFEST_HASH, cid: CID })

    const { entries, staleClasses } = await getDefaultLedgerRepository().listEntries({
      account: ACCOUNT,
      chainId: CHAIN,
    })
    expect(entries.map((e) => e.class)).toContain(LEDGER_CLASS.MINIAPP)
    expect(staleClasses).not.toContain(LEDGER_CLASS.MINIAPP)
    vi.unstubAllGlobals()
  })

  it('exposes the class on the source adapter', async () => {
    const source = createMiniAppLedgerSource()
    expect(source.class).toBe(LEDGER_CLASS.MINIAPP)
    captureMiniAppLaunch(ACCOUNT, CHAIN, { appId: APP, version: '1.0.0', manifestHash: MANIFEST_HASH })
    const items = await source.list({ account: ACCOUNT, chainId: CHAIN })
    expect(items).toHaveLength(1)
  })

  it('no-ops without an account, an app id or a usable chain (never throws)', () => {
    expect(() => captureMiniAppLaunch(null, CHAIN, { appId: APP })).not.toThrow()
    expect(captureMiniAppLaunch(ACCOUNT, CHAIN, {})).toBe(null)
    expect(captureMiniAppTxSubmitted(ACCOUNT, CHAIN, { appId: APP })).toBe(null)
    // Bitcoin network ids are strings (spec 061) and host no mini-apps.
    expect(captureMiniAppLaunch(ACCOUNT, 'bitcoin', { appId: APP, version: '1.0.0' })).toBe(null)
    expect(listMiniAppEntries(ACCOUNT, CHAIN)).toHaveLength(0)
  })
})
