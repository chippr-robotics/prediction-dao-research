/**
 * Bitcoin network registry (spec 061) — the platform's first NON-EVM network
 * config, implementing specs/061-bitcoin-transactions/contracts/network-registry.md.
 *
 * This registry is PARALLEL to the numeric-chainId `NETWORKS` map in
 * networks.js and is never merged into it: Bitcoin has no EVM chainId, no
 * wagmi switchChain affordance, no contracts, and no subgraph. Ids here are
 * strings ('bitcoin', 'bitcoin-testnet') and MUST never flow into
 * `getContractAddressForChain`, wagmi provider construction, or any consumer
 * typed on numeric chainIds — guard every shared boundary with
 * `isBitcoinNetworkId`.
 *
 * Capability honesty (FR-020): `capabilities` below is the single source of
 * truth for what Bitcoin supports. Everything false hides/disables its
 * surface exactly like an EVM capability that is off. `collect: 'stamps-only'`
 * means the collectibles surface shows the Bitcoin Stamps section but no
 * OpenSea integration.
 */

const explorer = (baseUrl) => ({
  name: 'mempool.space',
  baseUrl,
  tx: (txid) => `${baseUrl}/tx/${txid}`,
  address: (addr) => `${baseUrl}/address/${addr}`,
})

const CAPABILITIES = Object.freeze({
  portfolio: true,
  send: true,
  receive: true,
  wagers: false,
  pools: false,
  membership: false,
  gasless: false,
  swap: false,
  earn: false,
  predict: false,
  collect: 'stamps-only',
})

export const BITCOIN_NETWORKS = Object.freeze({
  bitcoin: Object.freeze({
    id: 'bitcoin',
    kind: 'bitcoin',
    name: 'Bitcoin',
    isTestnet: false,
    // Path segment for the relay-gateway proxy: /v1/bitcoin/:network/*
    gatewaySegment: 'mainnet',
    // bech32/bech32m human-readable part — drives address labeling and
    // wrong-network rejection (tb1… is never a valid mainnet destination).
    addressHrp: 'bc',
    // BIP44 coin type (hardened) — see contracts/key-derivation-btc.md.
    coinType: 0,
    explorer: explorer('https://mempool.space'),
    capabilities: CAPABILITIES,
  }),
  'bitcoin-testnet': Object.freeze({
    id: 'bitcoin-testnet',
    kind: 'bitcoin',
    name: 'Bitcoin Testnet4',
    isTestnet: true,
    gatewaySegment: 'testnet',
    addressHrp: 'tb',
    coinType: 1,
    explorer: explorer('https://mempool.space/testnet4'),
    capabilities: CAPABILITIES,
  }),
})

/** [testnetId, mainnetId] — mirrors TESTNET_MAINNET_PAIR semantics (FR-021). */
export const BITCOIN_TESTNET_MAINNET_PAIR = Object.freeze(['bitcoin-testnet', 'bitcoin'])

/** True only for the string ids of this registry — the boundary type guard. */
export function isBitcoinNetworkId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BITCOIN_NETWORKS, id)
}

/** Lookup or null — callers soft-fail (hide surfaces) on unknown ids. */
export function getBitcoinNetwork(id) {
  return isBitcoinNetworkId(id) ? BITCOIN_NETWORKS[id] : null
}

/**
 * The Bitcoin network for the app's current testnet/mainnet mode.
 * `testnetMode` follows the existing global toggle (80002 ↔ 137 on EVM).
 */
export function getActiveBitcoinNetworkId(testnetMode) {
  const [testnetId, mainnetId] = BITCOIN_TESTNET_MAINNET_PAIR
  return testnetMode ? testnetId : mainnetId
}
