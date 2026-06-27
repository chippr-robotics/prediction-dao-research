// SPDX-License-Identifier: MIT
//
// Per-network configuration for the ZK-Wager Pools deploy (spec 034).
//
// - Polygon mainnet (137) and Amoy (80002) use the canonical Semaphore V4 singletons
//   (same CREATE2 address across chains). VERIFY the Amoy address on-chain before relying
//   on it (research.md §3) — testnet deployments can lag/redeploy.
// - Ethereum Classic / Mordor is DEFERRED (a later increment): Semaphore must be
//   self-deployed there and builds pinned to evmVersion "shanghai" (research.md §3).
// - `usdc` is the native Circle USDC per network (EIP-2612 + EIP-3009), the pool buy-in asset
//   (research.md §5). Addresses are env-overridable to honour the keystore/secret workflow.
//
// These are deploy-time defaults only; the frontend resolves live addresses from the
// generated sync artifacts (`getContractAddressForChain`), never from this file.

const CANONICAL_SEMAPHORE_V4 = '0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D';
const CANONICAL_SEMAPHORE_V4_VERIFIER = '0x4DeC9E3784EcC1eE002001BfE91deEf4A48931f8';

const ZK_POOL_CONFIG = {
  // Polygon mainnet
  137: {
    name: 'polygon',
    semaphore: process.env.ZKPOOL_SEMAPHORE_137 || CANONICAL_SEMAPHORE_V4,
    semaphoreVerifier: process.env.ZKPOOL_SEMAPHORE_VERIFIER_137 || CANONICAL_SEMAPHORE_V4_VERIFIER,
    usdc: process.env.ZKPOOL_USDC_137 || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    selfDeploySemaphore: false,
    evmVersion: 'cancun',
  },
  // Polygon Amoy testnet (VERIFY Semaphore address on-chain before relying on it)
  80002: {
    name: 'amoy',
    semaphore: process.env.ZKPOOL_SEMAPHORE_80002 || CANONICAL_SEMAPHORE_V4,
    semaphoreVerifier: process.env.ZKPOOL_SEMAPHORE_VERIFIER_80002 || CANONICAL_SEMAPHORE_V4_VERIFIER,
    usdc: process.env.ZKPOOL_USDC_80002 || '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    selfDeploySemaphore: false,
    evmVersion: 'cancun',
  },
  // Ethereum Classic Mordor testnet — DEFERRED (self-deploy Semaphore; pin evmVersion shanghai)
  63: {
    name: 'mordor',
    semaphore: process.env.ZKPOOL_SEMAPHORE_63 || null,
    semaphoreVerifier: process.env.ZKPOOL_SEMAPHORE_VERIFIER_63 || null,
    usdc: process.env.ZKPOOL_USDC_63 || null,
    selfDeploySemaphore: true,
    evmVersion: 'shanghai',
    deferred: true,
  },
};

/**
 * Anonymity-set capacity. Depth 16 supports 65,536 members at constant per-proof verify cost
 * (FR-002a / SC-012); the protocol caps maxMembers at ~1,000.
 */
const MERKLE_TREE_DEPTH = 16;
const MAX_MEMBERS_CAP = 1000;

function getZkPoolConfig(chainId) {
  const cfg = ZK_POOL_CONFIG[Number(chainId)];
  if (!cfg) throw new Error(`ZK-Wager Pools: no config for chainId ${chainId}`);
  return cfg;
}

module.exports = {
  ZK_POOL_CONFIG,
  CANONICAL_SEMAPHORE_V4,
  CANONICAL_SEMAPHORE_V4_VERIFIER,
  MERKLE_TREE_DEPTH,
  MAX_MEMBERS_CAP,
  getZkPoolConfig,
};
