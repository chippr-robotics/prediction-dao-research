import { describe, it, expect } from 'vitest'
import { wagerTitlesById, annotateWagerEntries } from '../../lib/account/ledgerAdapters'

const wagerEntry = (wagerId, extra = {}) => ({
  entryId: `e-${wagerId}`,
  class: 'wager',
  kind: 'deposit',
  refs: { wagerId: String(wagerId) },
  ...extra,
})

describe('wagerTitlesById', () => {
  it('maps wager ids to the same display title My Wagers renders', () => {
    const titles = wagerTitlesById([
      { id: 1, metadata: { name: 'Pizza bet with Sam' } },
      { id: '2', decryptedMetadata: { description: 'Who wins the finals' } },
    ])
    expect(titles.get('1')).toBe('Pizza bet with Sam')
    expect(titles.get('2')).toBe('Who wins the finals')
  })

  it('keeps the honest placeholder for encrypted friend wagers', () => {
    const titles = wagerTitlesById([
      { id: 3, marketType: 'friend', description: 'Encrypted Wager', stakeAmount: '10', stakeTokenSymbol: 'USDC' },
    ])
    expect(titles.get('3')).toBe('Private Bet - 10 USDC')
  })

  it('skips records without an id', () => {
    const titles = wagerTitlesById([{ metadata: { name: 'orphan' } }, null])
    expect(titles.size).toBe(0)
  })
})

describe('annotateWagerEntries', () => {
  const titles = new Map([['1', 'Pizza bet with Sam']])

  it('annotates wager entries whose title is known, copying rather than mutating', () => {
    const entries = [wagerEntry(1)]
    const out = annotateWagerEntries(entries, titles)
    expect(out[0].wagerTitle).toBe('Pizza bet with Sam')
    expect(out[0]).not.toBe(entries[0])
    expect(entries[0].wagerTitle).toBeUndefined()
  })

  it('passes unknown wagers and non-wager entries through untouched', () => {
    const unknown = wagerEntry(9)
    const transfer = { entryId: 't-1', class: 'transfer', kind: 'send', refs: {} }
    const out = annotateWagerEntries([unknown, transfer], titles)
    expect(out[0]).toBe(unknown)
    expect(out[1]).toBe(transfer)
  })
})
