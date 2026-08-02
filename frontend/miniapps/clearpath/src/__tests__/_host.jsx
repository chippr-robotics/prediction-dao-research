/**
 * Test harness for the ClearPath package (spec 073 T028).
 *
 * Same contract as Token Mint's stub and for the same reason: a stub more permissive than the real
 * host lets the package ship code the host refuses. So `contracts()` throws for a name outside the
 * manifest allowlist, `network()` returns null for a chain it does not know, `submit()` resolves at
 * BROADCAST behind a `wait()`, and `switchChain()` actually moves the stub wallet.
 *
 * ClearPath is NETWORK-AGNOSTIC, so this stub knows several chains and `networks()` returns them —
 * the app filters that roster itself into the chains it can operate on.
 */
import { vi } from 'vitest'

/** Declared in vite.config.js; anything else must throw, exactly as the host does. */
const DECLARED = ['externalDAORegistry', 'paymentToken', 'sanctionsGuard']

const DEPLOYMENTS = {
  externalDAORegistry: { 63: '0x00000000000000000000000000000000000000e1' },
  paymentToken: { 63: '0x00000000000000000000000000000000000000cc' },
  sanctionsGuard: { 63: '0x00000000000000000000000000000000000000ff' },
}

const NETWORKS = {
  63: { chainId: 63, name: 'Mordor', isTestnet: true, nativeCurrency: { symbol: 'METC', decimals: 18 }, explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' }, subgraphUrl: null },
  137: { chainId: 137, name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'POL', decimals: 18 }, explorer: { name: 'Polygonscan', baseUrl: 'https://polygonscan.com' }, subgraphUrl: 'https://example.invalid/sg' },
  1: { chainId: 1, name: 'Ethereum', isTestnet: false, nativeCurrency: { symbol: 'ETH', decimals: 18 }, explorer: { name: 'Etherscan', baseUrl: 'https://etherscan.io' }, subgraphUrl: null },
}

class StubHostError extends Error {
  constructor(reason, message, userMessage) {
    super(message)
    this.name = 'MiniAppHostError'
    this.reason = reason
    this.userMessage = userMessage ?? message
  }
}

const ACCOUNT = '0x00000000000000000000000000000000000000a1'

/** An in-memory stand-in for the namespaced host store, with the same never-throws contract. */
function makeStore(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get: (key, fallback = null) => (data.has(key) ? data.get(key) : fallback),
    set: (key, value) => { data.set(key, value); return true },
    subscribe: () => () => {},
  }
}

export function makeHost(over = {}) {
  const chainId = over.chainId ?? 63
  const receipt = over.receipt ?? { status: 1, logs: [] }
  const store = over.store ?? makeStore(over.storeData)

  const wallet = {
    address: ACCOUNT,
    connectedAddress: ACCOUNT,
    chainId,
    isConnected: true,
    requestConnect: vi.fn(),
    switchChain: vi.fn(async (target) => {
      if (over.switchRefused) {
        throw new StubHostError('switch_refused', 'declined', `Switch your wallet to network ${target}.`)
      }
      wallet.chainId = Number(target)
    }),
    submit: vi.fn(async (payload) => {
      // The host screens the acting account and refuses before any rail is touched.
      if (over.sanctioned) {
        throw new StubHostError(
          'sanctioned_account',
          'acting account restricted',
          'This wallet is restricted by sanctions screening and cannot send transactions.',
        )
      }
      if (payload?.chainId != null && Number(payload.chainId) !== Number(wallet.chainId)) {
        throw new StubHostError('wrong_chain', 'wrong chain', `Switch your wallet to network ${payload.chainId}.`)
      }
      const kind = over.proposed ? 'proposed' : 'sent'
      const result = {
        kind,
        txHash: kind === 'sent' ? '0xdead' : null,
        safeTxHash: kind === 'proposed' ? '0xsafe' : null,
      }
      Object.defineProperty(result, 'wait', { enumerable: false, value: async () => receipt })
      return Object.freeze(result)
    }),
    ...(over.wallet || {}),
  }

  return Object.freeze({
    appId: 'clearpath',
    wallet: Object.freeze(wallet),
    readProvider: over.readProvider ?? (() => ({ call: vi.fn(async () => '0x'), getBlockNumber: vi.fn(async () => 1) })),
    contracts: over.contracts ?? ((name, forChain = chainId) => {
      if (!DECLARED.includes(name)) {
        throw new StubHostError('undeclared_contract', `"${name}" is not declared`, 'Not approved to use that contract.')
      }
      return DEPLOYMENTS[name]?.[forChain] ?? null
    }),
    network: over.network ?? ((forChain = chainId) => NETWORKS[forChain] ?? null),
    networks: over.networks ?? (() => Object.freeze([63])),
    store,
    audit: over.audit ?? { log: vi.fn() },
    toast: over.toast ?? { show: vi.fn() },
    navigate: over.navigate ?? vi.fn(),
  })
}

/**
 * The mutable host every test in a file shares. `vi.mock` factories are hoisted above module
 * initialisation, so they read `hostRef.current` rather than closing over a const.
 */
export const hostRef = { current: makeHost() }

export function resetHost(over) {
  hostRef.current = makeHost(over)
  return hostRef.current
}
