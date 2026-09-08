import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../config/contracts', () => ({ getContractAddressForChain: () => undefined }))

import {
  screenAddressAcrossEstate,
  forgetEstateScreening,
  __clearEstateScreeningCache,
} from '../../lib/screening/screenEstate'
import { VERDICTS, READ, UNREADABLE } from '../../lib/screening/verdict'

const ADDR = '0x098b716b8aaf21512996dc57eb0615e2383e2f96' // lowercase on purpose
const CHECKSUM = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96'

const src = (chainId, kind, behaviour) => ({
  id: `${kind}:${chainId}`,
  kind,
  chainId,
  address: '0x0000000000000000000000000000000000000001',
  label: kind,
  read: behaviour,
})
const clear = async () => ({ flagged: false, detail: null })
const flagged = async () => ({ flagged: true, detail: 'listed' })
const dead = async () => {
  throw new Error('endpoint down')
}
const hang = () => new Promise(() => {})

describe('screenAddressAcrossEstate', () => {
  beforeEach(() => __clearEstateScreeningCache())
  afterEach(() => vi.useRealTimers())

  it('never rejects: one dead source is one unreadable row, its siblings still answer', async () => {
    const sourcesFor = (id) => (id === 1 ? [src(1, 'a', dead), src(1, 'b', clear)] : id === 137 ? [src(137, 'c', clear)] : [])
    const r = await screenAddressAcrossEstate(ADDR, { chainIds: [1, 137, 61], sourcesFor, providerFor: () => ({}) })
    expect(r.address).toBe(CHECKSUM)
    expect(r.readings).toHaveLength(3)
    const down = r.readings.find((x) => x.id === 'a:1')
    expect(down.status).toBe(UNREADABLE)
    expect(down.reason).toContain('endpoint down')
    expect(down.flagged).toBeUndefined() // no value on a non-answer
    expect(r.readings.filter((x) => x.status === READ)).toHaveLength(2)
    expect(r.uncovered).toEqual([61])
    expect(r.verdict).toBe(VERDICTS.PARTIAL)
  })

  it('is SCREENED only when every source on every asked chain answered clear', async () => {
    const sourcesFor = (id) => [src(id, 'x', clear)]
    const r = await screenAddressAcrossEstate(ADDR, { chainIds: [1, 137], sourcesFor, providerFor: () => ({}) })
    expect(r.verdict).toBe(VERDICTS.SCREENED)
    expect(r.uncovered).toEqual([])
  })

  it('is FLAGGED on a single hit and keeps the hit attributable', async () => {
    const sourcesFor = (id) => (id === 8453 ? [src(id, 'freeze', flagged)] : [src(id, 'x', clear)])
    const r = await screenAddressAcrossEstate(ADDR, { chainIds: [1, 8453], sourcesFor, providerFor: () => ({}) })
    expect(r.verdict).toBe(VERDICTS.FLAGGED)
    const hit = r.readings.find((x) => x.flagged)
    expect(hit.chainId).toBe(8453)
    expect(hit.detail).toBe('listed')
  })

  it('a chain with no provider is unreadable with that reason — never clear', async () => {
    const r = await screenAddressAcrossEstate(ADDR, {
      chainIds: [1],
      sourcesFor: (id) => [src(id, 'x', clear)],
      providerFor: () => null,
    })
    expect(r.readings[0].status).toBe(UNREADABLE)
    expect(r.readings[0].reason).toMatch(/no read connection/)
    expect(r.verdict).toBe(VERDICTS.UNSCREENED)
  })

  it('bounds every source by the deadline and reports the timeout as the reason', async () => {
    vi.useFakeTimers()
    const p = screenAddressAcrossEstate(ADDR, {
      chainIds: [1],
      sourcesFor: (id) => [src(id, 'slow', hang), src(id, 'fast', clear)],
      providerFor: () => ({}),
      deadlineMs: 500,
    })
    await vi.advanceTimersByTimeAsync(600)
    const r = await p
    const slow = r.readings.find((x) => x.id === 'slow:1')
    expect(slow.status).toBe(UNREADABLE)
    expect(slow.reason).toMatch(/no answer within/)
    expect(r.verdict).toBe(VERDICTS.PARTIAL)
  })

  it('an invalid address is UNSCREENED with nothing asked, not an exception', async () => {
    const r = await screenAddressAcrossEstate('not an address', { chainIds: [1], sourcesFor: () => [src(1, 'x', clear)] })
    expect(r.verdict).toBe(VERDICTS.UNSCREENED)
    expect(r.readings).toEqual([])
    expect(r.chainIds).toEqual([])
  })

  it('caches per address + chain set and de-duplicates in-flight sweeps', async () => {
    const read = vi.fn(clear)
    const sourcesFor = (id) => [src(id, 'x', read)]
    const opts = { chainIds: [1], sourcesFor, providerFor: () => ({}) }
    const [a, b] = await Promise.all([screenAddressAcrossEstate(ADDR, opts), screenAddressAcrossEstate(CHECKSUM, opts)])
    expect(read).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    const c = await screenAddressAcrossEstate(ADDR, opts)
    expect(c).toBe(a)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('force bypasses the cache; forget drops it', async () => {
    const read = vi.fn(clear)
    const opts = { chainIds: [1], sourcesFor: (id) => [src(id, 'x', read)], providerFor: () => ({}) }
    await screenAddressAcrossEstate(ADDR, opts)
    await screenAddressAcrossEstate(ADDR, { ...opts, force: true })
    expect(read).toHaveBeenCalledTimes(2)
    forgetEstateScreening(ADDR)
    await screenAddressAcrossEstate(ADDR, opts)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('asks only the chains it is given — a different chain set is a different cache entry', async () => {
    const read = vi.fn(clear)
    const sourcesFor = (id) => [src(id, 'x', read)]
    const a = await screenAddressAcrossEstate(ADDR, { chainIds: [1], sourcesFor, providerFor: () => ({}) })
    const b = await screenAddressAcrossEstate(ADDR, { chainIds: [1, 137], sourcesFor, providerFor: () => ({}) })
    expect(a).not.toBe(b)
    expect(b.chainIds).toEqual([1, 137])
  })
})
