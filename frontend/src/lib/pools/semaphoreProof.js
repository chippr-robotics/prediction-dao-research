/**
 * In-browser Semaphore proof generation for ZK-Wager Pool voting/claiming (spec 034, FR-015).
 *
 * A member proves group membership anonymously: the proof reveals only a nullifier (one per scope) and
 * the message, never which member. For an approval the scope is the proposalId; for a claim it is the
 * pool's fixed claim scope and the message binds the payout recipient. The Semaphore packages and their
 * wasm/zkey artifacts are heavy, so they are code-split into a lazy chunk (static-specifier dynamic
 * imports) that only loads when a member actually votes/claims.
 *
 * NOTE: building the prover's group requires the full list of member identity commitments, which the
 * app reads on-chain from the pool's `Joined` events; callers pass `memberCommitments` explicitly.
 */

async function loadSemaphore() {
  // Static specifiers → Vite/Rollup code-split these into a lazy chunk (both are real dependencies;
  // see frontend/package.json). They only load on first vote/claim.
  try {
    const [groupMod, proofMod] = await Promise.all([
      import('@semaphore-protocol/group'),
      import('@semaphore-protocol/proof'),
    ])
    return { Group: groupMod.Group, generateProof: proofMod.generateProof }
  } catch (e) {
    throw new Error(`Could not load anonymous voting support (@semaphore-protocol/group,/proof): ${e?.message || e}`)
  }
}

/** Map a Semaphore V4 proof to the contract's SemaphoreProof tuple. */
function toSolidityProof(p) {
  return {
    merkleTreeDepth: p.merkleTreeDepth,
    merkleTreeRoot: p.merkleTreeRoot,
    nullifier: p.nullifier,
    message: p.message,
    scope: p.scope,
    points: p.points,
  }
}

/**
 * Generate a proof for the given scope/message against a group reconstructed from `memberCommitments`.
 * @param {object} args
 * @param {any} args.identity            the member's Semaphore Identity
 * @param {Array<bigint|string>} args.memberCommitments  all pool members' commitments (from the subgraph)
 * @param {bigint|string} args.message   the message (vote choice, or recipient for a claim)
 * @param {bigint|string} args.scope     the scope (proposalId, or the pool claim scope)
 * @param {number} [args.depth]          Merkle tree depth (default 16)
 * @returns {Promise<object>} a SemaphoreProof tuple for the contract
 */
export async function generatePoolProof({ identity, memberCommitments, message, scope, depth = 16 }) {
  const { Group, generateProof } = await loadSemaphore()
  const group = new Group(memberCommitments)
  const full = await generateProof(identity, group, message, scope, depth)
  return toSolidityProof(full)
}
