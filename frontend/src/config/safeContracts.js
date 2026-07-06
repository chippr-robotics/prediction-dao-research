// Spec 043 — canonical Safe v1.4.1 contract addresses per supported chain, hand-maintained. Safe contracts are
// EXTERNAL deployments (not ours), so they are NOT synced by `sync:frontend-contracts` (which only fills our
// own deployment addresses). v1.4.1 was deployed through the per-chain Safe Singleton Factory, so the
// `canonical` addresses below are IDENTICAL across Ethereum Classic (61), Mordor (63), and Polygon (137) —
// all verified live on-chain (see specs/043-safe-multisig-custody/research.md, Decision 1).
//
// Custody is offered ONLY on chains present here; `getSafeContracts` returns undefined otherwise so the UI can
// show "unavailable on this network" (FR-030). The SafeProposalHub address (OUR contract) is resolved
// separately via getContractAddressForChain('safeProposalHub', chainId).

// Same canonical v1.4.1 address set on every chain the Safe Singleton Factory reached.
const SAFE_V1_4_1 = {
  singleton: '0x41675C099F32341bf84BFc5382aF534df5C7461a', // Safe (L1) singleton
  singletonL2: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762', // SafeL2 singleton (richer events for indexing)
  proxyFactory: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
  fallbackHandler: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99', // CompatibilityFallbackHandler (EIP-1271)
  multiSendCallOnly: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
  version: '1.4.1',
}

// chainId → Safe contract set. Add 61 (ETC mainnet) here once the app gains an ETC network block; the address
// set is already correct (identical canonical addresses).
export const SAFE_CONTRACTS = {
  63: SAFE_V1_4_1, // Mordor (Ethereum Classic testnet)
  137: SAFE_V1_4_1, // Polygon
}

/** Supported custody chain ids (those with a Safe deployment configured above). */
export const CUSTODY_SUPPORTED_CHAIN_IDS = Object.keys(SAFE_CONTRACTS).map((id) => Number(id))

/**
 * Resolve the Safe v1.4.1 contract set for a chain, or `undefined` when Custody is unavailable there.
 * @param {number|string|null|undefined} chainId
 */
export function getSafeContracts(chainId) {
  if (chainId == null) return undefined
  return SAFE_CONTRACTS[Number(chainId)]
}

/** Whether Custody's on-chain multisig features are available on the given chain. */
export function isCustodySupported(chainId) {
  return getSafeContracts(chainId) !== undefined
}

export default SAFE_CONTRACTS
