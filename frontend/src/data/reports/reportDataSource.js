/**
 * On-chain data source adapter for the wager tax/activity report
 * (spec 016-wager-tax-report; contracts/report-builder.md; research.md D1/D2).
 *
 * Implements the `dataSource` interface reportBuilder expects:
 *   enumerateWagers({account}) → wager[]      (via WagerRepository / subgraph)
 *   getWagerEvents(wagerId)    → events[]      (escrow contract logs)
 *   getBlock(blockNumber)      → { timestamp } (RPC)
 *   getTransactionReceipt(tx)  → receipt       (RPC, for txHash + gas fee)
 *
 * The subgraph cannot supply transaction hashes or gas fees, so the per-wager
 * value-moving events are read from chain logs and enriched from receipts.
 *
 * Two contract generations are supported, resolved from synced config per chain
 * (Constitution V — never hardcoded):
 *   - v2 WagerRegistry (Polygon/Amoy/Hardhat): WagerCreated / WagerAccepted /
 *     PayoutClaimed / WagerRefunded / WagerCancelled / WagerDrawn
 *   - v1 FriendGroupMarketFactory (legacy Mordor): MarketCreatedPending /
 *     ParticipantAccepted / WinningsClaimed / StakeRefunded
 */

import { ethers } from 'ethers'
import { getContractAddressForChain, NETWORK_CONFIG, DEPLOYMENT_BLOCKS } from '../../config/contracts'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'
import { getDefaultWagerRepository } from '../wagers/WagerRepository'

const SCAN_CHUNK = 10_000

// Value-moving events per contract generation.
const V2_EVENTS = ['WagerCreated', 'WagerAccepted', 'PayoutClaimed', 'WagerRefunded', 'WagerCancelled', 'WagerDrawn']
const V1_EVENTS = ['MarketCreatedPending', 'ParticipantAccepted', 'WinningsClaimed', 'StakeRefunded']

function getProvider(opts = {}) {
  return opts.provider || new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
}

/**
 * Resolve the escrow contract for a chain: prefer the v2 WagerRegistry; fall
 * back to the legacy v1 FriendGroupMarketFactory. Returns the address, ABI,
 * the value-event list, and the deployment start block.
 */
export function resolveEscrow(chainId) {
  const registry = getContractAddressForChain('wagerRegistry', chainId)
  if (registry) {
    return {
      address: registry,
      abi: WAGER_REGISTRY_ABI,
      valueEvents: V2_EVENTS,
      deployBlock: DEPLOYMENT_BLOCKS.wagerRegistry || 0,
    }
  }
  const factory = getContractAddressForChain('friendGroupMarketFactory', chainId)
  if (factory) {
    return {
      address: factory,
      abi: FRIEND_GROUP_MARKET_FACTORY_ABI,
      valueEvents: V1_EVENTS,
      deployBlock: DEPLOYMENT_BLOCKS.friendGroupMarketFactory || 0,
    }
  }
  throw new Error('No wager escrow contract is configured for this network.')
}

/** Normalize an ethers EventLog into the report's { name, args, txHash, block } shape. */
function normalizeEvent(ev) {
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

/**
 * Build the on-chain report data source for the active network.
 *
 * @param {object} [opts]
 * @param {number} [opts.chainId] - active chain id (for chain-scoped address resolution)
 * @param {object} [opts.repository] - WagerRepository (defaults to shared instance)
 * @param {object} [opts.provider] - ethers provider (defaults to NETWORK_CONFIG rpc)
 * @returns {object} dataSource
 */
export function createReportDataSource(opts = {}) {
  const repository = opts.repository || getDefaultWagerRepository()
  const provider = getProvider(opts)
  const chainId = opts.chainId
  let escrow = null
  let contract = null
  const ensure = () => {
    if (!contract) {
      escrow = resolveEscrow(chainId)
      contract = new ethers.Contract(escrow.address, escrow.abi, provider)
    }
    return contract
  }

  return {
    async enumerateWagers({ account }) {
      if (!account) return []
      const all = []
      let cursor = null
      for (let page = 0; page < 200; page++) {
        const res = await repository.listMyWagers({
          userAddress: account,
          cursor,
          pageSize: 100,
          filter: { includeExpired: true },
        })
        all.push(...(res.items || []))
        if (!res.hasMore || !res.nextCursor) break
        cursor = res.nextCursor
      }
      return all.map((w) => ({
        id: String(w.id),
        creator: w.creator,
        participants: w.participants || [],
        stakeTokenAddress: w.stakeTokenAddress,
        stakeAmount: w.stakeAmount,
      }))
    },

    async getWagerEvents(wagerId) {
      if (import.meta.env?.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') return []
      const c = ensure()
      const latest = await provider.getBlockNumber()
      const out = []
      for (const name of escrow.valueEvents) {
        const filter = c.filters[name](wagerId)
        let from = escrow.deployBlock || 0
        while (from <= latest) {
          const to = Math.min(from + SCAN_CHUNK - 1, latest)
          try {
            const logs = await c.queryFilter(filter, from, to)
            for (const ev of logs) out.push(normalizeEvent(ev))
          } catch (err) {
            console.warn(`[reportDataSource] ${name} scan ${from}-${to} failed:`, err?.message)
          }
          from = to + 1
        }
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
