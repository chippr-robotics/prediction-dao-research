/**
 * On-chain data source adapter for the wager tax/activity report
 * (spec 016-wager-tax-report; contracts/report-builder.md; research.md D1/D2).
 *
 * Implements the `dataSource` interface reportBuilder expects:
 *   enumerateWagers({account}) → wager[]      (escrow contract logs, by user)
 *   getWagerEvents(wagerId)    → events[]      (escrow contract logs, by wager)
 *   getBlock(blockNumber)      → { timestamp } (RPC)
 *   getTransactionReceipt(tx)  → receipt       (RPC, for txHash + gas fee)
 *
 * Self-contained: enumeration scans the escrow contract for events indexed by
 * the user's address, so the report does NOT depend on the subgraph or the
 * legacy EventsSource (which is hardwired to the retired FriendGroupMarketFactory
 * and threw "FriendGroupMarketFactory address not configured" on v2 networks).
 *
 * Two contract generations are supported, resolved from synced config per chain
 * (Constitution V — never hardcoded):
 *   - v2 WagerRegistry (Polygon/Amoy/Mordor/Hardhat): WagerCreated / WagerAccepted /
 *     PayoutClaimed / WagerRefunded / WagerCancelled / WagerDrawn
 *   - v1 FriendGroupMarketFactory (legacy): MarketCreatedPending /
 *     ParticipantAccepted / WinningsClaimed / StakeRefunded
 */

import { ethers } from 'ethers'
import { getContractAddressForChain, NETWORK_CONFIG, DEPLOYMENT_BLOCKS } from '../../config/contracts'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'

const SCAN_CHUNK = 10_000

// Value-moving events + the user-indexed enumeration filters per generation.
// Each enumeration entry is [eventName, ...topicArgs] where `null` is a wildcard
// and `'@user'` is replaced with the report subject's address.
const GENERATIONS = {
  v2: {
    abi: WAGER_REGISTRY_ABI,
    valueEvents: ['WagerCreated', 'WagerAccepted', 'PayoutClaimed', 'WagerRefunded', 'WagerCancelled', 'WagerDrawn'],
    enumeration: [
      ['WagerCreated', null, '@user'], // creator
      ['WagerCreated', null, null, '@user'], // opponent
      ['WagerAccepted', null, '@user'], // accepted by user
      ['PayoutClaimed', null, '@user'], // winner
    ],
  },
  v1: {
    abi: FRIEND_GROUP_MARKET_FACTORY_ABI,
    valueEvents: ['MarketCreatedPending', 'ParticipantAccepted', 'WinningsClaimed', 'StakeRefunded'],
    enumeration: [
      ['MarketCreatedPending', null, '@user'], // creator
      ['ParticipantAccepted', null, '@user'], // participant
      ['WinningsClaimed', null, '@user'], // winner
    ],
  },
}

function getProvider(opts = {}) {
  return opts.provider || new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
}

/**
 * Resolve the escrow contract for a chain: prefer the v2 WagerRegistry; fall
 * back to the legacy v1 FriendGroupMarketFactory. Returns the address, ABI, the
 * value-event list, the user-indexed enumeration filters, and the start block.
 */
export function resolveEscrow(chainId) {
  const registry = getContractAddressForChain('wagerRegistry', chainId)
  if (registry) {
    return { address: registry, ...GENERATIONS.v2, deployBlock: DEPLOYMENT_BLOCKS.wagerRegistry || 0 }
  }
  const factory = getContractAddressForChain('friendGroupMarketFactory', chainId)
  if (factory) {
    return { address: factory, ...GENERATIONS.v1, deployBlock: DEPLOYMENT_BLOCKS.friendGroupMarketFactory || 0 }
  }
  throw new Error('No wager escrow contract is configured for this network.')
}

/** Normalize an ethers EventLog into the report's { name, args, txHash, block } shape. */
export function normalizeEvent(ev) {
  const a = ev.args || {}
  const id = a.wagerId ?? a.friendMarketId
  const big = (v) => (v != null ? v.toString() : undefined)
  return {
    name: ev.fragment?.name || ev.eventName,
    transactionHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
    args: {
      wagerId: id != null ? String(id) : undefined,
      creator: a.creator,
      opponent: a.opponent,
      participant: a.participant,
      winner: a.winner,
      by: a.by,
      creatorStake: big(a.creatorStake),
      opponentStake: big(a.opponentStake),
      stakePerParticipant: big(a.stakePerParticipant),
      stakedAmount: big(a.stakedAmount),
      amount: big(a.amount),
      token: a.token ?? a.stakeToken,
    },
  }
}

/** Run a topic-filtered queryFilter across the block range in bounded chunks. */
async function scan(contract, provider, filter, fromBlock, latest, label) {
  const out = []
  let from = fromBlock || 0
  while (from <= latest) {
    const to = Math.min(from + SCAN_CHUNK - 1, latest)
    try {
      const logs = await contract.queryFilter(filter, from, to)
      out.push(...logs)
    } catch (err) {
      console.warn(`[reportDataSource] ${label} scan ${from}-${to} failed:`, err?.message)
    }
    from = to + 1
  }
  return out
}

/**
 * Build the on-chain report data source for the active network.
 *
 * @param {object} [opts]
 * @param {number} [opts.chainId] - active chain id (for chain-scoped address resolution)
 * @param {object} [opts.provider] - ethers provider (defaults to NETWORK_CONFIG rpc)
 * @param {object} [opts.contract] - escrow contract override (testing)
 * @returns {object} dataSource
 */
export function createReportDataSource(opts = {}) {
  const provider = getProvider(opts)
  const chainId = opts.chainId
  let escrow = null
  let contract = null
  const ensure = () => {
    if (!contract) {
      escrow = resolveEscrow(chainId)
      contract = opts.contract || new ethers.Contract(escrow.address, escrow.abi, provider)
    }
    return contract
  }

  return {
    async enumerateWagers({ account }) {
      if (!account) return []
      if (import.meta.env?.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') return []
      const c = ensure()
      const latest = await provider.getBlockNumber()
      // wagerId → wager context, built from the indexed enumeration logs.
      const byId = new Map()
      for (const [name, ...topics] of escrow.enumeration) {
        const args = topics.map((t) => (t === '@user' ? account : t))
        const filter = c.filters[name](...args)
        const logs = await scan(c, provider, filter, escrow.deployBlock, latest, name)
        for (const ev of logs) {
          const n = normalizeEvent(ev)
          const id = n.args.wagerId
          if (id == null) continue
          const existing = byId.get(id) || { id, participants: [account] }
          // Capture creator + stake token from the creation event when present.
          if (n.name === 'WagerCreated' || n.name === 'MarketCreatedPending') {
            existing.creator = n.args.creator || existing.creator
            existing.stakeTokenAddress = n.args.token || existing.stakeTokenAddress
          }
          byId.set(id, existing)
        }
      }
      return [...byId.values()]
    },

    async getWagerEvents(wagerId) {
      if (import.meta.env?.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') return []
      const c = ensure()
      const latest = await provider.getBlockNumber()
      const out = []
      for (const name of escrow.valueEvents) {
        const filter = c.filters[name](wagerId)
        const logs = await scan(c, provider, filter, escrow.deployBlock, latest, name)
        for (const ev of logs) out.push(normalizeEvent(ev))
      }
      return out.sort((a, b) => a.blockNumber - b.blockNumber)
    },

    async getBlock(blockNumber) {
      const block = await provider.getBlock(Number(blockNumber))
      return block ? { timestamp: Number(block.timestamp) } : null
    },

    async getTransactionReceipt(txHash) {
      const r = await provider.getTransactionReceipt(txHash)
      if (!r) return null
      return {
        from: r.from,
        gasUsed: r.gasUsed,
        effectiveGasPrice: r.gasPrice ?? r.effectiveGasPrice,
        blockNumber: r.blockNumber,
      }
    },
  }
}
