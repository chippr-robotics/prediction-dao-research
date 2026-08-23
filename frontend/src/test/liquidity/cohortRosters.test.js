/**
 * Issue #1265 — spec 067's rosters are bounded by the build's COHORT.
 *
 * Supply and Bridge enumerated `listSupportedChainIds()`, so a testnet-cohort build
 * opened connections to the five mainnet `LiquidityRouter` proxies, listed their curated
 * pools next to anything local, and printed the mainnet roster in its own availability
 * copy. Constitution III forbids exactly that: a read never crosses the testnet/mainnet
 * boundary, and a member cannot supply a pool the build they are in must not touch.
 *
 * This test build runs `VITE_NETWORK_ID=63` (Mordor), so it IS a testnet build — the
 * useful side of the boundary to assert from, in the same spirit as
 * `test/lib/chains/membershipChain.test.js`. Two kinds of assertion, because each catches
 * what the other cannot:
 *
 *   1. BEHAVIOUR — every roster below names only chains this build may read, and none of
 *      them names a mainnet here. What a member is told, and what is read.
 *   2. SOURCE — the enumeration itself. The behavioural half of this file would keep
 *      passing on a mainnet build with `listSupportedChainIds()` back in place, and
 *      `SupplyView`'s catalog is a hook that needs a wallet and five RPCs to observe.
 *      The regression this file exists to prevent arrives as one identifier.
 */
import { describe, it, expect } from 'vitest'
import supplyViewSource from '../../components/earn/SupplyView.jsx?raw'
import liquidityCopySource from '../../lib/liquidity/liquidityCopy.js?raw'
import acrossLpSource from '../../lib/liquidity/acrossLpPositions.js?raw'
import bridgeCopySource from '../../lib/bridge/bridgeCopy.js?raw'
import {
  NETWORKS,
  MAINNET_CHAIN_ID,
  cohortChainIds,
  isInCohort,
  listSupportedChainIds,
} from '../../config/networks'
import { getLiquidityRouterAddress } from '../../lib/liquidity/liquidityRouter'
import {
  bridgeLiquidityNetworks as bridgeLiquidityCopyNetworks,
  tradingLiquidityNetworks,
} from '../../lib/liquidity/liquidityCopy'
import { bridgeLiquiditySupport, bridgeLiquidityNetworks } from '../../lib/liquidity/acrossLpPositions'
import {
  bridgeNetworks,
  bridgeUnavailableCopy,
  noBridgeDestinationCopy,
} from '../../lib/bridge/bridgeCopy'
import {
  NO_POOLS_COPY,
  liquidityAvailabilityCopy,
  liquidityUnavailableCopy,
} from '../../lib/liquidity/liquidityCopy'

/** Every roster spec 067 derives, by the name the surface knows it as. */
const ROSTERS = [
  ['Supply — trading pools (liquidityCopy)', () => tradingLiquidityNetworks()],
  ['Supply — bridge pools (liquidityCopy)', () => bridgeLiquidityCopyNetworks()],
  ['Supply — bridge pools (acrossLpPositions)', () => bridgeLiquidityNetworks()],
  ['Bridge — configured networks (bridgeCopy)', () => bridgeNetworks()],
]

/** The five mainnets spec 067 deployed to. Named, so a failure says which leaked. */
const SPEC_067_MAINNETS = [1, 10, 137, 8453, 42161]

describe('spec 067 rosters are cohort-bounded (#1265, constitution III)', () => {
  it('this test build is a testnet build, which is what makes the rest meaningful', () => {
    expect(cohortChainIds().length).toBeGreaterThan(0)
    for (const id of cohortChainIds()) expect(NETWORKS[id].isTestnet).toBe(true)
    expect(isInCohort(MAINNET_CHAIN_ID)).toBe(false)
  })

  it.each(ROSTERS)('%s names only chains this build may read', (_label, roster) => {
    for (const net of roster()) {
      expect(isInCohort(net.chainId)).toBe(true)
      expect(NETWORKS[net.chainId].isTestnet).toBe(true)
    }
  })

  it.each(ROSTERS)('%s names no spec-067 mainnet in a testnet build', (_label, roster) => {
    const ids = roster().map((net) => net.chainId)
    for (const mainnet of SPEC_067_MAINNETS) expect(ids).not.toContain(mainnet)
  })

  it('the Supply catalog would open connections to no mainnet router', () => {
    // The chain roster `useLiquidityCatalog` builds, evaluated here: the same
    // enumeration and the same filters, without a wallet or a React tree.
    const chainIds = cohortChainIds().filter(
      (id) => Number.isFinite(id) && Boolean(getLiquidityRouterAddress(id)),
    )
    for (const id of chainIds) expect(isInCohort(id)).toBe(true)
    for (const mainnet of SPEC_067_MAINNETS) expect(chainIds).not.toContain(mainnet)

    // …and the routers ARE deployed on those mainnets, so the assertion above is
    // about the cohort bound rather than about nothing being deployed anywhere.
    const deployed = listSupportedChainIds().filter((id) => Boolean(getLiquidityRouterAddress(id)))
    expect(deployed.some((id) => SPEC_067_MAINNETS.includes(id))).toBe(true)
  })
})

// ── The SENTENCES, because a roster is only ever met through one ────────────────────

/**
 * Every member-facing sentence spec 067 builds out of a roster.
 *
 * The suites that own these files assert the shape of each sentence ("names a network, or
 * says there is none to name"), which stays true whichever roster is behind it — so none of
 * them would catch the roster naming Polygon in a testnet build. This does: whatever these
 * sentences say, they may not NAME a network outside the cohort. Falsifiable on either side
 * of the boundary, which is what the shape assertions cannot be.
 *
 * Each is asked about an in-cohort chain spec 067 has shipped NOTHING on, so every helper
 * returns its "not here — here is where it is" sentence rather than `null`. The chain is
 * chosen rather than fixed, so this file states its premise instead of encoding one build's
 * chain list.
 */
const IN_COHORT_CHAIN = cohortChainIds().find(
  (id) =>
    !NETWORKS[id].capabilities?.bridge &&
    !NETWORKS[id].bridge?.hubPool &&
    !getLiquidityRouterAddress(id),
)

const SENTENCES = [
  ['liquidityAvailabilityCopy()', () => liquidityAvailabilityCopy()],
  ['NO_POOLS_COPY', () => NO_POOLS_COPY],
  ['liquidityUnavailableCopy(<in-cohort>)', () => liquidityUnavailableCopy(IN_COHORT_CHAIN)],
  ["liquidityUnavailableCopy('bitcoin')", () => liquidityUnavailableCopy('bitcoin')],
  ['bridgeUnavailableCopy(<in-cohort>)', () => bridgeUnavailableCopy(IN_COHORT_CHAIN)],
  ["noBridgeDestinationCopy('USDC')", () => noBridgeDestinationCopy('USDC')],
  [
    'bridgeLiquiditySupport(<in-cohort>).reason',
    () => bridgeLiquiditySupport(IN_COHORT_CHAIN).reason,
  ],
]

describe('spec 067 availability copy names no out-of-cohort network (#1265)', () => {
  // Every sentence above is asked about an IN-COHORT chain (or about none), so the only
  // network it has any business naming is one this build can reach. Asking about chain 137
  // would be a different question — naming Polygon back is then the honest answer.

  /**
   * The copy with every in-cohort network name blanked, longest first.
   *
   * Necessary, not decorative: `Ethereum Classic Mordor` CONTAINS `Ethereum`, and
   * `Polygon Amoy` contains `Polygon`, so a bare substring test would fail on copy that
   * correctly names only the testnet. Blanking the legitimate names first leaves any
   * genuine mainnet mention standing alone.
   */
  const inCohortNames = cohortChainIds()
    .map((id) => NETWORKS[id].name)
    .sort((a, b) => b.length - a.length)
  const scrub = (copy) => inCohortNames.reduce((s, name) => s.split(name).join('·'), copy)

  const outOfCohort = listSupportedChainIds()
    .filter((id) => !isInCohort(id))
    .map((id) => NETWORKS[id].name)

  it('there ARE such networks here, so the assertions below are about something', () => {
    expect(IN_COHORT_CHAIN).toBeDefined()
    expect(outOfCohort.length).toBeGreaterThan(0)
    expect(outOfCohort).toContain(NETWORKS[MAINNET_CHAIN_ID].name)
    // …and the scrubber keeps a real mainnet mention visible rather than eating it.
    expect(scrub(`Supported on ${NETWORKS[MAINNET_CHAIN_ID].name}.`)).toContain(
      NETWORKS[MAINNET_CHAIN_ID].name,
    )
  })

  it.each(SENTENCES)('%s', (_label, sentence) => {
    const copy = sentence()
    expect(typeof copy).toBe('string')
    expect(copy.length).toBeGreaterThan(0)
    const scrubbed = scrub(copy)
    for (const name of outOfCohort) expect(scrubbed).not.toContain(name)
  })
})

// ── The enumeration itself, because the assertions above cannot see it ──────────────

/**
 * Source with its comments removed.
 *
 * Every one of these files EXPLAINS the rule in prose, naming the function it must not
 * call — which is exactly what the rule needs to survive. So the check reads code only:
 * a comment mentioning `listSupportedChainIds` is the documentation working, a call to it
 * is the regression.
 */
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

describe('the enumeration never goes back to listSupportedChainIds (#1265)', () => {
  const SOURCES = [
    ['components/earn/SupplyView.jsx', supplyViewSource],
    ['lib/liquidity/liquidityCopy.js', liquidityCopySource],
    ['lib/liquidity/acrossLpPositions.js', acrossLpSource],
    ['lib/bridge/bridgeCopy.js', bridgeCopySource],
  ]

  it.each(SOURCES)('%s enumerates the cohort', (_name, source) => {
    expect(codeOf(source)).toMatch(/cohortChainIds\(\)/)
  })

  it.each(SOURCES)('%s never calls listSupportedChainIds', (_name, source) => {
    expect(codeOf(source)).not.toMatch(/listSupportedChainIds/)
  })

  it('(control) the comment stripper leaves real code alone', () => {
    // Without this, the assertion above passes for the wrong reason if `codeOf`
    // ever over-matches and empties the file.
    expect(codeOf('const a = 1 // listSupportedChainIds()\n')).not.toMatch(/listSupportedChainIds/)
    expect(codeOf('/* listSupportedChainIds() */\nlistSupportedChainIds()\n')).toMatch(
      /listSupportedChainIds/,
    )
    for (const [, source] of SOURCES) expect(codeOf(source).length).toBeGreaterThan(200)
  })
})
