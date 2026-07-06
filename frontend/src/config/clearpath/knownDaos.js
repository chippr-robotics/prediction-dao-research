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
  // Ethereum mainnet (1). Addresses verified on-chain 2026-07-06:
  //  - ENS Governor answers COUNTING_MODE() ("support=bravo&quorum=for,abstain") → OpenZeppelin Governor (0),
  //    voting token ENS (0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72).
  //  - Uniswap Governor Bravo answers proposalCount()/quorumVotes() → GovernorBravo (1),
  //    voting token UNI (0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984).
  1: [
    { address: '0x323A76393544d5ecca80cd6ef2A560C6a395b7E3', framework: 0, label: 'ENS DAO' },
    { address: '0x408ED6354d4973f66138C91495F2f2FCbd8724C3', framework: 1, label: 'Uniswap' },
  ],
}

/** Seeded DAOs for a chain (network-scoped), or [] when none. */
export function knownDaosForChain(chainId) {
  return KNOWN_DAOS[Number(chainId)] || []
}

export default knownDaosForChain
