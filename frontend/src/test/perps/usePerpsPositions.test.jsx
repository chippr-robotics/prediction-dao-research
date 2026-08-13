/**
 * usePerpsPositions (spec 082 US2, extended by spec 083 T032).
 *
 * Phase 0's properties still hold — account reset, per-venue isolation, honest failure — and three
 * more arrive with position management:
 *
 *   - the gateway's `venueRef` reaches consumers with the Gains trade index BRANDED, and a payload
 *     that predates it still renders every position;
 *   - GMX positions are read client-side from the Reader, decoded by the ONE decoder, so a second
 *     position in the response is real rather than stride-shifted garbage;
 *   - the two sources fail independently in both directions, and nothing that could be read is ever
 *     rendered as absence.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Interface } from 'ethers'

import { GMX_READER_ABI } from '../../abis/perps/gmxReader'
import { GMX_ADDRESSES_BY_CHAIN } from '../../config/perps'
import { usePerpsPositions } from '../../hooks/usePerpsPositions'
import { isTradeIndex, isPendingOrderIndex } from '../../lib/perps/venues/gains'

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const ARBITRUM = 42161

const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const BTC_MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703'
const ETH_MARKET = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

const reader = new Interface(GMX_READER_ABI)

/**
 * The gateway's `PerpPosition` for Gains, exactly as `normalize.js` emits it: display fields
 * unchanged from spec 082, plus the spec-083 `venueRef`. Note there is NO bare `index` on the ref —
 * the two Gains index spaces are told apart by field NAME, so the wire never carries one.
 */
const gainsPosition = (over = {}) => ({
  id: `gains:${ARBITRUM}:7`,
  venue: 'gains',
  chainId: ARBITRUM,
  symbol: 'BTC/USD',
  direction: 'long',
  sizeUsd: 1000,
  collateralUsd: 100,
  entryPrice: 60_000,
  leverage: 10,
  unrealizedPnlUsd: null,
  venueRef: {
    venue: 'gains',
    chainId: ARBITRUM,
    tradeIndex: 7,
    pairIndex: 0,
    collateralIndex: 3,
    collateralToken: USDC,
    collateralDecimals: 6,
    collateralPrecision: '1000000',
  },
  ...over,
})

/** Hyperliquid has no venue ref at all this release — it stays read-only (FR-021). */
const hlPosition = () => ({
  id: 'hyperliquid:ETH:long',
  venue: 'hyperliquid',
  chainId: null,
  symbol: 'ETH/USD',
  direction: 'long',
  sizeUsd: 4500,
})

const SOURCES = { gains: { status: 'read', chains: [ARBITRUM] }, hyperliquid: { status: 'degraded' } }

/** `Position.Props` in full — all 14 static words, because a `Props[]` is tightly packed. */
const props = ({
  account = MEMBER,
  market,
  collateralToken = USDC,
  sizeInUsd,
  sizeInTokens = 10n ** 18n,
  collateralAmount = 100_000_000n,
  pendingImpactAmount = -12_345n, // int256, routinely negative
  isLong = true,
}) => [
  [account, market, collateralToken],
  [sizeInUsd, sizeInTokens, collateralAmount, pendingImpactAmount, 0n, 0n, 0n, 0n, 1_760_000_000n, 0n],
  [isLong],
]

/** Real Reader returndata, so the decode under test runs over real bytes and a real stride. */
const readerReturndata = (rows) => reader.encodeFunctionResult('getAccountPositions', [rows])

const TWO_POSITIONS = [
  props({ market: BTC_MARKET, sizeInUsd: 1_000n * 10n ** 30n, isLong: true }),
  props({ market: ETH_MARKET, sizeInUsd: 2_500n * 10n ** 30n, isLong: false }),
]

const gmxReader = (impl) => ({ getAccountPositions: impl })

const deps = (over = {}) => ({
  available: () => true,
  fetchPositions: vi.fn(async () => ({ positions: [gainsPosition(), hlPosition()], sources: SOURCES })),
  // GMX deps are stubbed by default so no test reaches a real endpoint; the shapes are the ones
  // `getReadProvider` / `new Contract(...)` produce.
  getProvider: () => ({}),
  makeContract: () => gmxReader(async () => readerReturndata([])),
  ...over,
})

const render = (over = {}, account = A) => renderHook(() => usePerpsPositions(account, { deps: deps(over) }))

const src = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/* --------------------------------------------------------------------------------------------- *
 * Phase 0 behaviour — unchanged
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsPositions — read-only behaviour', () => {
  it('loads positions and names unreadable venues', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions).toHaveLength(2)
    expect(result.current.unreadableVenues).toEqual(['hyperliquid'])
  })

  it('is idle with no fetch when disconnected', () => {
    const fetchPositions = vi.fn()
    const { result } = renderHook(() => usePerpsPositions(null, { deps: deps({ fetchPositions }) }))
    expect(result.current.status).toBe('idle')
    expect(fetchPositions).not.toHaveBeenCalled()
  })

  it('hard-resets synchronously on account change — no cross-account leak', async () => {
    let resolveB
    const fetchPositions = vi.fn((addr) => {
      if (addr === A) return Promise.resolve({ positions: [gainsPosition(), hlPosition()], sources: SOURCES })
      return new Promise((r) => {
        resolveB = () => r({ positions: [], sources: { gains: { status: 'read' } } })
      })
    })
    const { result, rerender } = renderHook(({ account }) => usePerpsPositions(account, { deps: deps({ fetchPositions }) }), {
      initialProps: { account: A },
    })
    await waitFor(() => expect(result.current.positions).toHaveLength(2))

    rerender({ account: B })
    // A's positions — and the venue handles pointed at them — must be gone the moment B is the
    // account, before B's read resolves.
    expect(result.current.positions).toEqual([])
    resolveB()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions).toEqual([])
  })

  it('reports unavailable (never fake-empty) when NO venue could be read', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => Promise.reject(new Error('down'))),
      makeContract: () => gmxReader(async () => Promise.reject(new Error('rpc down'))),
    })
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.positions).toEqual([])
    // No per-venue banner beside a global "could not be read": nothing was reached, so nothing can
    // honestly be called unaffected.
    expect(result.current.sources).toEqual({})
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Venue refs
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsPositions — venue refs', () => {
  it('carries the Gains ref through with the trade index BRANDED', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const gains = result.current.positions.find((p) => p.venue === 'gains')
    expect(isTradeIndex(gains.venueRef.tradeIndex)).toBe(true)
    expect(isPendingOrderIndex(gains.venueRef.tradeIndex)).toBe(false)
    expect(gains.venueRef.tradeIndex.value).toBe(7)
    expect(gains.venueRef.collateralToken).toBe(USDC)
    expect(gains.venueRef.collateralDecimals).toBe(6)
    // Exact, and a bigint: the calldata builders refuse a JS number for a token scale.
    expect(gains.venueRef.collateralPrecision).toBe(1_000_000n)
    // Display fields are untouched — the phase-0 UI reads them.
    expect(gains.symbol).toBe('BTC/USD')
    expect(gains.sizeUsd).toBe(1000)
  })

  it('renders a payload that carries no refs at all (an older gateway)', async () => {
    const bare = { ...gainsPosition() }
    delete bare.venueRef
    const { result } = render({
      fetchPositions: vi.fn(async () => ({ positions: [bare, hlPosition()], sources: SOURCES })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.positions).toHaveLength(2)
    // Null, not absent and not a guess: a sheet refuses to act, and the position still shows.
    expect(result.current.positions[0].venueRef).toBeNull()
    expect(result.current.positions[1].venueRef).toBeNull()
  })

  it('never turns a pending-order index, or an id, into a trade index', async () => {
    // THE INDEX TRAP: both of these fields exist and neither is a trade index. A close aimed at one
    // would act on a different object without reverting.
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        positions: [
          gainsPosition({
            id: `gains:${ARBITRUM}:4`,
            venueRef: { venue: 'gains', chainId: ARBITRUM, pendingOrderIndex: 4, tradeIndex: null },
          }),
        ],
        sources: SOURCES,
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions[0].venueRef.tradeIndex).toBeNull()
  })

  it('brands index 0 rather than dropping it — 0 is a real trade', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        positions: [gainsPosition({ venueRef: { ...gainsPosition().venueRef, tradeIndex: 0 } })],
        sources: SOURCES,
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const { tradeIndex } = result.current.positions[0].venueRef
    expect(isTradeIndex(tradeIndex)).toBe(true)
    expect(tradeIndex.value).toBe(0)
  })

  it('refuses an index that is not a uint32 instead of passing a raw number on', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        positions: [gainsPosition({ venueRef: { ...gainsPosition().venueRef, tradeIndex: -1 } })],
        sources: SOURCES,
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions[0].venueRef.tradeIndex).toBeNull()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * GMX — read here, because the gateway deliberately does not serve it
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsPositions — GMX positions from the Reader', () => {
  it('reads the account positions on Arbitrum through the app read provider', async () => {
    const getProvider = vi.fn(() => ({}))
    const getAccountPositions = vi.fn(async () => readerReturndata(TWO_POSITIONS))
    const makeContract = vi.fn(() => gmxReader(getAccountPositions))
    const { result } = render({ getProvider, makeContract })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(getProvider).toHaveBeenCalledWith(ARBITRUM)
    expect(makeContract).toHaveBeenCalledWith(GMX_ADDRESSES_BY_CHAIN[ARBITRUM].reader, GMX_READER_ABI, expect.anything())
    expect(getAccountPositions.mock.calls[0][0]).toBe(GMX_ADDRESSES_BY_CHAIN[ARBITRUM].dataStore)
    expect(getAccountPositions.mock.calls[0][1]).toBe(A)
  })

  it('decodes EVERY position in the response — the second is not stride-shifted garbage', async () => {
    const { result } = render({ makeContract: () => gmxReader(async () => readerReturndata(TWO_POSITIONS)) })
    await waitFor(() => expect(result.current.positions).toHaveLength(4))

    const gmx = result.current.positions.filter((p) => p.venue === 'gmx')
    expect(gmx).toHaveLength(2)
    expect(gmx[0].venueRef.market).toBe(BTC_MARKET)
    expect(gmx[0].direction).toBe('long')
    expect(gmx[0].sizeUsd).toBe(1000)
    // The one that a trimmed 14-word tuple would corrupt.
    expect(gmx[1].venueRef.market).toBe(ETH_MARKET)
    expect(gmx[1].venueRef.collateralToken).toBe(USDC)
    expect(gmx[1].direction).toBe('short')
    expect(gmx[1].sizeUsd).toBe(2500)
    // int256, negative, decoded as such — an unsigned read would show ~2^256 here.
    expect(gmx[1].raw.pendingImpactAmount).toBe(-12_345n)
    expect(result.current.sources.gmx).toMatchObject({ status: 'read', count: 2, truncated: false, partial: false })
  })

  it('carries the position key and its identity fields as the venue ref', async () => {
    const { result } = render({ makeContract: () => gmxReader(async () => readerReturndata([TWO_POSITIONS[0]])) })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const [gmx] = result.current.positions.filter((p) => p.venue === 'gmx')
    expect(gmx.venueRef).toMatchObject({
      venue: 'gmx',
      chainId: ARBITRUM,
      market: BTC_MARKET,
      collateralToken: USDC,
      isLong: true,
    })
    expect(gmx.venueRef.positionKey).toMatch(/^0x[0-9a-f]{64}$/i)
    // Identity only: no size or collateral, because a close is built from a fresh read.
    expect(gmx.venueRef.sizeInUsd).toBeUndefined()
    expect(gmx.venueRef.collateralAmount).toBeUndefined()
  })

  it("renders '—' rather than 0 for everything the Reader does not price", async () => {
    const { result } = render({ makeContract: () => gmxReader(async () => readerReturndata([TWO_POSITIONS[0]])) })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const [gmx] = result.current.positions.filter((p) => p.venue === 'gmx')
    expect(gmx.collateralUsd).toBeNull()
    expect(gmx.entryPrice).toBeNull()
    expect(gmx.leverage).toBeNull()
    expect(gmx.unrealizedPnlUsd).toBeNull()
    // Not a guessed pair name from a market address.
    expect(gmx.symbol).toBeNull()
  })

  it('treats an empty GMX response as proven absence, not as a failure', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gmx).toMatchObject({ status: 'read', count: 0 })
    expect(result.current.unreadableVenues).not.toContain('gmx')
  })

  it('says GMX is not deployed, rather than unreadable, off Arbitrum', async () => {
    const { result } = render({ addressesFor: () => null })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gmx.status).toBe('not-deployed')
    // Not an outage — it must not appear in the "could not be read" disclosure.
    expect(result.current.unreadableVenues).not.toContain('gmx')
  })

  it('discloses a response that filled the page instead of implying it is complete', async () => {
    const { result } = render({
      positionLimit: 2,
      makeContract: () => gmxReader(async () => readerReturndata(TWO_POSITIONS)),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gmx).toMatchObject({ limit: 2, count: 2, truncated: true })
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Per-venue isolation, in both directions
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsPositions — one venue never blanks another', () => {
  it('marks ONLY GMX unreadable when the Reader read fails', async () => {
    const { result } = render({
      makeContract: () =>
        gmxReader(async () => {
          throw new Error('missing revert data')
        }),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    // The gateway venues are untouched — same positions, same sources.
    expect(result.current.positions).toHaveLength(2)
    expect(result.current.sources.gains).toEqual(SOURCES.gains)
    expect(result.current.sources.gmx.status).toBe('unreadable')
    expect(result.current.sources.gmx.detail).toMatch(/could not be read/i)
    expect(result.current.sources.gmx.count).toBeNull()
    expect(result.current.unreadableVenues).toEqual(['hyperliquid', 'gmx'])
  })

  it('keeps GMX positions on screen when the gateway is down, and NAMES what went missing', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => Promise.reject(new Error('gateway 502'))),
      makeContract: () => gmxReader(async () => readerReturndata([TWO_POSITIONS[0]])),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.positions).toHaveLength(1)
    expect(result.current.positions[0].venue).toBe('gmx')
    // An omitted Gains position must never read as "you have no position there".
    expect(result.current.unreadableVenues).toEqual(['gains', 'hyperliquid'])
    expect(result.current.sources.gmx.status).toBe('read')
  })

  /* ---- a PARTIALLY read venue (spec 083, hyperliquid-decision.md §5.2 defect 1) ------------- *
   *
   * Hyperliquid is not one order book: the gateway reads the default perp dex plus each
   * validator-operated (HIP-3) one, and reports `partial: true` when a dex did not answer. The
   * positions it DID read still render — but an unqualified empty list beside a skipped dex is the
   * fabricated absence this whole fix exists to remove, so the venue is named.
   * ------------------------------------------------------------------------------------------ */

  it('names a partially-read venue, so its short list is never read as proven absence', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        positions: [gainsPosition(), hlPosition()],
        sources: {
          gains: { status: 'read', chains: [ARBITRUM] },
          hyperliquid: { status: 'read', chains: [], dexes: [''], unreadDexes: ['xyz'], partial: true },
        },
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    // The rows it did read are on screen — a partial read never withholds what was read.
    expect(result.current.positions.some((p) => p.venue === 'hyperliquid')).toBe(true)
    expect(result.current.unreadableVenues).toContain('hyperliquid')
  })

  it('says nothing when the venue read every dex — a complete read has nothing to qualify', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        positions: [gainsPosition(), hlPosition()],
        sources: {
          gains: { status: 'read', chains: [ARBITRUM] },
          hyperliquid: { status: 'read', chains: [], dexes: ['', 'xyz'], unreadDexes: [], partial: false },
        },
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.unreadableVenues).toEqual([])
  })

  it('survives a dependency that throws synchronously', async () => {
    const { result } = render({
      getProvider: () => {
        throw new Error('endpoint resolution blew up')
      },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.positions).toHaveLength(2)
    expect(result.current.sources.gmx.status).toBe('unreadable')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Nothing here may become a gate
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsPositions — the position list is never gated', () => {
  const source = () => src('../../hooks/usePerpsPositions.js')

  it('does not import screening, the attestation, or the management kill switch', () => {
    // This list is what a member closes a position FROM. A restriction wired in here would hide the
    // position, and a position a member cannot see is one they cannot exit.
    expect(source()).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
    expect(source()).not.toMatch(/hasAttested|attestationState|PERPS_ATTESTATION/)
    expect(source()).not.toMatch(/perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/)
    expect(source()).not.toMatch(/useAddressScreening|screenAddress|sanction/i)
  })

  it('does not consult whether the venue would accept an OPEN', () => {
    expect(source()).not.toMatch(/\bcanOpen\b|openBlockedNote|perpsManageEnabled/)
  })

  it('builds no read endpoint of its own — the member owns their RPC (spec 069)', () => {
    expect(source()).not.toMatch(/NETWORKS\[|rpcUrl/)
    expect(source()).toMatch(/getReadProvider/)
  })
})
