/**
 * Estate activity merge (spec 092) — the account's activity across every
 * chain in the build's cohort, as ONE stream, with per-chain honesty.
 *
 * This sits ABOVE the per-chain `listEntries` boundary on purpose: the
 * normalization layer's G5 guard (an entry whose chainId differs from its
 * query scope throws) stays in force because every underlying read remains
 * single-chain. The merge never mutates or re-tags an entry (research.md R1).
 *
 * Honesty rules (contracts/estate-activity.md):
 *   G1 never rejects — a failing chain becomes `unreachable`, siblings resolve;
 *   G2 cohort-bounded — cross-cohort ids are dropped before any read;
 *   G3 per-chain isolation, concurrent reads;
 *   G4 scope preservation — one chainId + that chain's provider per read;
 *   G5 dedup by entryId (identity embeds chainId, so the only real duplicates
 *      are reference-chain sources answering from several scopes);
 *   G6 repository ordering over the merged stream;
 *   G7 empty-but-read is `read` with entryCount 0 — genuinely empty, no warning.
 *
 * Pure factory: `index.js` wires the default repository + provider resolution
 * (avoiding an import cycle), tests inject everything.
 */
import { compareEntries } from './ledgerRepository'

/**
 * @param {object} deps
 * @param {(q:{account:string,chainId:number,provider:any}) => Promise<{entries:Array,staleClasses:string[],prunedBefore:number|null}>} deps.listEntries
 * @param {(chainId:number, walletChainId?:number, walletProvider?:any) => any} deps.readProviderFor - null ⇒ no connection
 * @param {(chainId:number) => boolean} deps.isInCohort
 * @param {() => number[]} [deps.cohortChainIds] - default chain set when the caller passes none
 */
export function createEstateLedger({ listEntries, readProviderFor, isInCohort, cohortChainIds }) {
  /**
   * @param {object} q - { account, chainIds?, walletChainId?, walletProvider? }
   * @returns {Promise<{entries:Array, chainStates:Array, partialChains:number[], staleByChain:Map, prunedByChain:Map}>}
   */
  async function listEntriesAcrossEstate(q) {
    const ids = (q.chainIds ?? (cohortChainIds ? cohortChainIds() : [])).filter((id) => isInCohort(id))

    const perChain = await Promise.all(
      ids.map(async (chainId) => {
        const provider = readProviderFor(chainId, q.walletChainId, q.walletProvider)
        if (!provider) {
          return { chainId, state: 'unreachable', reason: 'no read connection to this network' }
        }
        try {
          const res = await listEntries({ account: q.account, chainId, provider })
          return {
            chainId,
            state: 'read',
            entries: res.entries || [],
            staleClasses: res.staleClasses || [],
            prunedBefore: res.prunedBefore ?? null,
          }
        } catch (e) {
          return { chainId, state: 'unreachable', reason: e?.message || 'read failed' }
        }
      }),
    )

    const seen = new Set()
    const entries = []
    const chainStates = []
    const partialChains = []
    const staleByChain = new Map()
    const prunedByChain = new Map()

    for (const r of perChain) {
      if (r.state === 'unreachable') {
        chainStates.push({ chainId: r.chainId, state: 'unreachable', reason: r.reason, entryCount: 0 })
        partialChains.push(r.chainId)
        continue
      }
      // First occurrence wins; duplicates are byte-identical reference-chain
      // rows by construction (identity embeds chainId), so order is irrelevant.
      let count = 0
      for (const e of r.entries) {
        if (seen.has(e.entryId)) continue
        seen.add(e.entryId)
        entries.push(e)
        count++
      }
      chainStates.push({ chainId: r.chainId, state: 'read', entryCount: count })
      if (r.staleClasses.length) staleByChain.set(r.chainId, r.staleClasses)
      if (r.prunedBefore != null) prunedByChain.set(r.chainId, r.prunedBefore)
    }

    entries.sort(compareEntries)
    return { entries, chainStates, partialChains, staleByChain, prunedByChain }
  }

  return { listEntriesAcrossEstate }
}
