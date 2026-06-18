/**
 * On-chain data source adapter for the wager tax/activity report
 * (spec 016-wager-tax-report; contracts/report-builder.md; research.md D1/D2).
 *
 * Strategy (chosen for scalability on public RPCs):
 *   - ENUMERATION via the subgraph (WagerRepository). Scanning the chain for a
 *     user's wagers from the deployment block is not viable on a public RPC
 *     (the node rejects wide `eth_getLogs` ranges → request floods / rate
 *     limits). The subgraph is the indexed, scalable path. When it is not
 *     configured we fail with a clear, actionable error rather than brute-force
 *     scanning from genesis.
 *   - PER-WAGER details (txHash + gas fee — which the subgraph cannot supply)
 *     are read from chain logs, but bounded to a TIGHT block window around each
 *     wager's `createdAt` (from the subgraph) with adaptive, shrink-on-limit
 *     chunking and a request budget. No genesis scans.
 *
 * Contract generations (resolved from synced config, never hardcoded):
 *   - v2 WagerRegistry: WagerCreated / WagerAccepted / PayoutClaimed /
 *     WagerRefunded / WagerCancelled / WagerDrawn
 *   - v1 FriendGroupMarketFactory (legacy): MarketCreatedPending /
 *     ParticipantAccepted / WinningsClaimed / StakeRefunded
 */

import { ethers } from 'ethers'
import { getContractAddressForChain, NETWORK_CONFIG, DEPLOYMENT_BLOCKS } from '../../config/contracts'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'
import { getDefaultWagerRepository } from '../wagers/WagerRepository'

const INITIAL_CHUNK = 5000
const MIN_CHUNK = 200
// Per-getWagerEvents request budget — bounds work for any single wager.
const SCAN_BUDGET = 60
// Approx block time (seconds) per chain, for timestamp → block estimation.
const BLOCK_TIME_SEC = { 137: 2, 80002: 2, 63: 13, 1337: 1 }
// Margin (seconds) before a wager's createdAt to start its event window.
const PRE_WINDOW_SEC = 3600

const V2 = {
  abi: WAGER_REGISTRY_ABI,
  valueEvents: ['WagerCreated', 'WagerAccepted', 'PayoutClaimed', 'WagerRefunded', 'WagerCancelled', 'WagerDrawn'],
}
const V1 = {
  abi: FRIEND_GROUP_MARKET_FACTORY_ABI,
  valueEvents: ['MarketCreatedPending', 'ParticipantAccepted', 'WinningsClaimed', 'StakeRefunded'],
}

function subgraphConfigured() {
  return Boolean(import.meta.env?.VITE_SUBGRAPH_URL)
}

function getProvider(opts = {}) {
  return opts.provider || new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl)
}

/** Resolve the escrow contract (prefer v2 WagerRegistry, fall back to v1 factory). */
export function resolveEscrow(chainId) {
  const registry = getContractAddressForChain('wagerRegistry', chainId)
  if (registry) return { address: registry, ...V2, deployBlock: DEPLOYMENT_BLOCKS.wagerRegistry || 0 }
  const factory = getContractAddressForChain('friendGroupMarketFactory', chainId)
  if (factory) return { address: factory, ...V1, deployBlock: DEPLOYMENT_BLOCKS.friendGroupMarketFactory || 0 }
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

/** Estimate a block number for a unix-second timestamp, clamped to [deployBlock, latest]. */
function estimateBlock(targetSec, ctx) {
  const delta = Math.max(0, Math.floor((ctx.latestSec - targetSec) / ctx.blockTimeSec))
  return Math.min(ctx.latestBlock, Math.max(ctx.deployBlock || 0, ctx.latestBlock - delta))
}

/**
 * queryFilter across a bounded block window with adaptive chunking: shrink the
 * chunk on "range exceeds limit" style errors, grow it back on success, and
 * stop with a clear error if the per-call request budget is exhausted.
 */
async function scanAdaptive(contract, filter, fromBlock, toBlock, label, budget) {
  const out = []
  let from = fromBlock
  let chunk = INITIAL_CHUNK
  while (from <= toBlock) {
    if (budget.used >= budget.max) {
      throw new Error(
        'This report period is too large to read from the network without the indexing subgraph. ' +
        'Try a shorter period, or configure VITE_SUBGRAPH_URL for full coverage.',
      )
    }
    const to = Math.min(from + chunk - 1, toBlock)
    budget.used += 1
    try {
      const logs = await contract.queryFilter(filter, from, to)
      out.push(...logs)
      from = to + 1
      if (chunk < INITIAL_CHUNK) chunk = Math.min(INITIAL_CHUNK, chunk * 2)
    } catch (err) {
      const msg = err?.message || ''
      if (/range|limit|exceed|too many|big/i.test(msg) && chunk > MIN_CHUNK) {
        chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 4))
        continue
      }
      console.warn(`[reportDataSource] ${label} scan ${from}-${to} failed:`, msg)
      from = to + 1
    }
  }
  return out
}

/**
 * Build the on-chain report data source for the active network.
 *
 * @param {object} [opts]
 * @param {number} [opts.chainId] - active chain id
 * @param {object} [opts.provider] - ethers provider (defaults to NETWORK_CONFIG rpc)
 * @param {object} [opts.contract] - escrow contract override (testing)
 * @param {object} [opts.repository] - WagerRepository override (testing)
 * @returns {object} dataSource
 */
export function createReportDataSource(opts = {}) {
  const provider = getProvider(opts)
  const chainId = opts.chainId
  const repository = opts.repository || getDefaultWagerRepository()
  // wagerId → createdAt (unix seconds), captured during enumeration for windowing.
  const createdAtById = new Map()

  let escrow = null
  let contract = null
  let chainCtx = null
  const ensureContract = () => {
    if (!contract) {
      escrow = resolveEscrow(chainId)
      contract = opts.contract || new ethers.Contract(escrow.address, escrow.abi, provider)
    }
    return contract
  }
  const ensureChainCtx = async () => {
    if (!chainCtx) {
      const latestBlock = await provider.getBlockNumber()
      const block = await provider.getBlock(latestBlock)
      chainCtx = {
        latestBlock,
        latestSec: Number(block?.timestamp ?? Math.floor(Date.now() / 1000)),
        blockTimeSec: BLOCK_TIME_SEC[Number(chainId)] || 2,
        deployBlock: escrow.deployBlock || 0,
      }
    }
    return chainCtx
  }

  return {
    async enumerateWagers({ account }) {
      if (!account) return []
      if (!subgraphConfigured()) {
        throw new Error(
          'Wager reporting requires the indexing subgraph (VITE_SUBGRAPH_URL) to be configured for this network.',
        )
      }
      const all = []
      let cursor = null
      for (let page = 0; page < 200; page++) {
        const res = await repository.listMyWagers({
          userAddress: account,
          cursor,
          pageSize: 100,
          filter: { includeExpired: true },
        })
        // Guard against the repository's legacy EventsSource fallback (it targets
        // the retired factory and cannot serve v2 reporting).
        if (String(res.source || '').includes('fallback') || res.source === 'events') {
          throw new Error('The reporting subgraph is unreachable right now. Please try again shortly.')
        }
        all.push(...(res.items || []))
        if (!res.hasMore || !res.nextCursor) break
        cursor = res.nextCursor
      }
      for (const w of all) {
        createdAtById.set(String(w.id), Math.floor((Number(w.createdAt) || 0) / 1000))
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
      const c = ensureContract()
      const ctx = await ensureChainCtx()
      const createdSec = createdAtById.get(String(wagerId)) || 0
      // Tight window: from shortly before the wager was created to the chain head.
      const fromBlock = createdSec > 0 ? estimateBlock(createdSec - PRE_WINDOW_SEC, ctx) : ctx.deployBlock
      const toBlock = ctx.latestBlock
      const budget = { used: 0, max: SCAN_BUDGET }
      const out = []
      for (const name of escrow.valueEvents) {
        const filter = c.filters[name](wagerId)
        const logs = await scanAdaptive(c, filter, fromBlock, toBlock, name, budget)
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
