/**
 * The subgraph must index the contracts the app actually reads.
 *
 * WHY THIS EXISTS. `subgraph/networks.json` pointed the Polygon build at
 * WagerRegistry `0x5023765809…` — the abandoned pre-UUPS registry — while the app read
 * `0xE878b628…`. Verified by `eth_call`: the indexed contract has `nextWagerId() == 1` (no wager
 * ever created); the one members use has `3`. So the deployed Polygon subgraph answered every
 * wager query with an empty list, HTTP 200, no GraphQL errors, `hasIndexingErrors: false`, four
 * minutes behind the chain head — and the Account dashboard told a member with two live wagers
 * "No activity yet. Create or accept your first wager to start building your stats."
 *
 * THAT FAILURE IS INVISIBLE TO EVERY OTHER DEFENCE. A well-formed `{"data":{"wagers":[]}}` is
 * byte-identical to a truthful zero. No client error handling, no three-state availability model,
 * no retry and no health check can tell "nothing happened" from "I watched the wrong contract" —
 * the only place the two can be distinguished is here, by comparing the address the indexer was
 * given against the address the app trusts. This assertion would have failed the day the live
 * registry was deployed.
 *
 * Placeholder addresses get the same treatment, and for the same reason. A sentinel like
 * `0x…0034` is harmless only while the data source fails to build; the moment the build succeeds
 * it becomes a permanently empty, error-free index — the identical failure, reshipped.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../config/contracts'

const NETWORKS_JSON = path.resolve(__dirname, '../../../subgraph/networks.json')
const config = JSON.parse(fs.readFileSync(NETWORKS_JSON, 'utf8'))

/** The Graph's network names, mapped to the chain ids the app knows. */
const CHAIN_BY_GRAPH_NETWORK = {
  matic: 137,
  mordor: 63,
  'polygon-amoy': 80002,
}

/**
 * Subgraph data source -> the `contracts.js` key naming the same contract.
 *
 * A data source with no entry here is skipped rather than silently passed, and the last test
 * fails if one appears — an unmapped source is exactly where the next mismatch would hide.
 */
const CONTRACT_KEY_BY_DATA_SOURCE = {
  WagerRegistry: 'wagerRegistry',
  WagerPoolFactory: 'wagerPoolFactory',
  MembershipVoucher: 'membershipVoucher',
  MembershipManager: 'membershipManager',
  TokenFactory: 'tokenFactory',
  ChainlinkDataFeedOracleAdapter: 'chainlinkDataFeedAdapter',
  ChainlinkFunctionsOracleAdapter: 'chainlinkFunctionsAdapter',
  UMAOptimisticOracleV3Adapter: 'umaAdapter',
}

const entries = Object.entries(config).flatMap(([graphNetwork, sources]) =>
  Object.entries(sources).map(([dataSource, source]) => ({
    graphNetwork,
    chainId: CHAIN_BY_GRAPH_NETWORK[graphNetwork],
    dataSource,
    ...source,
  })),
)

describe('subgraph/networks.json describes real, current deployments', () => {
  it('covers every network in the file with a known chain id', () => {
    for (const graphNetwork of Object.keys(config)) {
      expect(CHAIN_BY_GRAPH_NETWORK[graphNetwork], `unmapped graph network "${graphNetwork}"`).toBeDefined()
    }
  })

  it('names only data sources this test knows how to check', () => {
    for (const { dataSource } of entries) {
      expect(
        CONTRACT_KEY_BY_DATA_SOURCE[dataSource],
        `data source "${dataSource}" is unmapped, so nothing verifies the address it indexes`,
      ).toBeDefined()
    }
  })

  it('carries no placeholder or zero addresses', () => {
    for (const { graphNetwork, dataSource, address } of entries) {
      expect(address, `${graphNetwork}.${dataSource}`).toMatch(/^0x[0-9a-fA-F]{40}$/)
      // A sentinel indexes nothing forever, and does it with a 200 and no errors.
      expect(
        /^0x0{30,}/.test(address),
        `${graphNetwork}.${dataSource} is a placeholder address — it would index nothing, silently`,
      ).toBe(false)
    }
  })

  it.each(entries)(
    'indexes the same $dataSource the app reads on $graphNetwork',
    ({ chainId, dataSource, address }) => {
      const expected = getContractAddressForChain(CONTRACT_KEY_BY_DATA_SOURCE[dataSource], chainId)
      // If the app has no address for it, indexing SOMETHING is worse than indexing nothing:
      // whatever is indexed cannot be the contract members interact with.
      expect(expected, `app has no ${dataSource} on chain ${chainId}, but the subgraph indexes one`).toBeTruthy()
      expect(address.toLowerCase()).toBe(String(expected).toLowerCase())
    },
  )

  it.each(entries.filter((e) => getDeploymentBlockForChain(CONTRACT_KEY_BY_DATA_SOURCE[e.dataSource], e.chainId)))(
    'starts $dataSource on $graphNetwork at its recorded deployment block',
    ({ chainId, dataSource, startBlock }) => {
      const recorded = getDeploymentBlockForChain(CONTRACT_KEY_BY_DATA_SOURCE[dataSource], chainId)
      // A startBlock AFTER deployment silently drops early history; before it wastes indexing
      // time. Neither surfaces as an error — the index is just quietly incomplete.
      expect(startBlock).toBe(recorded)
    },
  )
})
