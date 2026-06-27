// SPDX-License-Identifier: MIT
//
// Test helpers for ZK-Wager Pools (spec 034). These build identity commitments and
// Semaphore V4 `SemaphoreProof` tuples for use against {MockSemaphore} in unit/integration
// tests. They do NOT generate real Groth16 proofs — the mock validates the nullifier-reuse
// rule and a settable validity flag, so pool tally/threshold logic can be tested in isolation.
// Fork tests against the real Semaphore singleton use the @semaphore-protocol/proof packages.

const { ethers } = require('hardhat');

/**
 * Deterministic mock identity. In production the commitment is the Semaphore EdDSA identity
 * commitment; here we derive a stable pseudo-commitment from a seed so tests are reproducible.
 * @param {string|number} seed
 * @returns {{ secret: bigint, commitment: bigint }}
 */
function makeIdentity(seed) {
  const secret = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`zkpool-secret:${seed}`)));
  const commitment = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`zkpool-commitment:${seed}`)));
  return { secret, commitment };
}

/**
 * Build a SemaphoreProof tuple for {MockSemaphore.validateProof}. The nullifier is derived from
 * (identity seed, scope) so the same member voting twice on the same proposal reuses a nullifier
 * (the mock rejects it), while different scopes (proposals) yield uncorrelated nullifiers.
 * @param {object} p
 * @param {string|number} p.seed       identity seed
 * @param {bigint|string} p.scope      proposalId (as uint256)
 * @param {bigint|number} [p.message]  vote choice (default 1)
 * @param {bigint|number} [p.root]     merkle root (default 0 for the mock)
 * @param {number} [p.depth]           merkle tree depth (default 16)
 * @returns {object} SemaphoreProof struct
 */
function makeProof({ seed, scope, message = 1n, root = 0n, depth = 16 }) {
  const scopeBig = BigInt(scope);
  const nullifier = BigInt(
    ethers.keccak256(
      ethers.solidityPacked(['uint256', 'uint256'], [BigInt(makeIdentity(seed).secret), scopeBig])
    )
  );
  return {
    merkleTreeDepth: BigInt(depth),
    merkleTreeRoot: BigInt(root),
    nullifier,
    message: BigInt(message),
    scope: scopeBig,
    points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
  };
}

module.exports = { makeIdentity, makeProof };
