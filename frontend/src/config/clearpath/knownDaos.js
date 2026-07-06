// Spec 042 — verified, seeded governance DAOs per chain.
//
// A small, curated set of well-known DAOs ClearPath surfaces by default so members don't have to paste an
// address to find ENS/Uniswap/etc. These are EXTERNAL third-party contracts (not our deployments), held as
// VERIFIED configuration — every address MUST be confirmed on-chain before it is added here (never guessed).
// Members can still track any additional DAO by address (device-local). Keyed by chainId → array of
// { address, framework, label } where framework matches DAO_FRAMEWORK (0 OZ Governor, 1 GovernorBravo).
//
// Populated during implementation (T026 ENS, T036 Uniswap) once addresses are on-chain-verified.

/** @type {Record<number, Array<{address: string, framework: number, label: string}>>} */
export const KNOWN_DAOS = {
  // 1: [ { address: '0x…ENS Governor', framework: 0, label: 'ENS DAO' },
  //      { address: '0x…Uniswap Governor Bravo', framework: 1, label: 'Uniswap' } ],
}

/** Seeded DAOs for a chain (network-scoped), or [] when none. */
export function knownDaosForChain(chainId) {
  return KNOWN_DAOS[Number(chainId)] || []
}

export default knownDaosForChain
