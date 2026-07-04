// SPDX-License-Identifier: MIT
//
// Per-network configuration for the WagerPools deploy (spec 034, address-based).
//
// - `usdc` is the native Circle USDC per network (EIP-2612 + EIP-3009), the pool buy-in asset
//   (research.md §5). Addresses are env-overridable to honour the keystore/secret workflow.
// - No Semaphore / anonymity primitive is involved anymore — membership and voting are by public
//   wallet address, so there is no per-network verifier / self-deploy handling. Every network
//   (including Mordor/ETC) deploys the factory the same way.
//
// These are deploy-time defaults only; the frontend resolves live addresses from the generated
// sync artifacts (`getContractAddressForChain`), never from this file. The factory itself takes
// no token at init (token is chosen per-createPool); `usdc` here is used for logging/validation.

const WAGER_POOL_CONFIG = {
  // Polygon mainnet
  137: {
    name: 'polygon',
    usdc: process.env.POOL_USDC_137 || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  // Polygon Amoy testnet
  80002: {
    name: 'amoy',
    usdc: process.env.POOL_USDC_80002 || '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  },
  // Ethereum Classic Mordor testnet (no Semaphore prerequisite — deploys like any other net)
  63: {
    name: 'mordor',
    usdc: process.env.POOL_USDC_63 || null,
  },
};

/**
 * Hard cap on members per pool (FR-002a / SC-012); the protocol caps maxMembers at ~1,000.
 */
const MAX_MEMBERS_CAP = 1000;

function getWagerPoolConfig(chainId) {
  const cfg = WAGER_POOL_CONFIG[Number(chainId)];
  if (!cfg) throw new Error(`WagerPools: no config for chainId ${chainId}`);
  return cfg;
}

module.exports = {
  WAGER_POOL_CONFIG,
  MAX_MEMBERS_CAP,
  getWagerPoolConfig,
};
