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

// chainId → Safe contract set. A chain belongs here only once Safe v1.4.1 AND our own custody
// contracts (safeProposalHub + the policy engine) are verified live on it — otherwise Protect would
// offer vaults on a chain where proposals cannot be discovered. Every entry below was checked
// on-chain by scripts/ops/preflight-policy-guard-v2.js and deployed in spec 068.
/*
 * The full-E2E local node impersonates Amoy (80002) so membership can settle on its reference
 * chain, and Custody is genuinely NOT offered on real Polygon Amoy. Rather than leave the whole
 * custody surface undrivable end to end, the local impersonation resolves Safe there too, and
 * `scripts/e2e/setup-custody-fixtures.js` places the canonical v1.4.1 code on that node so the
 * addresses below actually answer.
 *
 * DEV-guarded exactly like the sibling seams (`NETWORK_CONTRACTS[80002]` in contracts.js, `earn`
 * in networks.js): `import.meta.env.DEV &&` makes the branch dead code in any production bundle,
 * so a shipped build offers custody on Amoy no more than it does today, even with the flag set.
 * Real Amoy joins the map above — not here — if and when Safe and our custody contracts are
 * verified live on it.
 */
const E2E_AMOY_LOCAL =
  Boolean(import.meta.env?.DEV) && import.meta.env?.VITE_E2E_AMOY_LOCAL === '1'

export const SAFE_CONTRACTS = {
  10: SAFE_V1_4_1, // Optimism
  61: SAFE_V1_4_1, // Ethereum Classic
  63: SAFE_V1_4_1, // Mordor (Ethereum Classic testnet)
  137: SAFE_V1_4_1, // Polygon
  8453: SAFE_V1_4_1, // Base
  42161: SAFE_V1_4_1, // Arbitrum One
  ...(E2E_AMOY_LOCAL ? { 80002: SAFE_V1_4_1 } : {}), // local full-E2E impersonation only
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
