// Spec 032 — BackupPointerRegistry: per-wallet pointer to a wallet's latest encrypted backup (IPFS CID).
// Value-free, owner-self-writes-only, public reads. Hand-maintained (repo does not auto-generate frontend
// ABIs; the sync script only fills addresses). Refresh from the compiled artifact after contract changes.

export const BACKUP_POINTER_REGISTRY_ABI = [
  'function setPointer(string cid)',
  'function getPointer(address owner) view returns (string)',
  'function hasPointer(address owner) view returns (bool)',
  'event BackupPointerSet(address indexed owner, string cid, uint64 timestamp)',
]

/**
 * Canonical network hosting the unified backup pointer (spec 032 clarification) — Polygon mainnet (137) by
 * default. Overridable via VITE_BACKUP_CANONICAL_CHAIN_ID for testing against a test-network deploy (e.g. set
 * it to 63 to drive backup/restore against the Mordor BackupPointerRegistry). Production stays 137.
 */
export const BACKUP_CANONICAL_CHAIN_ID = Number(import.meta.env?.VITE_BACKUP_CANONICAL_CHAIN_ID) || 137

export default BACKUP_POINTER_REGISTRY_ABI
