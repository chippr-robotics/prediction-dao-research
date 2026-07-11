/**
 * Merkl Distributor claim ABI (spec 050). Morpho distributes all current
 * rewards through Merkl (MIP-111); users claim by presenting the CUMULATIVE
 * earned amount + Merkle proof from the Merkl API. Parallel arrays, one slot
 * per reward token. The distributor transfers only the unclaimed difference,
 * so re-claiming with the same cumulative amount is a safe no-op.
 * Address comes from networks.js earn config — never from user/API input.
 */
export const MERKL_DISTRIBUTOR_ABI = [
  'function claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs)',
]

export default MERKL_DISTRIBUTOR_ABI
