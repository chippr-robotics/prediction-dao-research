/**
 * Activity engine (spec 031) — runs every registered ActivitySource for the active scope and aggregates their
 * results. It does NOT mutate or persist the store: it returns slice updates + the merged fresh entries +
 * per-domain action maps, and the provider applies them after re-reading the latest store (so a concurrent
 * markRead survives the cycle). Honest by construction: a source that fails (or throws) retains its prior
 * slice and prior action map — one source's failure never blanks the others (FR-020).
 *
 * @typedef {Object} ActivitySource
 * @property {string} key
 * @property {string} [label]
 * @property {(ctx:{account:string,chainId:number,nowMs:number,prior:{snapshots:object,aux:object}})=>Promise<object>} detect
 */

import { getSourceSlice } from './activityStore'

/**
 * @param {object} args
 * @param {ActivitySource[]} args.sources
 * @param {string} args.account
 * @param {number} args.chainId
 * @param {number} args.nowMs
 * @param {object} args.priorStore - the store as known at the start of the cycle (for each source's `prior`)
 * @param {object} [args.prevActionByDomain] - last cycle's action maps (retained for a failing source)
 * @returns {Promise<{sliceUpdates:object, fresh:object[], actionNeededByDomain:object, anyFailure:boolean, partialByDomain:object}>}
 */
export async function detectAll({ sources, account, chainId, nowMs, priorStore, prevActionByDomain = {} }) {
  const sliceUpdates = {}
  const fresh = []
  const actionNeededByDomain = {}
  const partialByDomain = {}
  let anyFailure = false

  // Sequential in registry order so `fresh` (and thus the toast cap) is deterministic; per-source network
  // reads still await independently. (Engine cost is dominated by I/O, not this loop.)
  for (const source of sources || []) {
    const prior = getSourceSlice(priorStore, source.key)
    let res
    try {
      res = await source.detect({ account, chainId, nowMs, prior })
    } catch {
      res = { ok: false }
    }
    if (!res || res.ok === false) {
      anyFailure = true
      actionNeededByDomain[source.key] = prevActionByDomain[source.key] || {}
      continue // retain prior slice (no sliceUpdate)
    }
    sliceUpdates[source.key] = { snapshots: res.nextSnapshots || {}, aux: res.nextAux || {} }
    if (Array.isArray(res.entries)) fresh.push(...res.entries)
    actionNeededByDomain[source.key] = res.actionNeededById || {}
    if (res.partial) partialByDomain[source.key] = true
  }

  return { sliceUpdates, fresh, actionNeededByDomain, anyFailure, partialByDomain }
}

/** Total truthy action-needed count across all domains' maps. */
export function countActionNeeded(actionNeededByDomain) {
  let n = 0
  for (const map of Object.values(actionNeededByDomain || {})) {
    for (const kind of Object.values(map || {})) if (kind) n += 1
  }
  return n
}
