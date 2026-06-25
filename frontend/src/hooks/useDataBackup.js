/**
 * useDataBackup (spec 032) — orchestrates the explicit, member-initiated encrypted backup & restore.
 *
 * Backup:  build the unified network-tagged bundle → derive the wallet key → encrypt → pin to IPFS → record
 *          the pointer on the canonical network (one tx). Success is shown ONLY after the pin AND the pointer
 *          tx both confirm. Local data is only read during backup, never written — a failure leaves it intact.
 * Restore: read the pointer (free) → fetch by CID → decrypt → validate → merge/replace into local data. A
 *          missing pointer = "nothing to restore"; a corrupt/undecryptable backup = "no usable backup" — both
 *          leave local data untouched.
 *
 * No backend: encryption is client-side, storage is IPFS, the locator is on-chain. Strictly per-wallet.
 */
import { useCallback, useEffect, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { useNotification } from './useUI'
import { uploadJson, fetchByCid } from '../utils/ipfsService'
import { getUserPreference, saveUserPreference, removeUserPreference } from '../utils/userStorage'
import { deriveKey, encryptBundle, decryptBundle } from '../lib/backup/backupCrypto'
import { buildBundle, parseBundle, applyBundle } from '../lib/backup/backupBundle'
import { readPointer, writePointer, isBackupAvailable, CANONICAL_CHAIN_ID } from '../lib/backup/backupRegistry'

const SIZE_WARN_BYTES = 1024 * 1024 // ~1 MB soft cap (FR-021)
const LAST_BACKUP_KEY = 'data_backup_last_at'

// Session-only key cache (in-memory; cleared on reload or account change) so a backup+restore in one session
// doesn't double-prompt for the signature. Never persisted to disk.
let keyCache = { account: null, key: null }
function cachedKey(account) {
  const a = account ? String(account).toLowerCase() : null
  return keyCache.account === a ? keyCache.key : null
}
async function keyFor(signer, account) {
  const a = account ? String(account).toLowerCase() : null
  const hit = cachedKey(a)
  if (hit) return hit
  const key = await deriveKey(signer)
  keyCache = { account: a, key }
  return key
}

export function useDataBackup() {
  const { account, signer, chainId, isConnected, switchNetwork } = useWallet()
  const { showNotification } = useNotification()

  const [status, setStatus] = useState('idle') // 'idle' | 'backing-up' | 'restoring' | 'error'
  const [lastBackupAt, setLastBackupAt] = useState(null)
  const [hasRemote, setHasRemote] = useState(false)

  const available = isBackupAvailable()
  const onCanonical = Number(chainId) === CANONICAL_CHAIN_ID

  // Per-(account) status refresh: local last-backup time + whether an on-chain pointer exists. Honest reads.
  const refreshStatus = useCallback(async () => {
    if (!account) { setLastBackupAt(null); setHasRemote(false); return }
    setLastBackupAt(getUserPreference(account, LAST_BACKUP_KEY, null, true))
    try {
      const cid = await readPointer(account)
      setHasRemote(!!cid)
    } catch {
      setHasRemote(false)
    }
  }, [account])

  // On account change: drop any cached key and refresh status. All setState happens inside the async IIFE
  // (after an await / in the no-account branch) so it never runs synchronously during the effect.
  useEffect(() => {
    keyCache = { account: null, key: null }
    let cancelled = false
    ;(async () => {
      if (!account) {
        if (!cancelled) { setLastBackupAt(null); setHasRemote(false) }
        return
      }
      let remote = false
      try { remote = !!(await readPointer(account)) } catch { remote = false }
      if (!cancelled) {
        setLastBackupAt(getUserPreference(account, LAST_BACKUP_KEY, null, true))
        setHasRemote(remote)
      }
    })()
    return () => { cancelled = true }
  }, [account])

  const requireCanonical = useCallback(() => {
    if (onCanonical) return true
    showNotification(`Backing up records a pointer on Polygon (chain ${CANONICAL_CHAIN_ID}) — switch to Polygon to continue.`, 'warning')
    try { switchNetwork?.(CANONICAL_CHAIN_ID) } catch { /* member can switch manually */ }
    return false
  }, [onCanonical, switchNetwork, showNotification])

  const backup = useCallback(async () => {
    if (!signer || !account) { showNotification('Connect a wallet to back up.', 'warning'); return false }
    if (!available) { showNotification('Backup is not available on this network yet.', 'warning'); return false }
    if (!requireCanonical()) return false
    setStatus('backing-up')
    try {
      const key = await keyFor(signer, account) // wallet signature prompt (cached for the session)
      const bundle = buildBundle(account, Date.now())
      const envelope = encryptBundle(key, bundle)
      const size = new TextEncoder().encode(JSON.stringify(envelope)).length
      if (size > SIZE_WARN_BYTES) {
        showNotification('Your backup is over 1 MB — it may take longer to store, but will still proceed.', 'warning')
      }
      showNotification('Storing your encrypted backup, then recording the pointer — confirm the prompts in your wallet…', 'info', 0)
      const { cid } = await uploadJson(envelope, { namePrefix: 'data-backup' }) // pin (await)
      await writePointer(signer, cid) // pointer tx (await confirm)
      const now = Date.now()
      saveUserPreference(account, LAST_BACKUP_KEY, now, true)
      setLastBackupAt(now)
      setHasRemote(true)
      setStatus('idle')
      showNotification('Your data is backed up.', 'success')
      return true
    } catch (e) {
      setStatus('error')
      showNotification(e?.shortMessage || e?.reason || e?.message || 'Backup failed — your local data is unchanged.', 'error')
      return false // local data never written during backup
    }
  }, [signer, account, available, requireCanonical, showNotification])

  // mode: 'merge' (additive, default, non-destructive) | 'replace'
  const restore = useCallback(async (mode = 'merge') => {
    if (!signer || !account) { showNotification('Connect a wallet to restore.', 'warning'); return { restored: false, reason: 'no-wallet' } }
    if (!available) { showNotification('Backup is not available on this network yet.', 'warning'); return { restored: false, reason: 'unavailable' } }
    setStatus('restoring')
    try {
      const cid = await readPointer(account) // free, canonical read provider — works on any connected network
      if (cid === null) {
        setStatus('idle')
        showNotification("Couldn't reach the network to check for a backup — your local data is unchanged. Try again later.", 'error')
        return { restored: false, reason: 'unreachable' }
      }
      if (!cid) { setStatus('idle'); showNotification('No backup found to restore.', 'info'); return { restored: false, reason: 'none' } }
      let envelope
      try {
        envelope = await fetchByCid(cid)
      } catch {
        setStatus('idle')
        showNotification("Couldn't fetch your backup right now — your local data is unchanged. Try again later.", 'error')
        return { restored: false, reason: 'fetch-failed' }
      }
      let bundle
      try {
        const key = await keyFor(signer, account)
        bundle = parseBundle(decryptBundle(key, envelope))
      } catch {
        setStatus('idle')
        showNotification('That backup could not be read (no usable backup). Your local data is unchanged.', 'error')
        return { restored: false, reason: 'unusable' }
      }
      // Apply phase: a failure HERE may have partially written, so do NOT claim "unchanged".
      let conflictsByObject
      try {
        ({ conflictsByObject } = applyBundle(account, bundle, mode))
      } catch (e) {
        setStatus('error')
        showNotification(e?.shortMessage || e?.message || 'Restore could not be completed.', 'error')
        return { restored: false, reason: 'apply-failed' }
      }
      setStatus('idle')
      showNotification(mode === 'replace' ? 'Your data was replaced from the backup.' : 'Your backup was merged into your data.', 'success')
      return { restored: true, mode, conflictsByObject }
    } catch (e) {
      setStatus('idle')
      showNotification(e?.shortMessage || e?.message || 'Restore failed — your local data is unchanged.', 'error')
      return { restored: false, reason: 'error' }
    }
  }, [signer, account, available, showNotification])

  const remove = useCallback(async () => {
    if (!signer || !account) { showNotification('Connect a wallet.', 'warning'); return false }
    if (!available) return false
    if (!requireCanonical()) return false
    setStatus('backing-up')
    try {
      await writePointer(signer, '') // clear the pointer
      removeUserPreference(account, LAST_BACKUP_KEY)
      setLastBackupAt(null)
      setHasRemote(false)
      setStatus('idle')
      showNotification('Your stored backup was removed. Your local data is unchanged.', 'success')
      return true
    } catch (e) {
      setStatus('error')
      showNotification(e?.shortMessage || e?.message || 'Could not remove your backup.', 'error')
      return false
    }
  }, [signer, account, available, requireCanonical, showNotification])

  return {
    available,
    isConnected,
    onCanonical,
    canonicalChainId: CANONICAL_CHAIN_ID,
    status,
    lastBackupAt,
    hasRemote,
    refreshStatus,
    backup,
    restore,
    remove,
  }
}

export default useDataBackup
