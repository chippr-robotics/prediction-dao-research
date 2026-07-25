// Spec 067 (T058/T108/T109/T110, FR-038/FR-039/FR-039a) — the bridge and liquidity vocabulary is added
// additively and never collides with wager pools: new ledger classes leave existing ones untouched, the
// feed labels the two features distinctly, and each new notification category is independently
// controllable and delivered by default.

import { describe, it, expect, beforeEach } from 'vitest'
import { LEDGER_CLASS, LEDGER_CLASSES } from '../../data/ledger/constants'
import { normalizeEntry } from '../../data/ledger/normalize'
import { domainLabel } from '../../data/notifications/domains'
import {
  NOTIFICATION_CATEGORIES,
  DEFAULT_MODE,
  getNotificationPrefs,
  getDeliveryMode,
  setDeliveryMode,
  resolveDelivery,
} from '../../lib/notifications/deliveryPreferences'

const TX = '0x' + '67'.repeat(32)
const CTX = { account: '0xabc0000000000000000000000000000000000067', chainId: 137 }

// Mirrors the fixture in ledger/normalize.test.js — only `class` varies here.
function pre(overrides = {}) {
  return {
    entryId: `oc:137:${TX}:0`,
    chainId: 137,
    class: LEDGER_CLASS.BRIDGE,
    kind: 'deposit',
    direction: 'out',
    status: 'pending',
    provenance: 'onchain',
    txHash: TX,
    amountRaw: '1000000',
    tokenAddress: '0xToken',
    timestamp: 1_700_000_000_000,
    timestampProvenance: 'chain',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('spec 067 ledger classes (T058)', () => {
  it('adds bridge and liquidity', () => {
    expect(LEDGER_CLASS.BRIDGE).toBe('bridge')
    expect(LEDGER_CLASS.LIQUIDITY).toBe('liquidity')
  })

  it('leaves every pre-067 class value untouched (client ledger + encrypted backup depend on them)', () => {
    // Literals, not references: a rename would silently orphan historical entries.
    expect(LEDGER_CLASS.WAGER).toBe('wager')
    expect(LEDGER_CLASS.TRANSFER).toBe('transfer')
    expect(LEDGER_CLASS.EARN).toBe('earn')
    expect(LEDGER_CLASS.STAKING).toBe('staking')
    expect(LEDGER_CLASS.POOL).toBe('pool')
    expect(LEDGER_CLASS.MEMBERSHIP).toBe('membership')
  })

  it('keeps liquidity distinct from the wager-pool class (FR-039)', () => {
    expect(LEDGER_CLASS.LIQUIDITY).not.toBe(LEDGER_CLASS.POOL)
  })

  it('normalizes an entry of each new class instead of rejecting it as unknown', () => {
    expect(LEDGER_CLASSES).toEqual(expect.arrayContaining(['bridge', 'liquidity']))
    expect(normalizeEntry(pre(), CTX).class).toBe('bridge')
    expect(normalizeEntry(pre({ class: LEDGER_CLASS.LIQUIDITY }), CTX).class).toBe('liquidity')
  })
})

describe('spec 067 feed domain labels (T108/T109)', () => {
  it('labels the new domains', () => {
    expect(domainLabel('bridge')).toBe('Bridge')
    expect(domainLabel('liquidity')).toBe('Liquidity')
  })

  it('disambiguates the wager-pool label from bare "Pool" (FR-039a)', () => {
    expect(domainLabel('pools')).toBe('Wager Pool')
  })

  it('gives the three pool-adjacent domains three different labels', () => {
    const labels = ['pools', 'liquidity', 'earn'].map(domainLabel)
    expect(new Set(labels).size).toBe(3)
  })
})

describe('spec 067 notification categories (T110, FR-038)', () => {
  it('registers bridge and liquidity as their own categories with descriptions', () => {
    for (const domain of ['bridge', 'liquidity']) {
      const category = NOTIFICATION_CATEGORIES.find((c) => c.domain === domain)
      expect(category, `${domain} category missing`).toBeTruthy()
      expect(category.label).toBeTruthy()
      expect(category.description.length).toBeGreaterThan(10)
    }
  })

  it('defaults both new categories to delivered, never silently off', () => {
    const { modes } = getNotificationPrefs()
    expect(DEFAULT_MODE).toBe('app')
    expect(modes.bridge).toBe(DEFAULT_MODE)
    expect(modes.liquidity).toBe(DEFAULT_MODE)
    expect(resolveDelivery('bridge')).not.toBe('silent')
    expect(resolveDelivery('liquidity')).not.toBe('silent')
  })

  it('settles each new category independently of the other and of wager pools', () => {
    setDeliveryMode('liquidity', 'silent')
    expect(resolveDelivery('liquidity')).toBe('silent')
    expect(getDeliveryMode('bridge')).toBe(DEFAULT_MODE)
    expect(getDeliveryMode('pools')).toBe(DEFAULT_MODE)
  })
})
