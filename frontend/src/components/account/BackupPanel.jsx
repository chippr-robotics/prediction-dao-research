import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useDataBackup } from '../../hooks/useDataBackup'
import AccordionSection from './AccordionSection'
import ActionSheet from './ActionSheet'
import './BackupPanel.css'

/**
 * Account Center → Data backup (spec 032). Explicit, member-initiated encrypted backup & restore: the
 * member's data is encrypted with a wallet-derived key, stored on IPFS, and located trustlessly via an
 * on-chain pointer. Back up / restore (merge or replace) / remove, with honest status. No backend.
 *
 * The panel is a collapsible section on the Recovery tab: collapsed it reports when the last backup
 * happened, so the member can see the state of every recovery feature in one screen. Restore (a choice
 * between merge and replace) and remove (destructive) each take over a bottom sheet, so the decision is
 * made in one focused surface instead of unfolding more controls into the page.
 */
function BackupPanel({ defaultOpen = false }) {
  const { available, isConnected, onCanonical, canonicalChainId, canonicalName, status, lastBackupAt, hasRemote, refreshStatus, backup, restore, remove } = useDataBackup()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [mode, setMode] = useState('merge')

  useEffect(() => { refreshStatus() }, [refreshStatus])

  const busy = status === 'backing-up' || status === 'restoring'

  // Close the restore sheet and reset to the safe default — so reopening never lands on destructive Replace.
  const closeRestore = () => { setRestoreOpen(false); setMode('merge') }
  const onRestoreConfirm = async () => {
    const res = await restore(mode)
    if (res?.restored) closeRestore()
  }
  const onRemoveConfirm = async () => {
    await remove()
    setRemoveOpen(false)
  }

  // Collapsed-state summary: the one fact a member opens this section to check.
  const summary = !available
    ? 'Not available on this network'
    : lastBackupAt
      ? `Last backup ${new Date(lastBackupAt).toLocaleDateString()}`
      : hasRemote
        ? 'A backup exists for this account'
        : 'No backup yet'

  return (
    <>
      <AccordionSection
        id="backup"
        title="Data backup"
        summary={summary}
        badge={available && !hasRemote ? 'Not backed up' : null}
        badgeTone="warn"
        defaultOpen={defaultOpen}
        className="backup-panel"
      >
        <p className="backup-intro">
          Back up your address book, preferences, and activity history as a single <strong>encrypted</strong> file
          on IPFS, located by a trustless on-chain pointer. Only your account can read it — restore on any device
          where you sign in to the same account (wallet or passkey). This is an explicit step; nothing leaves your
          device until you back up.
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
              <button type="button" className="backup-btn" onClick={() => setRestoreOpen(true)} disabled={!isConnected || busy} aria-haspopup="dialog">
                Restore my data
              </button>
              {hasRemote && (
                <button type="button" className="backup-btn backup-btn-danger" onClick={() => setRemoveOpen(true)} disabled={!isConnected || busy} aria-haspopup="dialog">
                  Remove stored backup
                </button>
              )}
            </div>
            <p className="backup-cost">A backup includes a small on-chain transaction (gas) to record the pointer.</p>
          </>
        )}
      </AccordionSection>

      {/* Restore: the merge/replace choice gets its own focused surface — a centered card on
          desktop, a bottom sheet on mobile. Rendered outside the collapsible region so it is
          never inside an inert subtree. */}
      <ActionSheet open={restoreOpen} onClose={closeRestore} title="Restore my data" closeDisabled={busy}>
        <p id="backup-restore-q" className="backup-restore-q">How should the backup be applied to your current data?</p>
        <div role="radiogroup" aria-labelledby="backup-restore-q">
          <label className="backup-radio">
            <input type="radio" name="restore-mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span><strong>Merge</strong> — keep both your current data and the backup (recommended; nothing is lost).</span>
          </label>
          <label className="backup-radio">
            <input type="radio" name="restore-mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span><strong>Replace</strong> — overwrite your current data with the backup.</span>
          </label>
        </div>
        {mode === 'replace' && (
          <p className="backup-warn" role="alert">Replace will overwrite your current address book and preferences with the backup.</p>
        )}
        <div className="action-sheet__actions">
          <button type="button" className="backup-btn" onClick={closeRestore} disabled={busy}>Cancel</button>
          <button type="button" className="backup-btn backup-btn-primary" onClick={onRestoreConfirm} disabled={busy}>
            {status === 'restoring' ? 'Restoring…' : mode === 'replace' ? 'Confirm replace' : 'Confirm merge'}
          </button>
        </div>
      </ActionSheet>

      {/* Remove is destructive and was previously one unguarded click. */}
      <ActionSheet open={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove stored backup?" closeDisabled={busy}>
        <p className="action-sheet__text">
          This deletes the on-chain pointer to your encrypted backup. Your data on this device is untouched, but
          you won’t be able to restore it on another device until you back up again.
        </p>
        <div className="action-sheet__actions">
          <button type="button" className="backup-btn" onClick={() => setRemoveOpen(false)} disabled={busy}>Keep it</button>
          <button type="button" className="backup-btn backup-btn-danger" onClick={onRemoveConfirm} disabled={busy}>
            Remove backup
          </button>
        </div>
      </ActionSheet>
    </>
  )
}

BackupPanel.propTypes = {
  /** Start expanded (the Recovery tab keeps every section collapsed by default). */
  defaultOpen: PropTypes.bool,
}

export default BackupPanel
