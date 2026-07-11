import { useEffect, useState } from 'react'
import { useDataBackup } from '../../hooks/useDataBackup'
import './BackupPanel.css'

/**
 * Account Center → Data backup (spec 032). Explicit, member-initiated encrypted backup & restore: the
 * member's data is encrypted with a wallet-derived key, stored on IPFS, and located trustlessly via an
 * on-chain pointer. Back up / restore (merge or replace) / remove, with honest status. No backend.
 */
function BackupPanel() {
  const { available, isConnected, onCanonical, canonicalChainId, canonicalName, status, lastBackupAt, hasRemote, refreshStatus, backup, restore, remove } = useDataBackup()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [mode, setMode] = useState('merge')

  useEffect(() => { refreshStatus() }, [refreshStatus])

  const busy = status === 'backing-up' || status === 'restoring'

  // Close the restore region and reset to the safe default — so reopening never lands on destructive Replace.
  const closeRestore = () => { setRestoreOpen(false); setMode('merge') }
  const onRestoreConfirm = async () => {
    const res = await restore(mode)
    if (res?.restored) closeRestore()
  }

  return (
    <section className="backup-panel" aria-labelledby="backup-heading">
      <h3 id="backup-heading" className="backup-title">Data backup</h3>
      <p className="backup-intro">
        Back up your address book, preferences, and activity history as a single <strong>encrypted</strong> file
        on IPFS, located by a trustless on-chain pointer. Only your wallet can read it — restore on any device
        with the same wallet. This is an explicit step; nothing leaves your device until you back up.
      </p>

      {!available ? (
        <div className="backup-notice" role="status">
          Backup isn’t available on this network yet. You can still export/import your address book from the
          Address Book tab as an offline fallback.
        </div>
      ) : (
        <>
          <dl className="backup-status">
            <div className="backup-status-row">
              <dt>Last backup</dt>
              <dd>{lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'Never'}</dd>
            </div>
            <div className="backup-status-row">
              <dt>Stored backup</dt>
              <dd>{hasRemote ? 'Yes — a backup exists for this wallet' : 'None found'}</dd>
            </div>
          </dl>

          {!hasRemote && (
            <p className="backup-notice" role="status">
              Without a backup, device-local activity history — sent transfers, failed operations, and earn
              actions — cannot be recovered if this device’s data is cleared. On-chain activity (wagers, pools,
              memberships) always rebuilds automatically.
            </p>
          )}

          {!onCanonical && (
            <p className="backup-notice" role="status">
              Backing up records a pointer on {canonicalName} (chain {canonicalChainId}). You’ll be asked to
              switch networks; restoring works from any network.
            </p>
          )}

          <div className="backup-actions">
            <button type="button" className="backup-btn backup-btn-primary" onClick={backup} disabled={!isConnected || busy} aria-disabled={!isConnected || busy}>
              {status === 'backing-up' ? 'Backing up…' : 'Back up my data'}
            </button>
            <button type="button" className="backup-btn" onClick={() => (restoreOpen ? closeRestore() : setRestoreOpen(true))} disabled={!isConnected || busy} aria-expanded={restoreOpen}>
              Restore my data
            </button>
            {hasRemote && (
              <button type="button" className="backup-btn backup-btn-danger" onClick={remove} disabled={!isConnected || busy}>
                Remove stored backup
              </button>
            )}
          </div>
          <p className="backup-cost">A backup includes a small on-chain transaction (gas) to record the pointer.</p>

          {restoreOpen && (
            <div className="backup-restore" role="group" aria-labelledby="backup-restore-q">
              <p id="backup-restore-q" className="backup-restore-q">How should the backup be applied to your current data?</p>
              <label className="backup-radio">
                <input type="radio" name="restore-mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                <span><strong>Merge</strong> — keep both your current data and the backup (recommended; nothing is lost).</span>
              </label>
              <label className="backup-radio">
                <input type="radio" name="restore-mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                <span><strong>Replace</strong> — overwrite your current data with the backup.</span>
              </label>
              {mode === 'replace' && (
                <p className="backup-warn" role="alert">Replace will overwrite your current address book and preferences with the backup.</p>
              )}
              <div className="backup-actions">
                <button type="button" className="backup-btn backup-btn-primary" onClick={onRestoreConfirm} disabled={busy}>
                  {status === 'restoring' ? 'Restoring…' : mode === 'replace' ? 'Confirm replace' : 'Confirm merge'}
                </button>
                <button type="button" className="backup-btn" onClick={closeRestore} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default BackupPanel
