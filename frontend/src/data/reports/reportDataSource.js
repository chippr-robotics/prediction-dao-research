/**
 * On-chain data source adapter for the wager tax/activity report
 * (spec 016-wager-tax-report; contracts/report-builder.md; research.md D1/D2).
 *
 * Implements the `dataSource` interface reportBuilder expects:
 *   enumerateWagers({account}) → wager[]      (via WagerRepository / subgraph)
 *   getWagerEvents(wagerId)    → events[]      (FriendGroupMarketFactory logs)
 *   getBlock(blockNumber)      → { timestamp } (RPC)
 *   getTransactionReceipt(tx)  → receipt       (RPC, for txHash + gas fee)
 *
 * The subgraph cannot supply transaction hashes or gas fees, so the per-wager
 * value-moving events are read from chain logs and enriched from receipts.
 * Mirrors EventsSource conventions (provider from NETWORK_CONFIG.rpcUrl, the
 * synced factory address + ABI). All addresses/ABIs come from synced config —
 * never hardcoded (Constitution V).
 */

import { ethers } from 'ethers'
import { getContractAddressForChain, NETWORK_CONFIG, DEPLOYMENT_BLOCKS } from '../../config/contracts'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'
import { getDefaultWagerRepository } from '../wagers/WagerRepository'

const SCAN_CHUNK = 10_000

/** The four factory events that move stablecoin value (research.md D2). */
const VALUE_EVENTS = ['MarketCreatedPending', 'ParticipantAccepted', 'WinningsClaimed', 'StakeRefunded']

function getProvider(opts = {}) {
  return opts.provider || new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
}

function getFactory(provider, chainId) {
  const address = getContractAddressForChain('friendGroupMarketFactory', chainId)
  if (!address) throw new Error('FriendGroupMarketFactory address not configured')
  return new ethers.Contract(address, FRIEND_GROUP_MARKET_FACTORY_ABI, provider)
}

/** Normalize an ethers EventLog into the report's { name, args, txHash, block } shape. */
function normalizeEvent(ev) {
  const a = ev.args || {}
  return {
    name: ev.fragment?.name || ev.eventName,
    transactionHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
    args: {
      friendMarketId: a.friendMarketId != null ? String(a.friendMarketId) : undefined,
      creator: a.creator,
      participant: a.participant,
      winner: a.winner,
      stakePerParticipant: a.stakePerParticipant != null ? a.stakePerParticipant.toString() : undefined,
      stakedAmount: a.stakedAmount != null ? a.stakedAmount.toString() : undefined,
      amount: a.amount != null ? a.amount.toString() : undefined,
      stakeToken: a.stakeToken,
      token: a.token,
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
  let factory = null
  const ensureFactory = () => (factory ||= getFactory(provider, chainId))

  return {
    async enumerateWagers({ account }) {
      if (!account) return []
      // Page through all of the user's wagers, including terminal ones (the
      // report needs resolved/refunded/cancelled wagers too).
      const all = []
      let cursor = null
      // Hard cap pages to avoid an unbounded loop on a misbehaving source.
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
      }))
    },

    async getWagerEvents(wagerId) {
      if (import.meta.env?.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') return []
      const contract = ensureFactory()
      const latest = await provider.getBlockNumber()
      const fromBlock = DEPLOYMENT_BLOCKS.friendGroupMarketFactory || 0
      const out = []
      for (const name of VALUE_EVENTS) {
        const filter = contract.filters[name](wagerId)
        let from = fromBlock
        while (from <= latest) {
          const to = Math.min(from + SCAN_CHUNK - 1, latest)
          try {
            const logs = await contract.queryFilter(filter, from, to)
            for (const ev of logs) out.push(normalizeEvent(ev))
          } catch (err) {
            console.warn(`[reportDataSource] ${name} scan ${from}-${to} failed:`, err?.message)
          }
          from = to + 1
        }
      }
      // Order by block so derivation sees deposits before payouts/refunds.
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
