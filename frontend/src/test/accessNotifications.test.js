/**
 * Access vocabulary + records (spec 095) — the durable audit trail and the feed domain.
 *
 * Two separate mechanisms, deliberately: the client LEDGER holds the permanent record (it rides the
 * encrypted backup), and the activity SOURCE turns a change into a feed entry. Registering a
 * notification category whose domain nothing produces would put a control in Settings that does
 * nothing, so the source is what makes the category honest.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { domainLabel, DOMAIN_META } from '../data/notifications/domains'
import {
  DEFAULT_MODE,
  NOTIFICATION_CATEGORIES,
  getDeliveryMode,
  resolveDelivery,
} from '../lib/notifications/deliveryPreferences'
import { activitySources } from '../data/notifications/sources'
import { accessSource } from '../data/notifications/sources/accessSource'
import {
  captureApiKeyCreated,
  captureApiKeyRevoked,
  captureAssistantPreference,
} from '../data/ledger/sources/accessLedgerSource'
import { listClientRecords, listClientRecordsAllChains } from '../data/ledger/ledgerClientStore'
import { buildGrant, markApiKeyRevoked, recordApiKey } from '../lib/apiAccess/apiKeys'
import { __resetAssistantPrefsForTests, setAssistantEnabled } from '../lib/assistant/assistantPrefs'

const ACCOUNT = '0x' + '5'.repeat(40)
const CHAIN = 137
const KEY_ID = '0x' + 'a1'.repeat(32)
const TOKEN = 'fw1.eyJ2IjoxfQ.AAAA'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  __resetAssistantPrefsForTests()
})

describe('audit records', () => {
  it('records a key creation with metadata only — never a token', () => {
    captureApiKeyCreated(ACCOUNT, CHAIN, {
      keyId: KEY_ID,
      label: 'my agent',
      scopes: ['read:profile'],
      expiresAt: 1_750_000_000,
      // A caller could pass anything; only the whitelisted fields are written.
      token: TOKEN,
    })
    const record = listClientRecords(ACCOUNT, CHAIN).find((r) => r.kind === 'api_key_created')
    expect(record).toBeTruthy()
    expect(record.refs.keyId).toBe(KEY_ID)
    expect(record.refs.label).toBe('my agent')
    expect(record.class).toBe('membership')
    expect(JSON.stringify(record)).not.toContain(TOKEN)
  })

  it('records a revocation, including whether the gateway’s record is durable', () => {
    captureApiKeyRevoked(ACCOUNT, CHAIN, { keyId: KEY_ID, label: 'my agent', durable: false })
    const record = listClientRecords(ACCOUNT, CHAIN).find((r) => r.kind === 'api_key_revoked')
    expect(record.refs.durable).toBe(false)
  })

  it('is idempotent per key (stable entryId)', () => {
    captureApiKeyCreated(ACCOUNT, CHAIN, { keyId: KEY_ID })
    captureApiKeyCreated(ACCOUNT, CHAIN, { keyId: KEY_ID })
    expect(listClientRecordsAllChains(ACCOUNT).filter((r) => r.kind === 'api_key_created')).toHaveLength(1)
  })

  it('records the assistant switch once per state per day, not once per toggle', () => {
    captureAssistantPreference(ACCOUNT, CHAIN, true)
    captureAssistantPreference(ACCOUNT, CHAIN, true)
    captureAssistantPreference(ACCOUNT, CHAIN, false)
    const kinds = listClientRecordsAllChains(ACCOUNT).map((r) => r.kind)
    expect(kinds.filter((k) => k === 'assistant_enabled')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'assistant_disabled')).toHaveLength(1)
  })

  it('no-ops without an account or a key id, and never throws', () => {
    expect(() => captureApiKeyCreated(null, CHAIN, { keyId: KEY_ID })).not.toThrow()
    expect(() => captureApiKeyCreated(ACCOUNT, CHAIN, {})).not.toThrow()
    expect(listClientRecordsAllChains(ACCOUNT)).toHaveLength(0)
  })
})

describe('feed vocabulary', () => {
  it('labels the access domain distinctly', () => {
    expect(DOMAIN_META.access).toBeTruthy()
    expect(domainLabel('access')).toBe('Access')
    const labels = ['access', 'membership', 'custody'].map(domainLabel)
    expect(new Set(labels).size).toBe(3)
  })

  it('registers a delivery category that is delivered by default, never silently off', () => {
    const category = NOTIFICATION_CATEGORIES.find((c) => c.domain === 'access')
    expect(category).toBeTruthy()
    expect(category.description.length).toBeGreaterThan(0)
    expect(getDeliveryMode('access')).toBe(DEFAULT_MODE)
    expect(resolveDelivery('access')).toBe('app')
  })

  it('registers exactly one activity source under that key', () => {
    const keys = activitySources.map((s) => s.key)
    expect(keys).toContain('access')
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('accessSource', () => {
  const detect = (prior) => accessSource.detect({ account: ACCOUNT, chainId: CHAIN, nowMs: 1_750_000_000_000, prior })

  it('baselines on its first cycle and announces nothing retroactively', async () => {
    recordApiKey(ACCOUNT, buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 30, label: 'pre-existing' }))
    const first = await detect({ snapshots: {}, aux: {} })
    expect(first.ok).toBe(true)
    expect(first.entries).toEqual([])
    expect(first.nextAux).toEqual({ seeded: true })
  })

  it('announces a key minted after the baseline', async () => {
    const first = await detect({ snapshots: {}, aux: {} })
    const grant = buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 30, label: 'new agent' })
    recordApiKey(ACCOUNT, grant)

    const second = await detect({ snapshots: first.nextSnapshots, aux: first.nextAux })
    expect(second.entries).toHaveLength(1)
    expect(second.entries[0]).toMatchObject({ domain: 'access', type: 'api_key_created', refId: grant.keyId })
    expect(second.entries[0].message).toContain('new agent')
    expect(second.entries[0].link.to).toContain('#api-access')
  })

  it('announces a revocation, then stops', async () => {
    const grant = buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 30, label: 'leaked' })
    recordApiKey(ACCOUNT, grant)
    const first = await detect({ snapshots: {}, aux: {} })

    markApiKeyRevoked(ACCOUNT, grant.keyId, 1_750_000_100)
    const second = await detect({ snapshots: first.nextSnapshots, aux: first.nextAux })
    expect(second.entries.map((e) => e.type)).toEqual(['api_key_revoked'])

    const third = await detect({ snapshots: second.nextSnapshots, aux: second.nextAux })
    expect(third.entries).toEqual([])
  })

  it('announces the assistant being switched on', async () => {
    const first = await detect({ snapshots: {}, aux: {} })
    setAssistantEnabled(ACCOUNT, true)
    const second = await detect({ snapshots: first.nextSnapshots, aux: first.nextAux })
    expect(second.entries.map((e) => e.type)).toEqual(['assistant_enabled'])
    expect(second.entries[0].message).toMatch(/sent to the fairwins gateway/i)
  })

  it('never reports a failure — it reads only local state, so it cannot fail to find out', async () => {
    const result = await accessSource.detect({ account: null, chainId: CHAIN, nowMs: 1, prior: { snapshots: {}, aux: {} } })
    expect(result.ok).toBe(true)
    expect(result.entries).toEqual([])
  })
})
