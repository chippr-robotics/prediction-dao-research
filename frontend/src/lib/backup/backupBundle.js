// Spec 032 — the unified, network-tagged bundle. buildBundle gathers every registered object for a wallet;
// parseBundle validates the envelope's bundle (incl. that network-scoped elements carry chainId — FR-015a);
// applyBundle writes each object back in merge or replace mode. Pure (time arrives as nowMs; no Date.now).

import { syncedObjects } from './syncedObjects'

export const BUNDLE_SCHEMA = 'fairwins-data-backup'
export const BUNDLE_VERSION = 1

/** Build the unified per-wallet bundle from current local data. */
export function buildBundle(account, nowMs) {
  const objects = {}
  for (const o of syncedObjects) objects[o.key] = o.load(account)
  return {
    schema: BUNDLE_SCHEMA,
    version: BUNDLE_VERSION,
    createdAt: nowMs,
    wallet: account ? String(account).toLowerCase() : null,
    objects,
  }
}

/** Validate a decrypted bundle. Throws (⇒ "no usable backup") on a bad schema/shape or a network-scoped
 *  element missing its chainId — so a malformed/foreign bundle never overwrites good local data. */
export function parseBundle(obj) {
  if (!obj || obj.schema !== BUNDLE_SCHEMA || obj.version !== BUNDLE_VERSION) {
    throw new Error('Unrecognized backup bundle')
  }
  if (typeof obj.objects !== 'object' || obj.objects === null) {
    throw new Error('Malformed backup bundle')
  }
  for (const o of syncedObjects) {
    if (!o.networkScoped) continue
    const val = obj.objects[o.key]
    if (val === undefined) continue
    assertNetworkTagged(o.key, val)
  }
  return obj
}

/** Network-tag validation per object (FR-015a). Extend as new network-scoped objects are added. */
function assertNetworkTagged(key, val) {
  if (key === 'addressBook') {
    for (const contact of val?.contacts || []) {
      for (const addr of contact?.addresses || []) {
        if (typeof addr?.chainId !== 'number') {
          throw new Error(`Network-scoped element missing chainId in ${key}`)
        }
      }
    }
  }
  if (key === 'vaultReferences') {
    // Spec 043 — each vault reference carries a chainId (identity is (chainId, address)).
    for (const ref of Array.isArray(val) ? val : []) {
      if (typeof ref?.chainId !== 'number') {
        throw new Error(`Network-scoped element missing chainId in ${key}`)
      }
    }
  }
}

/** Apply a (validated) bundle to local data. mode: 'merge' (additive, default) | 'replace'. */
export function applyBundle(account, bundle, mode = 'merge') {
  const conflictsByObject = {}
  for (const o of syncedObjects) {
    const val = bundle?.objects?.[o.key]
    if (val === undefined) continue
    const res = o.apply(account, val, mode)
    if (res?.conflicts?.length) conflictsByObject[o.key] = res.conflicts
  }
  return { conflictsByObject }
}
