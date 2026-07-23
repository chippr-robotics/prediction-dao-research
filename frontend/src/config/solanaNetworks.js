/**
 * Solana network registry (spec 063) — a PARALLEL, non-EVM network config, like
 * bitcoinNetworks.js. Ids are strings ('solana', 'solana-devnet') and MUST never
 * flow into getContractAddressForChain, wagmi, or subgraph code (all numeric
 * chainId-typed). Guard shared boundaries with isSolanaNetworkId.
 *
 * The RPC endpoint resolves to the optional relay-gateway proxy when configured
 * (VITE_RELAYER_URL + `/v1/solana/rpc`), else the public cluster endpoint —
 * never-stranded, mirroring the spec-061 Bitcoin gateway posture.
 */

export const SOLANA_NETWORKS = Object.freeze({
  solana: Object.freeze({
    id: 'solana',
    kind: 'solana',
    name: 'Solana',
    isTestnet: false,
    coinType: 501,
    publicRpc: 'https://api.mainnet-beta.solana.com',
    gatewaySegment: 'solana',
    explorer: { name: 'Solscan', address: (a) => `https://solscan.io/account/${a}`, tx: (s) => `https://solscan.io/tx/${s}` },
  }),
  'solana-devnet': Object.freeze({
    id: 'solana-devnet',
    kind: 'solana',
    name: 'Solana Devnet',
    isTestnet: true,
    coinType: 501,
    publicRpc: 'https://api.devnet.solana.com',
    gatewaySegment: 'solana-devnet',
    explorer: { name: 'Solscan', address: (a) => `https://solscan.io/account/${a}?cluster=devnet`, tx: (s) => `https://solscan.io/tx/${s}?cluster=devnet` },
  }),
})

/** Boundary guard — string Solana ids must never reach numeric-chainId consumers. */
export function isSolanaNetworkId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SOLANA_NETWORKS, id)
}

export function getSolanaNetwork(id) {
  return SOLANA_NETWORKS[id] || null
}

/**
 * Resolve the RPC endpoint for a Solana network: the relay-gateway proxy when a
 * relayer base URL is configured, else the public cluster endpoint.
 * @param {string} id
 * @param {string} [relayerBaseUrl] typically import.meta.env.VITE_RELAYER_URL
 */
export function solanaRpcEndpoint(id, relayerBaseUrl) {
  const net = getSolanaNetwork(id)
  if (!net) throw new Error(`solana: unknown network '${String(id)}'`)
  if (relayerBaseUrl) return `${relayerBaseUrl.replace(/\/$/, '')}/v1/${net.gatewaySegment}/rpc`
  return net.publicRpc
}
