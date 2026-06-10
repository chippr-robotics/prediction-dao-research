/**
 * Best-effort DrawProposed / DrawRevoked event scan for wager notifications.
 *
 * Draw proposals are the one participant-relevant signal the WagerRegistry
 * struct reads cannot surface (spec 012 watcher-api), so the poll loop runs
 * this incremental log scan against the registry:
 *
 *   - `fromBlock` is the persisted watermark (`drawScanBlock`). A zero /
 *     missing watermark means "start tracking from the current tip" — no
 *     historical backfill (data-model.md).
 *   - The range fromBlock+1..tip is scanned in chunks of <= 9500 blocks
 *     (public RPCs commonly cap eth_getLogs at 10k blocks), at most 10
 *     chunks per call. When more blocks remain, `toBlock` is the last block
 *     actually scanned so the watermark advances incrementally.
 *   - Results are filtered to the caller's wagerIds (indexed-topic filter
 *     plus a post-filter for RPCs that ignore array topics) and ordered by
 *     (block, logIndex) so a later DrawRevoked supersedes an earlier
 *     DrawProposed for the same wager.
 *   - Best-effort contract: ANY failure (missing deployment, provider
 *     construction, RPC error) resolves { proposals: [], toBlock: fromBlock }
 *     — this never throws into the poll loop (FR-015).
 */

import { ethers } from 'ethers'
import { getContractAddressForChain } from '../../config/contracts'
import { getProvider } from '../../utils/blockchainService'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'

/** Blocks per eth_getLogs request (under common 10k public-RPC caps). */
const CHUNK_BLOCKS = 9500

/** Upper bound on chunks per call — keeps a single poll cycle bounded. */
const MAX_CHUNKS_PER_CALL = 10

/**
 * Scan the WagerRegistry for DrawProposed / DrawRevoked events on the given
 * wagers since the last watermark.
 *
 * @param {object} params
 * @param {number} params.chainId - Active chain id (registry + RPC selector)
 * @param {string[]} params.wagerIds - Wager ids the user participates in
 * @param {number} [params.fromBlock] - Last scanned block (exclusive);
 *   0/missing = no backfill, start from the current tip
 * @returns {Promise<{proposals: {wagerId: string, proposer: string, revoked: boolean}[], toBlock: number}>}
 *   Events in chronological (block, logIndex) order; `revoked` is false for
 *   DrawProposed and true for DrawRevoked. Resolves — never rejects.
 */
export async function scanDrawProposals({ chainId, wagerIds, fromBlock }) {
  const watermark = Number(fromBlock) || 0
  try {
    const address = getContractAddressForChain('wagerRegistry', chainId)
    if (!address) {
      throw new Error(`no wagerRegistry deployment for chain ${chainId}`)
    }

    const provider = getProvider(chainId)
    const tip = await provider.getBlockNumber()

    // Zero watermark: adopt the current tip without backfilling history —
    // pre-existing proposals surface via state, not as "new" notifications.
    if (watermark <= 0) return { proposals: [], toBlock: tip }

    // No new blocks since the last scan.
    if (watermark >= tip) return { proposals: [], toBlock: watermark }

    const ids = (wagerIds || []).map(String)
    // Nothing to match against — skip the log reads but still advance the
    // watermark so a later first-wager scan doesn't backfill this gap.
    if (ids.length === 0) return { proposals: [], toBlock: tip }

    const contract = new ethers.Contract(address, WAGER_REGISTRY_ABI, provider)
    const idTopics = ids.map(id => BigInt(id))
    const proposedFilter = contract.filters.DrawProposed(idTopics)
    const revokedFilter = contract.filters.DrawRevoked(idTopics)

    const found = []
    let from = watermark + 1
    let scannedTo = watermark
    for (let chunk = 0; chunk < MAX_CHUNKS_PER_CALL && from <= tip; chunk++) {
      const to = Math.min(from + CHUNK_BLOCKS - 1, tip)
      const [proposed, revoked] = await Promise.all([
        contract.queryFilter(proposedFilter, from, to),
        contract.queryFilter(revokedFilter, from, to),
      ])
      for (const ev of proposed) found.push({ ev, revoked: false })
      for (const ev of revoked) found.push({ ev, revoked: true })
      scannedTo = to
      from = to + 1
    }

    // Chronological order so consumers can fold the stream left-to-right and
    // let a later DrawRevoked supersede an earlier DrawProposed.
    found.sort((a, b) => {
      const byBlock = Number(a.ev.blockNumber ?? 0) - Number(b.ev.blockNumber ?? 0)
      if (byBlock !== 0) return byBlock
      return Number(a.ev.index ?? a.ev.logIndex ?? 0) - Number(b.ev.index ?? b.ev.logIndex ?? 0)
    })

    const idSet = new Set(ids)
    const proposals = []
    for (const { ev, revoked } of found) {
      const wagerId = ev?.args?.wagerId != null ? ev.args.wagerId.toString() : null
      // Post-filter: some RPCs ignore array-topic filters; never emit events
      // for wagers the user is not part of.
      if (!wagerId || !idSet.has(wagerId)) continue
      proposals.push({
        wagerId,
        proposer: String(ev.args.proposer || '').toLowerCase(),
        revoked,
      })
    }

    return { proposals, toBlock: scannedTo }
  } catch (err) {
    console.warn('[drawProposalScan] scan failed:', err?.message)
    return { proposals: [], toBlock: watermark }
  }
}
