/**
 * Test harness for the API Access package (spec 095).
 *
 * The package reaches every privileged capability through `useMiniAppHost()`, which throws outside a
 * mounted workspace. These are UNIT tests of the package's own behaviour, so they mount it against a
 * stub host rather than the real provider — the real provider's contract (rail selection, typed
 * refusals, the manifest contract allowlist, the store namespace) is covered where it lives, in
 * `frontend/src/test/miniapps/hostContext.test.jsx`. Duplicating it here would test the host twice
 * and the package not at all.
 *
 * The stub is FAITHFUL where the host is faithful and STRICTER where this package's manifest is
 * narrower, because a stub more permissive than what a curator approved lets the package ship code
 * that would be rejected at review:
 *   - `contracts()` throws for EVERY name. This package declares `contracts: []`, so there is no
 *     name it may resolve, and the host throws for an undeclared one.
 *   - `wallet.submit()` throws. The manifest declares no `wallet:submit` permission — the host does
 *     not enforce that at runtime, which is exactly why the stub does: a test that quietly started
 *     depending on `submit` would otherwise pass here and fail a curator.
 *   - `store` is a real in-memory namespace with the host's never-throws contract, including `set`
 *     reporting `false` rather than raising.
 *   - `navigate()` applies the host's own bounds, so a malformed deep link fails in a test rather
 *     than at a member.
 */
import { vi } from 'vitest'

/** The manifest's `contracts` allowlist for this package: empty, on purpose. */
const DECLARED = []

/**
 * Chains this stub knows about. This package declares no `network` permission and reads neither of
 * these — they are present because the real host object always carries all ten keys, and a stub
 * missing one would hide a mistake rather than surface it.
 */
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
    subgraphUrl: null,
  },
}

class StubHostError extends Error {
  constructor(reason, message, userMessage) {
    super(message)
    this.name = 'MiniAppHostError'
    this.reason = reason
    this.userMessage = userMessage ?? message
  }
}

const ACCOUNT = '0xAbC0000000000000000000000000000000000028'

/** An in-memory stand-in for the namespaced host store, with the same never-throws contract. */
export function makeStore(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get: vi.fn((key, fallback = null) => (data.has(key) ? data.get(key) : fallback)),
    // `false` means "not written" — quota, an unserialisable value, a no-op. Never a throw.
    set: vi.fn((key, value) => {
      data.set(key, value)
      return true
    }),
    subscribe: vi.fn(() => () => {}),
    /** Test-only view of what actually landed. Not part of the host contract. */
    __data: data,
  }
}

/** Mirrors `hostContext.jsx`'s navigate bounds, in the same order. */
function navigateGuard(to) {
  if (typeof to !== 'string' || to.length === 0 || to.length > 512) {
    throw new StubHostError('bad_navigation', 'navigate: not a bounded path', 'That link is not valid.')
  }
  if (/[\t\n\r]/.test(to) || to.includes('\\')) {
    throw new StubHostError('bad_navigation', 'navigate: stripped characters', 'That link is not valid.')
  }
  if (!to.startsWith('/') || to.startsWith('//')) {
    throw new StubHostError('bad_navigation', 'navigate: not an in-app path', 'That link is not valid.')
  }
  return to
}

/**
 * Build a stub host.
 *
 * @param {object} [over] - per-test overrides, merged one level deep so a test can replace just
 *   `store` or just `toast` without restating the contract.
 */
export function makeHost(over = {}) {
  const chainId = over.chainId ?? 137
  const store = over.store ?? makeStore(over.storeData)

  return Object.freeze({
    appId: 'api-access',
    wallet: Object.freeze({
      address: ACCOUNT,
      connectedAddress: ACCOUNT,
      chainId,
      isConnected: true,
      requestConnect: vi.fn(),
      switchChain: vi.fn(),
      submit: vi.fn(async () => {
        throw new StubHostError(
          'undeclared_permission',
          'api-access declares no "wallet:submit" permission',
          'This app cannot send transactions.',
        )
      }),
      ...(over.wallet || {}),
    }),
    readProvider: over.readProvider ?? (() => ({ call: vi.fn(async () => '0x') })),
    contracts: over.contracts ?? ((name) => {
      if (!DECLARED.includes(name)) {
        throw new StubHostError('undeclared_contract', `"${name}" is not declared`, 'Not approved to use that contract.')
      }
      return null
    }),
    network: over.network ?? ((forChain = chainId) => NETWORKS[forChain] ?? null),
    networks: over.networks ?? (() => Object.freeze([63, 137])),
    store,
    audit: over.audit ?? { log: vi.fn() },
    toast: over.toast ?? { show: vi.fn() },
    navigate: over.navigate ?? vi.fn(navigateGuard),
  })
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
