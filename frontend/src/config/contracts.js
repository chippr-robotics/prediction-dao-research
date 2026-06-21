/**
 * Deployed Contract Addresses
 *
 * Active network is selected via VITE_NETWORK_ID. Each network has its own
 * deployment record. Addresses are deterministic via Safe Singleton Factory,
 * so re-running deploy scripts produces the same addresses.
 *
 * Last updated: 2026-05-09 (Amoy network added for Polymarket integration)
 */

// Mordor (Ethereum Classic testnet, chainId 63) — v2 P2P betting deployment.
// CORE ONLY: no oracle adapters (ETC has no Polymarket/Chainlink/UMA), so those
// keys are intentionally absent and their capability tags read "unavailable".
// The legacy v1 Mordor deployment is retired (Spec 015 FR-017). Deployed +
// verified on Blockscout (etc-mordor.blockscout.com) 2026-06-16; addresses are
// kept in sync from the record via:
//   npx hardhat run scripts/deploy/deploy.js --network mordor
//   npm run sync:frontend-contracts -- --network mordor --chainId 63
const MORDOR_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '',
  wagerRegistry: '0x3ccB144d8aa838e8d4D695867cC72e548117830C',
  membershipManager: '0x68bCBA1055DAbe11b98Bb8425A16e648Ad65d541',
  keyRegistry: '0xcEFdeBba8E040c035c690ca9057cF22E73247c24',
  sanctionsGuard: '0xdF41355dD5E47FCA4eE2F2205af4C70Dab8C13B3',
  // Classic USD (USC) — real on-chain stablecoin (no mock); set by sync.
  paymentToken: '0xDE093684c796204224BC081f937aa059D903c52a',
  wmatic: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
}

// Local Hardhat sandbox (chainId 1337) — populated by deploy.js + sync.
const HARDHAT_CONTRACTS = {
  deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  treasury: '',
  wagerRegistry: '0x260Fad26873AC132b34dD6FA5761DcfF0e26cbd0',
  membershipManager: '0x81010Af3Ef2BBc092c898944D9D39E6c94124660',
  keyRegistry: '0xb314c4Ee52D9D89bf7FEE66a43aBeAc7D047a5Cb',
  sanctionsGuard: '',
  polymarketAdapter: '0x19D004863fB8F5A1707091C120e08aA1FEE8d65F',
  paymentToken: '0x065606eeE0D7BB3d2e7959D56c3ca177625385a7',
  wmatic: '0xE80bf16CAF66CAe0Ae5aBC4a5ab4acc27361553F',
}

// Polygon Amoy testnet deployment (v2 — P2P betting architecture)
// Run: npx hardhat run scripts/deploy/deploy.js --network amoy
//      npm run sync:frontend-contracts -- --network amoy --chainId 80002
const AMOY_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  // v2 core (populated by `npm run sync:frontend-contracts -- --network amoy --chainId 80002`)
  wagerRegistry: '0x72ECAD23D369BFD0C22221a303faD1fE4b480d11',
  membershipManager: '0x101C3eC35fa48A500c2dFA9026f1d42F1431Abe8',
  keyRegistry: '0xcEFdeBba8E040c035c690ca9057cF22E73247c24',
  sanctionsGuard: '0xdF41355dD5E47FCA4eE2F2205af4C70Dab8C13B3',
  polymarketAdapter: '0x98fe63209f5BffcCe905bF8779a1F06576A2C313',
  // Stake / payment tokens (Circle USDC + Wrapped MATIC on Amoy)
  paymentToken: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  wmatic: '0x0ae690AAD8663aaB12a671A6A0d74242332de85f',
  chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
  chainlinkFunctionsAdapter: '0x074fC18C1E322a7537b53B8B2Bf0762629E3b532',
  umaAdapter: '0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88',
}

// Polygon mainnet deployment (v2 — P2P betting architecture) — LIVE
// Run: npx hardhat run scripts/deploy/deploy.js --network polygon
//      npm run sync:frontend-contracts -- --network polygon --chainId 137
const POLYGON_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  // Treasury / membership-sales recipient = chipprbots.eth (hardware wallet).
  treasury: '0x1215185387E70a48b07D73AcB67002A073F18575',
  // v2 core (populated by `npm run sync:frontend-contracts -- --network polygon --chainId 137`)
  wagerRegistry: '0x5023765809fDA93ab9F11B684fdb76521eD31774',
  membershipManager: '0x00c3ef4e02Ef00Ad6eE955dF5022A22F6ea73dae',
  keyRegistry: '0xcEFdeBba8E040c035c690ca9057cF22E73247c24',
  sanctionsGuard: '0x2Dc53d91A189be71DfE96Ea9BCFCF6aDDA77BC76', // Spec 007 compliance guard
  polymarketAdapter: '0x83688e9b8D4f085E3eF4619D91e0e6303cFcf0A4', // tie-fix + admin-owner redeploy
  // Stake / payment tokens (Circle USDC + Wrapped MATIC on Polygon)
  paymentToken: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
  chainlinkFunctionsAdapter: '0x148C2E347a601AC1a680b17321529b0Ffc31AeFc',
  umaAdapter: '0x8224433d099Af6cd30540A78421aBFd6e044E949',
}

const NETWORK_CONTRACTS = {
  63: MORDOR_CONTRACTS,     // Mordor (Ethereum Classic testnet, v2 core-only)
  80002: AMOY_CONTRACTS,    // Polygon Amoy (v2)
  137: POLYGON_CONTRACTS,   // Polygon mainnet (v2) — LIVE
  1337: HARDHAT_CONTRACTS,  // Local Hardhat sandbox
}

// Default to Polygon mainnet (137) — the primary network — when VITE_NETWORK_ID
// isn't set. Test runs pin VITE_NETWORK_ID=63 (frontend/vite.config.js) so this
// default doesn't affect them; the live frontend reads VITE_NETWORK_ID from .env.
const ACTIVE_CHAIN_ID = parseInt(import.meta.env.VITE_NETWORK_ID || '137', 10)

export const DEPLOYED_CONTRACTS =
  NETWORK_CONTRACTS[ACTIVE_CHAIN_ID] || POLYGON_CONTRACTS

/**
 * Deployment block numbers for event scanning.
 * Keyed by chain ID; used as the starting block when no cached index exists.
 *
 * v1 used friendGroupMarketFactory; v2 uses wagerRegistry. Both kept here to
 * support legacy Mordor reads while Amoy migrates.
 */
const DEPLOYMENT_BLOCKS_BY_CHAIN = {
  63: { friendGroupMarketFactory: 15658191, wagerRegistry: 0 },
  80002: { friendGroupMarketFactory: 0, wagerRegistry: 0 },
  137: { friendGroupMarketFactory: 0, wagerRegistry: 88118344 },
}

export const DEPLOYMENT_BLOCKS =
  DEPLOYMENT_BLOCKS_BY_CHAIN[ACTIVE_CHAIN_ID] || { friendGroupMarketFactory: 0, wagerRegistry: 0 }

/**
 * Get contract address from environment or use deployed default
 * @param {string} contractName - Name of the contract
 * @returns {string} Contract address
 */
export function getContractAddress(contractName) {
  // Check environment variables first (for custom deployments)
  // Support both legacy style (VITE_ROLEMANAGER_ADDRESS) and snake-case style (VITE_ROLE_MANAGER_ADDRESS)
  const upper = contractName.toUpperCase()
  const snake = contractName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()

  const envKeys = [`VITE_${upper}_ADDRESS`, `VITE_${snake}_ADDRESS`]
  for (const envKey of envKeys) {
    const envAddress = import.meta.env[envKey]
    if (envAddress) return envAddress
  }

  // Fall back to deployed contract addresses
  return DEPLOYED_CONTRACTS[contractName]
}

/**
 * Get a contract address for a specific chain id.
 *
 * Unlike `getContractAddress`, which is bound to the build-time
 * VITE_NETWORK_ID, this resolves against the per-chain deployment record so
 * runtime network switches (testnet ↔ mainnet) read the right deployment.
 * Returns undefined when the chain has no deployment for that contract — which
 * is the correct signal for "not available on this network" (e.g. a testnet
 * membership must not appear active on mainnet).
 *
 * Falls back to `getContractAddress` (env overrides + active chain) when no
 * chainId is supplied so existing callers keep their current behavior.
 *
 * @param {string} contractName - Name of the contract
 * @param {number} [chainId] - Target chain id
 * @returns {string|undefined} Contract address
 */
export function getContractAddressForChain(contractName, chainId) {
  if (chainId == null) return getContractAddress(contractName)
  const chainContracts = NETWORK_CONTRACTS[chainId]
  return chainContracts ? chainContracts[contractName] : undefined
}

/**
 * Network configuration, derived from VITE_NETWORK_ID
 */
const NETWORK_INFO_BY_CHAIN = {
  63: {
    name: 'Mordor Testnet',
    rpcUrl: 'https://rpc.mordor.etccooperative.org',
    blockExplorer: 'https://etc-mordor.blockscout.com',
  },
  80002: {
    name: 'Polygon Amoy',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    blockExplorer: 'https://amoy.polygonscan.com',
  },
  137: {
    name: 'Polygon',
    // Public keyless endpoint; override per-deploy with VITE_RPC_URL. The
    // legacy https://polygon-rpc.com endpoint now rejects unauthenticated reads.
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    blockExplorer: 'https://polygonscan.com',
  },
}

const _activeNetwork = NETWORK_INFO_BY_CHAIN[ACTIVE_CHAIN_ID] || NETWORK_INFO_BY_CHAIN[137]

export const NETWORK_CONFIG = {
  chainId: ACTIVE_CHAIN_ID,
  name: _activeNetwork.name,
  rpcUrl: import.meta.env.VITE_RPC_URL || _activeNetwork.rpcUrl,
  blockExplorer: _activeNetwork.blockExplorer,
}
