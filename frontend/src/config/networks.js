/**
 * Per-chain configuration for the FairWins app.
 *
 * Single source of truth for chain metadata, contract addresses, stablecoin
 * info, DEX deployments, explorer URLs, and per-chain capabilities. Other
 * config (wagmi.js, contracts.js, blockExplorer.js, dex.js) derives from
 * this map.
 *
 * Supported chains:
 *   - Polygon Mainnet (137) — PRIMARY / production default. Canonical Uniswap
 *     V3 deployment; live v2 wager contracts.
 *   - Polygon Amoy (80002) — testnet. Co-locates with Polymarket's CTF for
 *     settle-by-reference; community Uniswap V3 contracts may be plugged in via
 *     VITE_AMOY_UNISWAP_* env vars.
 *   - Hardhat (1337) — local dev.
 *
 * The user-facing Testnet/Mainnet toggle switches between 80002 (testnet) and
 * 137 (mainnet) via wagmi.switchChain.
 */

// Note: We intentionally do NOT import from ./contracts here — contracts.js
// imports from this file (indirectly, via NETWORK_CONFIG-style lookups) and a
// hard import would create a cycle.

// PRIMARY_CHAIN_ID is the app's home/default network (used as the default chain
// when VITE_NETWORK_ID is unset and as the wallet auto-switch target for
// unsupported chains). TESTNET_CHAIN_ID is the testnet side of the user-facing
// Testnet/Mainnet toggle — kept separate so "primary" can be mainnet without
// collapsing the toggle pair.
const PRIMARY_CHAIN_ID = 137
const MAINNET_CHAIN_ID = 137
const TESTNET_CHAIN_ID = 80002

// Passkey smart-account submission config (spec 041, data-model
// "SubmissionRoute"). Parses a comma-separated ERC-4337 bundler URL list
// (ordered: self-hosted alto first, public fallbacks). Empty/unset → null so
// the passkey capability flips off and the login surface hides the option
// honestly (FR-004) instead of offering a dead path. erc20PaymasterUrl is the
// optional fee-in-USDC path; null → UserOp fees fall back to the account's
// native balance (spec 041 clarification Q3).
const passkeyConfig = (urlsEnv, paymasterEnv) => {
  const bundlerUrls = (urlsEnv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (bundlerUrls.length === 0) return null
  return { bundlerUrls, erc20PaymasterUrl: paymasterEnv || null }
}

const NETWORKS = {
  80002: {
    chainId: 80002,
    name: 'Polygon Amoy',
    isTestnet: true,
    isPrimary: false,
    // Surfaced in the My Account → Network tab as a user-switchable network.
    selectable: true,
    nativeCurrency: { decimals: 18, name: 'MATIC', symbol: 'MATIC' },
    rpcUrl: import.meta.env?.VITE_RPC_URL_AMOY || 'https://rpc-amoy.polygon.technology',
    explorer: { name: 'Polygonscan', baseUrl: 'https://amoy.polygonscan.com' },
    // The Graph endpoint that indexes this chain's WagerRegistry. When present,
    // the wager list/reports read from the subgraph; when null (see Mordor),
    // the app falls back to direct RPC reads via RegistrySource. Override with
    // VITE_SUBGRAPH_URL_AMOY.
    subgraphUrl:
      import.meta.env?.VITE_SUBGRAPH_URL_AMOY ||
      'https://api.studio.thegraph.com/query/1755381/fairwins-amoy/v0.3.0',
    // USDC on Amoy. Defaults to the Circle faucet USDC deployed alongside
    // our contracts (same as paymentToken in contracts.js). Override via
    // VITE_AMOY_USDC if a different token is needed.
    stablecoin: {
      address: import.meta.env?.VITE_AMOY_USDC || '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      // EIP-712 domain version for the EIP-3009 payment leg (spec 035 FR-020):
      // native Circle USDC signs under version '2' (bridged USDC.e would be '1').
      domainVersion: '2',
    },
    // Uniswap V3 has no canonical deployment on Polygon Amoy. Community
    // deployments exist; supply them via VITE_AMOY_UNISWAP_* env vars to
    // enable swaps on testnet. When any required address is missing the DEX
    // capability flips off and the swap UI is hidden.
    dex: (() => {
      const factory = import.meta.env?.VITE_AMOY_UNISWAP_FACTORY
      const router = import.meta.env?.VITE_AMOY_UNISWAP_SWAP_ROUTER
      const quoter = import.meta.env?.VITE_AMOY_UNISWAP_QUOTER
      const positionManager = import.meta.env?.VITE_AMOY_UNISWAP_POSITION_MANAGER
      const wnative = import.meta.env?.VITE_AMOY_WMATIC
      if (!factory || !router || !quoter || !wnative) return null
      return {
        factory,
        swapRouter: router,
        quoter,
        positionManager: positionManager || null,
        wnative,
      }
    })(),
    contracts: {}, // populated by sync:frontend-contracts after deploy
    polymarket: {
      ctf: import.meta.env?.VITE_AMOY_POLYMARKET_CTF || null,
      // Gamma API endpoint for Polymarket event search. Polymarket runs the
      // same Gamma instance for testnet listings.
      gammaApiUrl: import.meta.env?.VITE_POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com',
    },
    // DEX provider identity — non-ETC networks route through Uniswap (Spec 033).
    dexProvider: {
      name: 'Uniswap',
      url: 'https://app.uniswap.org/swap',
    },
    // Passkey smart accounts (spec 041) — Amoy is the passkey validation
    // network: RIP-7212 P-256 precompile live, canonical EntryPoint v0.6.
    passkey: passkeyConfig(
      import.meta.env?.VITE_BUNDLER_URLS_AMOY,
      import.meta.env?.VITE_ERC20_PAYMASTER_AMOY
    ),
    get capabilities() {
      return {
        polymarketSidebets: true,
        dex: Boolean(this.dex),
        friendMarkets: true,
        passkeyAccounts: Boolean(this.passkey),
      }
    },
  },
  63: {
    chainId: 63,
    name: 'Ethereum Classic Mordor',
    isTestnet: true,
    isPrimary: false,
    // Surfaced in the My Account → Network tab as a user-switchable network.
    selectable: true,
    nativeCurrency: { decimals: 18, name: 'Ethereum Classic', symbol: 'ETC' },
    rpcUrl: import.meta.env?.VITE_RPC_URL_MORDOR || 'https://rpc.mordor.etccooperative.org',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    // No hosted Graph indexer supports Ethereum Classic / Mordor, so there is no
    // subgraph for this chain. The app reads wagers directly from the
    // WagerRegistry over RPC (RegistrySource). Set VITE_SUBGRAPH_URL_MORDOR only
    // if a self-hosted indexer (Goldsky/Ponder/Envio) is stood up later.
    subgraphUrl: import.meta.env?.VITE_SUBGRAPH_URL_MORDOR || null,
    // Classic USD (USC) — Ethereum Classic's fiat-backed stablecoin (Brale-issued),
    // reused as-is (never a mock). Verify the canonical Mordor address + decimals
    // on-chain before relying on it (Spec 015, T001). Override via VITE_MORDOR_USC.
    stablecoin: {
      address: import.meta.env?.VITE_MORDOR_USC || '0xDE093684c796204224BC081f937aa059D903c52a',
      symbol: 'USC',
      name: 'Classic USD',
      decimals: 6,
      // USC has no EIP-3009 receiveWithAuthorization — null disables payment-class
      // gasless intents on this chain (self-submit only; spec 035 FR-020).
      domainVersion: null,
    },
    // ETCswap (Uniswap V3 fork on Ethereum Classic). Supply all addresses via
    // VITE_MORDOR_ETCSWAP_* + VITE_MORDOR_WETC to enable in-app swaps on Mordor.
    // When any required address is missing the DEX capability flips off and the
    // swap UI is hidden (no mock DEX) — Spec 015 FR-011.
    dex: (() => {
      const factory = import.meta.env?.VITE_MORDOR_ETCSWAP_FACTORY
      const router = import.meta.env?.VITE_MORDOR_ETCSWAP_SWAP_ROUTER
      const quoter = import.meta.env?.VITE_MORDOR_ETCSWAP_QUOTER
      const positionManager = import.meta.env?.VITE_MORDOR_ETCSWAP_POSITION_MANAGER
      const wnative = import.meta.env?.VITE_MORDOR_WETC
      if (!factory || !router || !quoter || !wnative) return null
      return {
        factory,
        swapRouter: router,
        quoter,
        positionManager: positionManager || null,
        wnative,
      }
    })(),
    contracts: {}, // populated by sync:frontend-contracts after deploy
    polymarket: null, // no Polymarket on Ethereum Classic
    // Per-network documentation links for the Network tab (not derivable from the
    // fields above). Faucet URL is verified in Spec 015 T003 — set VITE_MORDOR_FAUCET
    // (or update the default) once confirmed; the card hides the row when empty.
    resources: {
      faucet: import.meta.env?.VITE_MORDOR_FAUCET || '',
    },
    // DEX provider identity — the ETC family routes through ETCswap (Spec 033).
    // Declared at the network level so the swap UI can name the provider even
    // when `dex` is env-unconfigured (keeps the disabled-state message honest).
    dexProvider: {
      name: 'ETCswap',
      url: import.meta.env?.VITE_MORDOR_ETCSWAP_URL || 'https://etcswap.org',
    },
    // Passkey smart accounts are a deferred increment on the ETC family
    // (spec 041 FR-022): no RIP-7212 precompile, no canonical EntryPoint,
    // no bundler infrastructure. null keeps the login option honestly hidden.
    passkey: null,
    get capabilities() {
      return {
        polymarketSidebets: false,
        dex: Boolean(this.dex),
        friendMarkets: true,
        passkeyAccounts: false,
      }
    },
  },
  61: {
    chainId: 61,
    name: 'Ethereum Classic',
    isTestnet: false,
    isPrimary: false,
    // Surfaced in the My Account → Network tab as a user-switchable network.
    selectable: true,
    nativeCurrency: { decimals: 18, name: 'Ethereum Classic', symbol: 'ETC' },
    rpcUrl: import.meta.env?.VITE_RPC_URL_ETC || 'https://etc.rivet.link',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc.blockscout.com' },
    // No hosted Graph indexer supports Ethereum Classic, so wager reads go
    // straight to the WagerRegistry over RPC (RegistrySource). ETC mainnet is
    // wager-legacy (read-only); Spec 033 enables only the swap surface here.
    subgraphUrl: import.meta.env?.VITE_SUBGRAPH_URL_ETC || null,
    // Classic USD (USC) — the same Brale-issued token deployed at a deterministic
    // address on ETC mainnet and Mordor; verified on etc.blockscout.com
    // (Spec 033 research R2). Override via VITE_ETC_USC.
    stablecoin: {
      address: import.meta.env?.VITE_ETC_USC || '0xDE093684c796204224BC081f937aa059D903c52a',
      symbol: 'USC',
      name: 'Classic USD',
      decimals: 6,
      // USC has no EIP-3009 receiveWithAuthorization — null disables payment-class
      // gasless intents on this chain (self-submit only; spec 035 FR-020).
      domainVersion: null,
    },
    // ETCswap V3 (a Uniswap V3 deployment on Ethereum Classic). Addresses are the
    // on-chain-verified canonical deployment (Spec 033 research R1); override via
    // VITE_ETC_ETCSWAP_* + VITE_ETC_WETC. Gated like every chain: if an override
    // blanks a required address the DEX flips off — no mock DEX.
    dex: (() => {
      const factory = import.meta.env?.VITE_ETC_ETCSWAP_FACTORY || '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC'
      const router = import.meta.env?.VITE_ETC_ETCSWAP_SWAP_ROUTER || '0xEd88EDD995b00956097bF90d39C9341BBde324d1'
      const quoter = import.meta.env?.VITE_ETC_ETCSWAP_QUOTER || '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B'
      const positionManager = import.meta.env?.VITE_ETC_ETCSWAP_POSITION_MANAGER || '0x3CEDe6562D6626A04d7502CC35720901999AB699'
      const wnative = import.meta.env?.VITE_ETC_WETC || '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a'
      if (!factory || !router || !quoter || !wnative) return null
      return {
        factory,
        swapRouter: router,
        quoter,
        positionManager: positionManager || null,
        wnative,
      }
    })(),
    contracts: {}, // ETC mainnet has no v2 wager deployment (wager-legacy)
    polymarket: null, // no Polymarket on Ethereum Classic
    // DEX provider identity — the ETC family routes through ETCswap (Spec 033).
    dexProvider: {
      name: 'ETCswap',
      url: import.meta.env?.VITE_ETC_ETCSWAP_URL || 'https://v3.etcswap.org',
    },
    // Passkey smart accounts are a deferred increment on the ETC family
    // (spec 041 FR-022) — see the Mordor entry for the constraint list.
    passkey: null,
    get capabilities() {
      return {
        polymarketSidebets: false,
        dex: Boolean(this.dex),
        friendMarkets: true,
        passkeyAccounts: false,
      }
    },
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    isTestnet: false,
    isPrimary: true,
    // Surfaced in the My Account → Network tab as a user-switchable network.
    selectable: true,
    nativeCurrency: { decimals: 18, name: 'MATIC', symbol: 'MATIC' },
    rpcUrl: import.meta.env?.VITE_RPC_URL_POLYGON || 'https://polygon-bor-rpc.publicnode.com',
    explorer: { name: 'Polygonscan', baseUrl: 'https://polygonscan.com' },
    // The Graph endpoint indexing the production WagerRegistry on Polygon.
    // Override with VITE_SUBGRAPH_URL_POLYGON.
    subgraphUrl:
      import.meta.env?.VITE_SUBGRAPH_URL_POLYGON ||
      'https://api.studio.thegraph.com/query/1755381/fairwins-polygon/v0.2.0',
    // Native USDC on Polygon (Circle-issued, USDC.e is the bridged variant
    // and is not used here). Decimals=6.
    stablecoin: {
      address: import.meta.env?.VITE_POLYGON_USDC || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      // EIP-712 domain version for the EIP-3009 payment leg (spec 035 FR-020):
      // native Circle USDC signs under version '2' (bridged USDC.e would be '1').
      domainVersion: '2',
    },
    // Canonical Uniswap V3 deployment on Polygon Mainnet.
    // https://docs.uniswap.org/contracts/v3/reference/deployments
    dex: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      wnative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    },
    contracts: {},
    polymarket: {
      ctf: import.meta.env?.VITE_POLYGON_POLYMARKET_CTF || '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
      gammaApiUrl: import.meta.env?.VITE_POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com',
    },
    // DEX provider identity — non-ETC networks route through Uniswap (Spec 033).
    dexProvider: {
      name: 'Uniswap',
      url: 'https://app.uniswap.org/swap?chain=polygon',
    },
    // Passkey smart accounts (spec 041) — production network: RIP-7212
    // precompile live since the Napoli upgrade, canonical EntryPoint v0.6.
    passkey: passkeyConfig(
      import.meta.env?.VITE_BUNDLER_URLS_POLYGON,
      import.meta.env?.VITE_ERC20_PAYMASTER_POLYGON
    ),
    get capabilities() {
      return {
        polymarketSidebets: true,
        dex: Boolean(this.dex),
        friendMarkets: true,
        passkeyAccounts: Boolean(this.passkey),
      }
    },
  },
  1337: {
    chainId: 1337,
    name: 'Hardhat',
    isTestnet: true,
    isPrimary: false,
    // Local dev only — not offered in the user-facing network switcher.
    selectable: false,
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrl: 'http://127.0.0.1:8545',
    explorer: { name: 'Local', baseUrl: '' },
    // Local dev has no subgraph — reads go straight to the local node over RPC.
    subgraphUrl: null,
    stablecoin: null,
    dex: null,
    contracts: {},
    polymarket: null,
    // Local dev/e2e: point VITE_BUNDLER_URLS_LOCAL at a local bundler (alto
    // against the hardhat node) to exercise passkey flows in Cypress.
    passkey: passkeyConfig(import.meta.env?.VITE_BUNDLER_URLS_LOCAL, null),
    get capabilities() {
      return {
        polymarketSidebets: false,
        dex: false,
        friendMarkets: true,
        passkeyAccounts: Boolean(this.passkey),
      }
    },
  },
}

export { NETWORKS, PRIMARY_CHAIN_ID, MAINNET_CHAIN_ID, TESTNET_CHAIN_ID }

export function getCurrentChainId() {
  const env = import.meta.env?.VITE_NETWORK_ID
  return env ? parseInt(env, 10) : PRIMARY_CHAIN_ID
}

export function getNetwork(chainId) {
  return NETWORKS[chainId] || NETWORKS[getCurrentChainId()] || NETWORKS[PRIMARY_CHAIN_ID]
}

export function isDexAvailable(chainId) {
  return Boolean(getNetwork(chainId)?.dex)
}

/**
 * The DEX provider descriptor (`{ name, url }`) for `chainId`, or null when the
 * network has no DEX provider (e.g. local Hardhat). Declared per network so the
 * mapping — ETC family (61, 63) → ETCswap; all others → Uniswap — is explicit
 * and survives an unconfigured `dex`: the swap UI can still name the provider
 * for honest disabled-state copy (Spec 033). Resolution is strictly per-chain so
 * a provider identity never leaks across networks.
 */
export function getDexProvider(chainId) {
  return getNetwork(chainId)?.dexProvider ?? null
}

/**
 * The Graph endpoint that indexes `chainId`, or null when no subgraph is
 * deployed for that network. This is the single source of truth for the
 * "does this chain have an indexer?" decision used to route wager reads
 * between the subgraph and direct RPC (RegistrySource).
 *
 * Resolution is strictly per-chain so a subgraph URL configured for one
 * network can never leak to another (e.g. a Polygon endpoint must not be
 * queried while the wallet is on Mordor).
 */
export function getSubgraphUrl(chainId) {
  const net = chainId != null ? NETWORKS[chainId] : null
  return net?.subgraphUrl || null
}

/**
 * Whether `chainId` is indexed by a subgraph. Networks that return false
 * (e.g. Ethereum Classic Mordor) must be served from RPC reads instead.
 */
export function hasSubgraph(chainId) {
  return Boolean(getSubgraphUrl(chainId))
}

/**
 * Whether a chainId is a supported network.
 */
export function isSupportedChainId(chainId) {
  return Object.prototype.hasOwnProperty.call(NETWORKS, chainId)
}

export function listSupportedChainIds() {
  return Object.keys(NETWORKS).map((id) => parseInt(id, 10))
}

/**
 * Networks offered in the user-facing network switcher (My Account → Network).
 * Mainnets first, then testnets, so the production default surfaces at the top.
 * Future chains opt in by setting `selectable: true` on their NETWORKS entry.
 */
export function getSelectableNetworks() {
  return listSupportedChainIds()
    .map((id) => NETWORKS[id])
    .filter((net) => net?.selectable)
    .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet))
}

/**
 * Pair of (testnet, mainnet) chain IDs used by the Testnet/Mainnet toggle.
 * Surfaced as a helper so UI code doesn't have to know the numeric values.
 */
export const TESTNET_MAINNET_PAIR = {
  testnet: TESTNET_CHAIN_ID,
  mainnet: MAINNET_CHAIN_ID,
}
