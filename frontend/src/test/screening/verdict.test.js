import { describe, it, expect } from 'vitest'
import { deriveVerdict, describeVerdict, countReadings, VERDICTS, VERDICT_LABELS } from '../../lib/screening/verdict'

const read = (chainId, flagged, label = 'Chainalysis sanctions oracle', detail = null) => ({
  id: `${label}:${chainId}`, kind: 'x', label, chainId, address: '0x', status: 'read', flagged, detail,
})
const unreadable = (chainId, label = 'Circle USDC freeze list', reason = 'timed out') => ({
  id: `${label}:${chainId}`, kind: 'x', label, chainId, address: '0x', status: 'unreadable', reason,
})
const names = { 1: 'Ethereum', 137: 'Polygon', 8453: 'Base' }
const nameFor = (id) => names[id] || `chain ${id}`

describe('deriveVerdict — the green one is the hard one', () => {
  it('is SCREENED only when every source answered and none flagged', () => {
    expect(deriveVerdict([read(1, false), read(137, false)])).toBe(VERDICTS.SCREENED)
  })

  it('is FLAGGED when ANY single source says so, whatever the rest say', () => {
    expect(deriveVerdict([read(1, false), read(137, true), read(8453, false)])).toBe(VERDICTS.FLAGGED)
    // Even alongside unreadables: a positive fact from one list stands on its own.
    expect(deriveVerdict([unreadable(1), read(137, true)])).toBe(VERDICTS.FLAGGED)
  })

  it('is PARTIAL — never SCREENED — when a source could not be read', () => {
    expect(deriveVerdict([read(1, false), unreadable(137)])).toBe(VERDICTS.PARTIAL)
  })

  it('is UNSCREENED when nothing answered, or nothing was asked', () => {
    expect(deriveVerdict([unreadable(1), unreadable(137)])).toBe(VERDICTS.UNSCREENED)
    expect(deriveVerdict([])).toBe(VERDICTS.UNSCREENED)
  })

  it('never lets an unreadable count as an answer', () => {
    const c = countReadings([read(1, false), unreadable(137), unreadable(8453)])
    expect(c).toEqual({ read: 1, flagged: 0, unreadable: 2, total: 3 })
  })

  it('has a word for every verdict (never colour alone)', () => {
    for (const v of Object.values(VERDICTS)) expect(typeof VERDICT_LABELS[v]).toBe('string')
  })
})

describe('describeVerdict — the sentence names what the verdict rests on', () => {
  it('names the flagging list AND its network', () => {
    const result = { verdict: VERDICTS.FLAGGED, readings: [read(1, false), read(8453, true, 'Circle USDC freeze list', 'frozen by Circle')] }
    const s = describeVerdict(result, nameFor)
    expect(s).toMatch(/flagged by sanctions screening/)
    expect(s).toContain('Circle USDC freeze list on Base')
    expect(s).not.toContain('Ethereum')
  })

  it('counts sources and networks for a clean bill', () => {
    const result = { verdict: VERDICTS.SCREENED, readings: [read(1, false), read(1, false, 'Circle USDC freeze list'), read(137, false)] }
    expect(describeVerdict(result, nameFor)).toBe('Screened clear by 3 sources on 2 networks.')
  })

  it('names the missing list on a partial screen and says it is not a clean bill', () => {
    const result = { verdict: VERDICTS.PARTIAL, readings: [read(1, false), unreadable(137, 'FairWins sanctions guard')] }
    const s = describeVerdict(result, nameFor)
    expect(s).toContain('1 of 2 sources answered clear')
    expect(s).toContain('FairWins sanctions guard on Polygon could not be read')
    expect(s).toContain('Not a clean bill')
  })

  it('names the uncovered networks when there was nothing to ask', () => {
    const result = { verdict: VERDICTS.UNSCREENED, readings: [], uncovered: [61] }
    expect(describeVerdict(result, (id) => (id === 61 ? 'Ethereum Classic' : `chain ${id}`))).toContain(
      'No screening source covers Ethereum Classic',
    )
  })
})
