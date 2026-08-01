/**
 * Deployed Contract Addresses
 *
 * Active network is selected via VITE_NETWORK_ID. Each network has its own
 * deployment record. Addresses are deterministic via Safe Singleton Factory,
 * so re-running deploy scripts produces the same addresses.
 *
 * Last updated: 2026-05-09 (Amoy network added for Polymarket integration)
 */

// Network metadata (names, explorers, native currency) lives in networks.js,
// the single source of truth. We import it here to pair on-chain deployments
// with their display info for getDeployedNetworks(). Safe from import cycles:
// networks.js intentionally does NOT import from this file.
import { NETWORKS } from './networks'
// Tenant contract-set resolution (spec 072): a DEDICATED tenant resolves only
// its own generated set; shared-mode tenants (incl. the default) fall through
// to the per-chain maps below. tenant.js has no import back into this file.
import { isDedicatedTenant, tenantContractsForChain } from './tenant'

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
  membershipVoucher: '0xf514e0e342A898E4681bf51590B672aEC5620401',
  voucherBatchMinter: '0xc26F02da923263e2c9CFB722006e0B8Da2F952B2',
  tokenFactory: '0x5bdf74Ce98D41bf35192c20B25ACd561C75CFe62',
  externalDAORegistry: '0xcEE0fb2e1407f0A0d19Bcf4Fee2726A3005FA3C0',
  backupPointerRegistry: '0x664ACAd4d604c626A6160948Df9C10FE38010E11',
  // Wager Pools (spec 034, address-based — Semaphore removed). Pending the fresh WagerPoolFactory
  // deploy; populated by `npm run sync:frontend-contracts` after `deploy-wager-pool-factory.js`.
  // The prior Semaphore-based factory (0x33cD…) is abandoned and intentionally NOT wired here.
  wagerPoolFactory: '0xac78B4EdeF96e74a2653028dF93A26acFCfC613F',
  // Callsigns (spec 054) — %callsign naming registry. Empty until `deploy-callsign-registry.js` runs;
  // populated by `npm run sync:frontend-contracts`.
  callsignRegistry: '',
  // Mini-app registry (spec 073) — the curation authority for the Apps catalog. Empty until
  // `deploy-miniapp-registry.js` runs; populated by `npm run sync:frontend-contracts`.
  // Undeployed ⇒ the catalog says so and refuses every launch: a package is only ever fetched
  // and executed against an Approved on-chain record (FR-010/FR-011), so "no registry" can
  // never degrade into "run it anyway".
  miniAppRegistry: '',
  // Staking control surface (spec 066). Empty until `deploy-staking-router.js` runs; sync populates it.
  // Undeployed ⇒ the member app falls back to spec-065 fee-free direct staking.
  stakingRouter: '',
  // Cross-chain bridge + liquidity supply (spec 067). Empty until
  // `deploy-bridge-liquidity.js` runs; `npm run sync:frontend-contracts` populates them.
  // Undeployed ⇒ the Bridge surface hides and Earn → Supply shows its honest
  // per-network empty state (FR-051) — never invented availability.
  bridgeRouter: '',
  liquidityRouter: '',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  safePolicyGuardV2: '0xf18B813Ad8C01249FE904A732543A1b8E6CAfd0c',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  feeRouter: '0x5249e3008Cb1Eb81B5BF39148B7760B1c36e516e',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

// Local Hardhat sandbox (chainId 1337) — populated by deploy.js + sync.
const HARDHAT_CONTRACTS = {
  deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  treasury: '',
  wagerRegistry: '0x31F2B0a0d14a8814af2430154ee39E551b66BA8A',
  membershipManager: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  keyRegistry: '0xb314c4Ee52D9D89bf7FEE66a43aBeAc7D047a5Cb',
  sanctionsGuard: '',
  polymarketAdapter: '0x423d2Ca885d67E46062CFF732Eff952f4F736136',
  paymentToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  wmatic: '0xE80bf16CAF66CAe0Ae5aBC4a5ab4acc27361553F',
  // spec 049 — multisig policy engine (synced from deployments/hardhat-chain1337-v2.json)
  safePolicyGuard: '0xBE509C8E6c4F132e2Af49761A318FfA362e9CE38',
  // Spec 068 ordered rule engine; deployed alongside v1 (both guards stay live — vaults adopt V2
  // through a threshold-approved setGuard, never a forced migration).
  safePolicyGuardV2: '0xc01E5F3EAFd2C0138e98382A3F54B6CeB3dc05cf',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  callsignRegistry: '', // spec 054 — %callsign naming registry (synced after deploy)
  miniAppRegistry: '', // spec 073 — mini-app catalog registry (synced after deploy)
  stakingRouter: '', // spec 066 — staking control surface + liquid fee router (synced after deploy)
  // Cross-chain bridge + liquidity supply (spec 067). Empty until
  // `deploy-bridge-liquidity.js` runs; `npm run sync:frontend-contracts` populates them.
  // Undeployed ⇒ the Bridge surface hides and Earn → Supply shows its honest
  // per-network empty state (FR-051) — never invented availability.
  bridgeRouter: '',
  liquidityRouter: '',
}

// Polygon Amoy testnet deployment (v2 — P2P betting architecture)
// Run: npx hardhat run scripts/deploy/deploy.js --network amoy
//      npm run sync:frontend-contracts -- --network amoy --chainId 80002
const AMOY_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  treasury: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  // v2 core (populated by `npm run sync:frontend-contracts -- --network amoy --chainId 80002`)
  wagerRegistry: '0xA429CdaD3E1497e33BEA7D6FE7d6913fE880241b',
  membershipManager: '0x89158f2E044C73c687dA12B7FA42b94F9A6D8465',
  keyRegistry: '0xcEFdeBba8E040c035c690ca9057cF22E73247c24',
  sanctionsGuard: '0xdF41355dD5E47FCA4eE2F2205af4C70Dab8C13B3',
  polymarketAdapter: '0x98fe63209f5BffcCe905bF8779a1F06576A2C313',
  // Stake / payment tokens (Circle USDC + Wrapped MATIC on Amoy)
  paymentToken: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  wmatic: '0x0ae690AAD8663aaB12a671A6A0d74242332de85f',
  chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
  chainlinkFunctionsAdapter: '0x074fC18C1E322a7537b53B8B2Bf0762629E3b532',
  umaAdapter: '0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88',
  membershipVoucher: '0x33C8Ccacf6442Cf4238f01419e38C781cB859769',
  voucherBatchMinter: '0x929A8E9778f26eC49Ba6ed66343e6788f4c689C1',
  callsignRegistry: '', // spec 054 — %callsign naming registry (synced after deploy)
  miniAppRegistry: '', // spec 073 — mini-app catalog registry (synced after deploy)
  stakingRouter: '', // spec 066 — staking control surface + liquid fee router (synced after deploy)
  // Cross-chain bridge + liquidity supply (spec 067). Empty until
  // `deploy-bridge-liquidity.js` runs; `npm run sync:frontend-contracts` populates them.
  // Undeployed ⇒ the Bridge surface hides and Earn → Supply shows its honest
  // per-network empty state (FR-051) — never invented availability.
  bridgeRouter: '',
  liquidityRouter: '',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

// Polygon mainnet deployment (v2 — P2P betting architecture) — LIVE
// Run: npx hardhat run scripts/deploy/deploy.js --network polygon
//      npm run sync:frontend-contracts -- --network polygon --chainId 137
const POLYGON_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  // Treasury / membership-sales recipient = chipprbots.eth (hardware wallet).
  treasury: '0x1215185387E70a48b07D73AcB67002A073F18575',
  // v2 core (populated by `npm run sync:frontend-contracts -- --network polygon --chainId 137`)
  wagerRegistry: '0xE878b62887fC8A5F739B8Ce61bC19546A280Ef89',
  membershipManager: '0xEfd1a880c6BfBf38A661A3F5fF6d5ECB296D557a',
  keyRegistry: '0xcEFdeBba8E040c035c690ca9057cF22E73247c24',
  sanctionsGuard: '0x2Dc53d91A189be71DfE96Ea9BCFCF6aDDA77BC76', // Spec 007 compliance guard
  polymarketAdapter: '0x83688e9b8D4f085E3eF4619D91e0e6303cFcf0A4', // tie-fix + admin-owner redeploy
  // Stake / payment tokens (Circle USDC + Wrapped MATIC on Polygon)
  paymentToken: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
  chainlinkFunctionsAdapter: '0x148C2E347a601AC1a680b17321529b0Ffc31AeFc',
  umaAdapter: '0x8224433d099Af6cd30540A78421aBFd6e044E949',
  membershipVoucher: '0xCB28DC438564672067a6f84131B5130e6Cf7ECC6',
  voucherBatchMinter: '0x4b50d24ca28CbDC029714e5830f7D16a0ebEDb0e',
  tokenFactory: '0x5806e76cA3c838524E7cF43db7625bdFBA0783a0',
  wagerPoolFactory: '0x420aEC3c76859eB74ab21c769c16AcdAB221f723',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  verifyingPaymaster: '0xe14554D14eB5DeC47f7824ebeeDa6C9f3A50d105', // spec 050 — sponsored-gas paymaster (EntryPoint v0.6)
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
  backupPointerRegistry: '0x664ACAd4d604c626A6160948Df9C10FE38010E11',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  safePolicyGuard: '0xa0F188776a65794cc06777412432e47dcB0d0c4B',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  callsignRegistry: '0x22BD6Dd351Db375b64C2886Bda6f3E3F4fd31dA2', // spec 054 — %callsign naming registry (synced after deploy)
  miniAppRegistry: '', // spec 073 — mini-app catalog registry (synced after deploy)
  stakingRouter: '', // spec 066 — staking control surface + liquid fee router (synced after deploy)
  // Cross-chain bridge + liquidity supply (spec 067). Empty until
  // `deploy-bridge-liquidity.js` runs; `npm run sync:frontend-contracts` populates them.
  // Undeployed ⇒ the Bridge surface hides and Earn → Supply shows its honest
  // per-network empty state (FR-051) — never invented availability.
  bridgeRouter: '0x8064F3Cd9F8f113691B981d2B15EF85D95Abd551',
  liquidityRouter: '0x13762c059c2A22E3bCd8A44F36EA44e8e3B22B31',
  safePolicyGuardV2: '0xf18B813Ad8C01249FE904A732543A1b8E6CAfd0c',
  feeRouter: '0xf8161fC26172621E9fbcc6c39500Bb14b0902B35',
}

// Ethereum Classic mainnet (chainId 61) — CUSTODY ONLY. ETC hosts no FairWins wager/membership
// deployment; it gained a contracts block with spec 068 so Protect vaults can live there (Safe
// v1.4.1 is canonical on ETC). Every other lookup honestly resolves empty.
//   npx hardhat run scripts/deploy/custody/deploy-policy-guard-v2.js --network etc
//   npm run sync:frontend-contracts -- --network etc --chainId 61
const ETC_CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  safePolicyGuardV2: '0xf18B813Ad8C01249FE904A732543A1b8E6CAfd0c',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

// Spec 067 bridge/liquidity networks. These chains host NO FairWins wager/membership
// deployment — only the two spec-067 routers — so their maps carry just those keys and
// every other lookup honestly resolves empty.
const ETHEREUM_CONTRACTS = {
  bridgeRouter: '0x258181DF2aa45EA3a3eAC748d6491D5e1f2675eE',
  liquidityRouter: '0x1afcAC1949BD306F7D4818999f509941F2E85582',
  feeRouter: '0xB9F80D6D4CfD3ecC60b63810aDF9d88931D0e3d3',
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

const OPTIMISM_CONTRACTS = {
  bridgeRouter: '0x1afcAC1949BD306F7D4818999f509941F2E85582',
  liquidityRouter: '0xA273aF8ebB76d1D0Dcd55692C1f5a7db956F7EED',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  safePolicyGuardV2: '0xf18B813Ad8C01249FE904A732543A1b8E6CAfd0c',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  feeRouter: '0x98218248CA53Dd88159979af20172C86b94e8B29',
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

const BASE_CONTRACTS = {
  bridgeRouter: '0x1afcAC1949BD306F7D4818999f509941F2E85582',
  liquidityRouter: '0xA273aF8ebB76d1D0Dcd55692C1f5a7db956F7EED',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  safePolicyGuardV2: '0xf18B813Ad8C01249FE904A732543A1b8E6CAfd0c',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  feeRouter: '0x98218248CA53Dd88159979af20172C86b94e8B29',
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

const ARBITRUM_CONTRACTS = {
  bridgeRouter: '0x1afcAC1949BD306F7D4818999f509941F2E85582',
  liquidityRouter: '0xA273aF8ebB76d1D0Dcd55692C1f5a7db956F7EED',
  safeProposalHub: '0x94b5b38C247CE51F7C42C83B63115998b7e970E7',
  safePolicyGuardV2: '0xf18B813Ad8C01249FE904A732543A1b8E6CAfd0c',
  policyGuardSetup: '0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b',
  feeRouter: '0x98218248CA53Dd88159979af20172C86b94e8B29',
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  accountFactory: '0xd519C25e9dEd0DAC586B764574100479CB318734',
}

const NETWORK_CONTRACTS = {
  63: MORDOR_CONTRACTS,     // Mordor (Ethereum Classic testnet, v2 core-only)
  80002: AMOY_CONTRACTS,    // Polygon Amoy (v2)
  137: POLYGON_CONTRACTS,   // Polygon mainnet (v2) — LIVE
  1337: HARDHAT_CONTRACTS,  // Local Hardhat sandbox
  // Spec 068 — custody only (Protect vaults + policy engine; no wager/membership here).
  61: ETC_CONTRACTS,        // Ethereum Classic mainnet
  // Spec 067 — routers only (no wager/membership deployment on these chains).
  1: ETHEREUM_CONTRACTS,    // Ethereum mainnet
  10: OPTIMISM_CONTRACTS,   // Optimism
  8453: BASE_CONTRACTS,     // Base
  42161: ARBITRUM_CONTRACTS,// Arbitrum One
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
// NOTE (spec 068): `safeProposalHub` MUST carry a deployment block on every custody chain —
// `useVaultProposals` refuses to scan without one, so a missing entry silently disables custody
// proposal discovery on that chain even when the hub itself is deployed.
// NOTE (spec 073): `miniAppRegistry` carries a placeholder block (0 = unknown, per
// getDeploymentBlockForChain) on every chain whose contract map declares the key, so the slot is
// written down rather than remembered. `deploy-miniapp-registry.js` records the real block in
// `deployments/`; copy it here by hand like every other entry. Unlike `safeProposalHub` above,
// a missing block disables nothing today — catalog and launch reads are view calls (research
// R6), never event scans — so a 0 here cannot make the Apps section look available before the
// registry exists; availability comes from the address being non-empty and the record Approved.
const DEPLOYMENT_BLOCKS_BY_CHAIN = {
  63: {
    friendGroupMarketFactory: 15658191,
    wagerRegistry: 0,
    membershipVoucher: 16404315,
    wagerPoolFactory: 16495564,
    safeProposalHub: 16645531,
    miniAppRegistry: 0,
  },
  // Custody-only chains (spec 068). `safeProposalHub` MUST carry a block on every custody chain or
  // useVaultProposals refuses to scan and proposal discovery is silently dead there.
  61: { safeProposalHub: 25026893 }, // Ethereum Classic
  10: { safeProposalHub: 154753770 }, // Optimism
  8453: { safeProposalHub: 49158472 }, // Base
  42161: { safeProposalHub: 488059169 }, // Arbitrum One
  80002: { friendGroupMarketFactory: 0, wagerRegistry: 0, membershipVoucher: 40521024, miniAppRegistry: 0 },
  137: {
    friendGroupMarketFactory: 0,
    wagerRegistry: 89717915,
    membershipVoucher: 89717915,
    wagerPoolFactory: 89720731,
    safeProposalHub: 90120743,
    miniAppRegistry: 0,
  },
  1337: { safeProposalHub: 4, safePolicyGuardV2: 2, miniAppRegistry: 0 },
}

export const DEPLOYMENT_BLOCKS =
  DEPLOYMENT_BLOCKS_BY_CHAIN[ACTIVE_CHAIN_ID] || { friendGroupMarketFactory: 0, wagerRegistry: 0 }

/**
 * Deployment block for a contract on a specific chain — the bounded starting block for event scans
 * (never scan from genesis; see issue #703/#704). Returns 0 when unknown.
 * @param {string} contractName
 * @param {number} chainId
 * @returns {number}
 */
export function getDeploymentBlockForChain(contractName, chainId) {
  const blocks = DEPLOYMENT_BLOCKS_BY_CHAIN[chainId]
  return (blocks && blocks[contractName]) || 0
}

/**
 * Get contract address from environment or use deployed default
 * @param {string} contractName - Name of the contract
 * @returns {string} Contract address
 */
export function getContractAddress(contractName) {
  // Dedicated tenant (spec 072): the tenant's own generated set is the ONLY
  // source — no env overrides, no shared-estate fallback. Absence stays absence.
  if (isDedicatedTenant()) {
    const tenantSet = tenantContractsForChain(ACTIVE_CHAIN_ID)
    return tenantSet ? tenantSet[contractName] : undefined
  }

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
  // Dedicated tenant (spec 072): resolve ONLY from the tenant's own set —
  // a chain absent from it reads as not-deployed for this tenant, never as
  // the shared estate's deployment (FR-003/D6).
  if (isDedicatedTenant()) {
    const tenantSet = tenantContractsForChain(chainId)
    return tenantSet ? tenantSet[contractName] : undefined
  }
  const chainContracts = NETWORK_CONTRACTS[chainId]
  return chainContracts ? chainContracts[contractName] : undefined
}

// Local-only sandboxes — never surfaced as public "deployed" networks.
const LOCAL_ONLY_CHAIN_IDS = new Set([1337])
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/**
 * Networks the app has been publicly deployed to — derived from
 * NETWORK_CONTRACTS entries that carry a live `wagerRegistry` (v2 escrow)
 * address, paired with their display metadata from networks.js. Local-only
 * sandboxes (Hardhat 1337) are excluded. Mainnets surface before testnets so
 * the production network reads first.
 *
 * This is the source for the landing page's "Deployed on" section, so it grows
 * automatically as new chains gain a wagerRegistry deployment — no UI edits.
 *
 * @returns {Array<{chainId:number,name:string,isTestnet:boolean,nativeSymbol:string,explorerUrl:string,contractUrl:string}>}
 */
export function getDeployedNetworks() {
  return Object.entries(NETWORK_CONTRACTS)
    .map(([id, contracts]) => ({ chainId: parseInt(id, 10), contracts }))
    .filter(
      ({ chainId, contracts }) =>
        !LOCAL_ONLY_CHAIN_IDS.has(chainId) &&
        ADDRESS_RE.test(contracts?.wagerRegistry || '')
    )
    .map(({ chainId, contracts }) => {
      const net = NETWORKS[chainId]
      const explorerUrl = net?.explorer?.baseUrl || ''
      return {
        chainId,
        name: net?.name || `Chain ${chainId}`,
        isTestnet: Boolean(net?.isTestnet),
        nativeSymbol: net?.nativeCurrency?.symbol || '',
        explorerUrl,
        // Link straight to the deployed escrow contract when an explorer exists.
        contractUrl: explorerUrl
          ? `${explorerUrl.replace(/\/$/, '')}/address/${contracts.wagerRegistry}`
          : '',
      }
    })
    .sort(
      (a, b) =>
        Number(a.isTestnet) - Number(b.isTestnet) || a.name.localeCompare(b.name)
    )
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
