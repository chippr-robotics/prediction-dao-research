/**
 * Test harness for the Token Mint package (spec 073 T026).
 *
 * The package reaches every privileged capability through `useMiniAppHost()`, which throws outside
 * a mounted workspace. These tests are UNIT tests of the package's own behaviour, so they mount it
 * against a stub host rather than the real provider — the real provider's contract (rail selection,
 * typed refusals, the manifest contract allowlist, the store namespace) is covered where it lives,
 * in `frontend/src/test/miniapps/hostContext.test.jsx`. Duplicating it here would test the host
 * twice and the package not at all.
 *
 * The stub is deliberately FAITHFUL to the frozen contract, because a stub that is more permissive
 * than the host lets a package ship code the host will refuse:
 *   - `contracts()` THROWS for a name outside the manifest allowlist, exactly as the host does, so
 *     a test cannot accidentally prove that an undeclared lookup works.
 *   - `network()` returns null for an unknown chain rather than a default network.
 *   - `submit()` resolves at BROADCAST and hands back a `wait()` — code that reports success
 *     without awaiting it fails here the way it would fail a member.
 */
import { vi } from 'vitest'

/** Chains this stub knows about, mirroring the shape `host.network()` returns. */
const NETWORKS = {
  137: {
    chainId: 137,
    name: 'Polygon',
    isTestnet: false,
    nativeCurrency: { symbol: 'POL', decimals: 18 },
    explorer: { name: 'Polygonscan', baseUrl: 'https://polygonscan.com' },
    subgraphUrl: 'https://example.invalid/subgraph',
  },
  63: {
    chainId: 63,
    name: 'Mordor',
    isTestnet: true,
    nativeCurrency: { symbol: 'METC', decimals: 18 },
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    // Mordor has no subgraph and is not getting one — the case every indexed
    // view in this package has to degrade honestly for.
    subgraphUrl: null,
  },
}

/** The manifest's `contracts` allowlist for this package. */
const DECLARED = ['tokenFactory']

const DEPLOYMENTS = {
  tokenFactory: {
    137: '0x5806e76cA3c838524E7cF43db7625bdFBA0783a0',
    63: '0x5bdf74Ce98D41bf35192c20B25ACd561C75CFe62',
  },
}

/**
 * Build a stub host.
 *
 * @param {object} [over] - per-test overrides, merged one level deep so a test can replace just
 *   `wallet.address` or just `submit` without restating the contract.
 */
export function makeHost(over = {}) {
  const chainId = over.chainId ?? 137
  const receipt = over.receipt ?? { status: 1, logs: [] }

  const host = {
    appId: 'token-mint',
    wallet: {
      address: '0xAbC0000000000000000000000000000000000028',
      connectedAddress: '0xAbC0000000000000000000000000000000000028',
      chainId,
      isConnected: true,
      requestConnect: vi.fn(),
      submit: vi.fn(async () => {
        const result = { kind: 'sent', txHash: '0xdead', safeTxHash: null }
        Object.defineProperty(result, 'wait', { enumerable: false, value: async () => receipt })
        return Object.freeze(result)
      }),
      ...(over.wallet || {}),
    },
    readProvider: over.readProvider ?? (() => ({ call: vi.fn(async () => '0x') })),
    contracts: over.contracts ?? ((name, forChain = chainId) => {
      if (!DECLARED.includes(name)) {
        throw new Error(`miniapp host: "${name}" is not declared in this package's manifest contracts`)
      }
      return DEPLOYMENTS[name]?.[forChain] ?? null
    }),
    network: over.network ?? ((forChain = chainId) => NETWORKS[forChain] ?? null),
    store: over.store ?? { get: vi.fn(() => null), set: vi.fn(() => true), subscribe: vi.fn(() => () => {}) },
    audit: over.audit ?? { log: vi.fn() },
    toast: over.toast ?? { show: vi.fn() },
    navigate: over.navigate ?? vi.fn(),
  }
  return Object.freeze(host)
}

/**
 * The mutable host every test in a file shares. `vi.mock` factories are hoisted above module
 * initialisation, so they cannot close over a `const` declared here — they read this object's
 * `current` instead, which `beforeEach` re-points.
 */
export const hostRef = { current: makeHost() }

/** Reset to a clean stub. Call from `beforeEach`. */
export function resetHost(over) {
  hostRef.current = makeHost(over)
  return hostRef.current
}
