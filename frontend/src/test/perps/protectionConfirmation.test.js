/**
 * Confirming a DIRECT settlement (spec 083, US2 acceptance 3).
 *
 * A Gains `updateSl` / `updateTp` settles inside the member's own transaction and emits no order
 * event this app decodes. There is nothing for the order machine's watcher to see, so without the
 * re-read below a protection change rests at "Sent to Gains" for ever: `confirmFromVenue` had no
 * caller at all, `onActionComplete` never fired, and the sheet kept showing the REQUESTED level as
 * though the venue had agreed to it.
 *
 * What these assert, and the specific harm each one prevents:
 *
 *   - the read returns what GAINS HOLDS, in the venue's own units and in human ones, with the
 *     venue's `0` reported as "no level" rather than as a price of zero;
 *   - a stored value that DIFFERS from the requested one is reported as the venue's, and flagged —
 *     the whole of acceptance 3, and the case a sheet that echoed its own input would get wrong;
 *   - an endpoint a block behind cannot confirm anything: a change has to be PROVEN against the
 *     baseline, because accepting the pre-write answer would report the old level as the new one;
 *   - the re-read is BOUNDED, and exhaustion resolves — no spinner with no end, no false success;
 *   - the two Gains index spaces cannot be crossed by a read either.
 *
 * Nothing here touches a network: the diamond, the provider and the clock are all injected.
 */
import { describe, it, expect, vi } from 'vitest'

import {
  PROTECTION_CONFIRM_ATTEMPTS,
  confirmStoredProtection,
  readStoredProtection,
} from '../../components/perps/positionSheetActions'
import * as gains from '../../lib/perps/venues/gains'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const OTHER = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
const INDEX = gains.tradeIndex(7)

/** A price in the venue's own 1e10 fixed point. */
const price = (human) => BigInt(Math.round(human * 1e4)) * 10n ** 6n

/** The Trade tuple as ethers hands it back — only the fields this read consumes. */
function trade({ user = MEMBER, index = 7, sl = 0n, tp = 0n, isOpen = true } = {}) {
  return { user, index: BigInt(index), sl, tp, isOpen }
}

/** A fake diamond. `getTrades` is the fallback path, so both are separately controllable. */
function diamond({ getTrade, getTrades } = {}) {
  return {
    getTrade: getTrade ?? (async () => trade()),
    getTrades: getTrades ?? (async () => [trade()]),
  }
}

function readDeps(contract, overrides = {}) {
  return {
    venue: 'gains',
    chainId: ARBITRUM,
    account: MEMBER,
    tradeIndex: INDEX,
    getProvider: () => ({}),
    makeContract: () => contract,
    ...overrides,
  }
}

/* --------------------------------------------------------------------------------------------- *
 * The read
 * --------------------------------------------------------------------------------------------- */

describe('readStoredProtection — what the venue actually holds', () => {
  it('reports both units, and the venue’s own 0 as "no level" rather than a price', async () => {
    const contract = diamond({ getTrade: async () => trade({ sl: price(59_000), tp: 0n }) })
    const result = await readStoredProtection(readDeps(contract))

    expect(result.ok).toBe(true)
    // Venue units — the same scale every other `order.execution` payload carries.
    expect(result.stored.sl).toBe(590_000_000_000_000n)
    expect(result.stored.tp).toBe(0n)
    // Human units for the member's fields. A missing take-profit is null, never 0.
    expect(result.stored.stopLoss).toBe(59_000)
    expect(result.stored.takeProfit).toBeNull()
    expect(result.stored.tradeIndex).toBe(INDEX)
  })

  it('asks the venue for THIS member’s trade at THIS index', async () => {
    const getTrade = vi.fn(async () => trade({ sl: price(59_000) }))
    await readStoredProtection(readDeps(diamond({ getTrade })))
    expect(getTrade).toHaveBeenCalledWith(MEMBER, 7)
  })

  it('falls back to getTrades when the diamond does not serve getTrade', async () => {
    const contract = diamond({
      getTrade: async () => {
        throw new Error('no such function')
      },
      getTrades: async () => [trade({ index: 4, sl: price(1) }), trade({ index: 7, sl: price(59_000) })],
    })
    const result = await readStoredProtection(readDeps(contract))
    expect(result.ok).toBe(true)
    expect(result.stored.stopLoss).toBe(59_000)
  })

  it('REFUSES an answer about anyone else’s trade, or about another index', async () => {
    for (const wrong of [trade({ user: OTHER, sl: price(59_000) }), trade({ index: 9, sl: price(59_000) })]) {
      const result = await readStoredProtection(
        readDeps(diamond({ getTrade: async () => wrong, getTrades: async () => [wrong] })),
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('not_found')
    }
  })

  it('REFUSES a pending-order index — a read of the wrong object is worse than no read', async () => {
    const result = await readStoredProtection(readDeps(diamond(), { tradeIndex: gains.pendingOrderIndex(7) }))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('index_unavailable')
    // …and an unbranded number cannot get through either.
    expect((await readStoredProtection(readDeps(diamond(), { tradeIndex: 7 }))).ok).toBe(false)
  })

  it('is TOTAL — every failure is a refusal with a reason, never a throw and never a claim', async () => {
    const cases = {
      unsupported: readDeps(diamond(), { venue: 'gmx' }),
      venue_undeployed: readDeps(diamond(), { chainId: 999_999 }),
      account_unavailable: readDeps(diamond(), { account: null }),
      unreadable: readDeps(diamond(), { getProvider: () => null }),
    }
    for (const [reason, input] of Object.entries(cases)) {
      const result = await readStoredProtection(input)
      expect(result.ok, reason).toBe(false)
      expect(result.reason).toBe(reason)
      expect(result.stored).toBeUndefined()
    }
    // A provider that throws, a contract that reverts, and a junk input all land the same way.
    await expect(
      readStoredProtection(
        readDeps(diamond(), {
          getProvider: () => {
            throw new Error('endpoint down')
          },
        }),
      ),
    ).resolves.toMatchObject({ ok: false })
    await expect(readStoredProtection(null)).resolves.toMatchObject({ ok: false })
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The bounded confirmation
 * --------------------------------------------------------------------------------------------- */

/** A `readStored` that answers each call from a script, then repeats its last answer. */
function scripted(answers) {
  const calls = []
  const readStored = vi.fn(async (input) => {
    calls.push(input)
    return answers[Math.min(calls.length - 1, answers.length - 1)]
  })
  return { readStored, calls }
}

const stored = (stopLoss, takeProfit = null) => ({
  ok: true,
  stored: {
    stopLoss,
    takeProfit,
    sl: stopLoss === null ? 0n : price(stopLoss),
    tp: takeProfit === null ? 0n : price(takeProfit),
  },
})

const never = () => new Promise(() => {})
const immediately = async () => {}

function confirm(input) {
  return confirmStoredProtection({
    venue: 'gains',
    chainId: ARBITRUM,
    account: MEMBER,
    tradeIndex: INDEX,
    intervalMs: 0,
    ...input,
  })
}

describe('confirmStoredProtection — the venue’s answer, or an honest "we could not confirm"', () => {
  it('reports what the venue STORED when it differs from what was asked for (acceptance 3)', async () => {
    // Gains rounded the requested 59,000 to 59,050 — its own price step. The member asked for one
    // number and holds another, and the caller has to be able to say so.
    const { readStored } = scripted([stored(59_050, 70_000)])
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000, takeProfit: 70_000 },
      deps: { readStored, sleep: immediately },
    })

    expect(result.ok).toBe(true)
    expect(result.stored.stopLoss).toBe(59_050)
    expect(result.stored.stopLoss).not.toBe(59_000)
    expect(result.matchesRequest).toBe(false)
    // One read was enough — the change was already provable against the baseline.
    expect(readStored).toHaveBeenCalledTimes(1)
  })

  it('says so when the venue stored exactly what was asked for', async () => {
    const { readStored } = scripted([stored(59_000, 70_000)])
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000, takeProfit: 70_000 },
      deps: { readStored, sleep: immediately },
    })
    expect(result.ok).toBe(true)
    expect(result.matchesRequest).toBe(true)
  })

  it('will not accept a STALE answer as the new one, and keeps asking until it changes', async () => {
    // An endpoint a block or two behind still serves the pre-write levels. Reading that as the
    // confirmation is how the OLD stop gets reported as the new one.
    const { readStored } = scripted([stored(57_000), stored(57_000), stored(59_000)])
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000, takeProfit: null },
      deps: { readStored, sleep: immediately },
    })
    expect(result.ok).toBe(true)
    expect(result.stored.stopLoss).toBe(59_000)
    expect(readStored).toHaveBeenCalledTimes(3)
  })

  it('confirms a REMOVED level — the venue holding nothing is an answer, not a missing one', async () => {
    const { readStored } = scripted([stored(null, 70_000)])
    const result = await confirm({
      requested: { sl: null },
      previous: { stopLoss: 57_000, takeProfit: 70_000 },
      deps: { readStored, sleep: immediately },
    })
    expect(result.ok).toBe(true)
    expect(result.stored.stopLoss).toBeNull()
    expect(result.matchesRequest).toBe(true)
  })

  it('requires EVERY leg that was written to have moved, not just one of them', async () => {
    const { readStored } = scripted([stored(59_000, 70_000), stored(59_000, 72_000)])
    const result = await confirm({
      requested: { sl: 59_000, tp: 72_000 },
      previous: { stopLoss: 57_000, takeProfit: 70_000 },
      deps: { readStored, sleep: immediately },
    })
    expect(result.ok).toBe(true)
    expect(readStored).toHaveBeenCalledTimes(2)
    expect(result.stored.takeProfit).toBe(72_000)
  })

  it('with NO baseline, only an exact match settles it — an unproven change is not a change', async () => {
    // `previous: null` is "the venue was never read", which is different from "the venue had none".
    // Without a baseline a differing value is indistinguishable from a stale one, so it waits.
    const { readStored } = scripted([stored(57_000), stored(59_000)])
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: null,
      deps: { readStored, sleep: immediately },
    })
    expect(result.ok).toBe(true)
    expect(readStored).toHaveBeenCalledTimes(2)
  })

  /* ------------------------------------------------------------------------------------------ *
   * Exhaustion — the bound, and where it lands
   * ------------------------------------------------------------------------------------------ */

  it('EXHAUSTS after a bounded number of reads and resolves as unconfirmed', async () => {
    // The venue never moves: a write that silently did nothing, or an endpoint that never caught
    // up. Either way the loop must END, and it must claim neither success nor failure.
    const { readStored } = scripted([stored(57_000)])
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000, takeProfit: null },
      deps: { readStored, sleep: immediately },
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unconfirmed')
    expect(readStored).toHaveBeenCalledTimes(PROTECTION_CONFIRM_ATTEMPTS)
    // The last thing the venue actually said is carried, so the caller shows the venue's own
    // levels rather than the requested ones even here.
    expect(result.stored.stopLoss).toBe(57_000)
  })

  it('exhausts on a read that never succeeds, too — and carries no stored levels at all', async () => {
    const { readStored } = scripted([{ ok: false, reason: 'unreadable' }])
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000, takeProfit: null },
      deps: { readStored, sleep: immediately },
    })
    expect(result).toMatchObject({ ok: false, reason: 'unconfirmed', stored: null })
    expect(readStored).toHaveBeenCalledTimes(PROTECTION_CONFIRM_ATTEMPTS)
  })

  it('honours a smaller bound, and a read that THROWS is a failed poll, not an outcome', async () => {
    const readStored = vi.fn(async () => {
      throw new Error('endpoint down')
    })
    const result = await confirm({
      attempts: 3,
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000 },
      deps: { readStored, sleep: immediately },
    })
    expect(result.ok).toBe(false)
    expect(readStored).toHaveBeenCalledTimes(3)
  })

  it('ABANDONS the moment the caller goes away, rather than publishing into a dead sheet', async () => {
    const { readStored } = scripted([stored(57_000)])
    let alive = true
    const result = await confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000 },
      deps: {
        readStored,
        sleep: async () => {
          alive = false
        },
        alive: () => alive,
      },
    })
    expect(result).toEqual({ ok: false, reason: 'abandoned' })
    expect(readStored).toHaveBeenCalledTimes(1)
  })

  it('never settles on nothing: with no leg written there is nothing to confirm', async () => {
    const { readStored } = scripted([stored(57_000)])
    const result = await confirm({ requested: {}, previous: null, attempts: 2, deps: { readStored, sleep: immediately } })
    expect(result.ok).toBe(false)
  })

  it('does not spin between polls — it waits on the injected clock', async () => {
    const { readStored } = scripted([stored(57_000)])
    const pending = confirm({
      requested: { sl: 59_000 },
      previous: { stopLoss: 57_000 },
      deps: { readStored, sleep: never },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(readStored).toHaveBeenCalledTimes(1)
    expect(pending).toBeInstanceOf(Promise)
  })
})
