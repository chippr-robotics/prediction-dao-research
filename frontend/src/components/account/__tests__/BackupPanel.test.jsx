/**
 * Data backup panel — Recovery-tab presentation (spec 032 UX).
 *
 * The panel is a collapsed accordion section that reports its own state in one
 * line, and the two consequential actions (restore, remove) happen in a sheet
 * rather than by unfolding more controls into the page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

let ctx
vi.mock('../../../hooks/useDataBackup', () => ({ useDataBackup: () => ctx }))

import BackupPanel from '../BackupPanel'

beforeEach(() => {
  ctx = {
    available: true, isConnected: true, onCanonical: true, canonicalChainId: 137,
    status: 'idle', lastBackupAt: null, remoteState: 'none',
    refreshStatus: vi.fn(), backup: vi.fn(), restore: vi.fn(async () => ({ restored: true })), remove: vi.fn(),
  }
})

// The panel is a COLLAPSED accordion section on the Recovery tab, so tests that
// touch an in-body control open the section first — the same order a member does
// it in. (jsdom does not enforce `inert`, so skipping the expand would pass here
// and fail in a browser.)
function renderExpanded() {
  const utils = render(<BackupPanel />)
  fireEvent.click(screen.getByRole('button', { name: /data backup/i }))
  return utils
}

describe('BackupPanel', () => {
  it('starts collapsed and summarises that nothing is backed up yet', () => {
    render(<BackupPanel />)
    const trigger = screen.getByRole('button', { name: /data backup/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('No backup yet')).toBeInTheDocument()
    expect(screen.getByText('Not backed up')).toBeInTheDocument()
  })

  it('summarises the last backup date once one exists, with no attention badge', () => {
    ctx = { ...ctx, remoteState: 'yes', lastBackupAt: 1765000000000 }
    render(<BackupPanel />)
    expect(screen.getByText(/^Last backup /)).toBeInTheDocument()
    expect(screen.queryByText('Not backed up')).not.toBeInTheDocument()
  })

  it('restores from a sheet and closes it on success', async () => {
    ctx = { ...ctx, remoteState: 'yes' }
    renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /restore my data/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm merge/i }))
    await waitFor(() => expect(ctx.restore).toHaveBeenCalledWith('merge'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('confirms before removing the stored backup — the button alone never deletes', async () => {
    ctx = { ...ctx, remoteState: 'yes' }
    renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: /remove stored backup/i }))
    const dialog = screen.getByRole('dialog')
    expect(ctx.remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /keep it/i }))
    expect(ctx.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /remove stored backup/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^remove backup$/i }))
    await waitFor(() => expect(ctx.remove).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /*
   * The third state. `readPointer` separates "" (no pointer) from `null` (the read did not
   * complete), and this panel used to collapse both into "None found" plus a "Not backed up"
   * badge — a definite claim about the member's safety net that nothing established. The two
   * remedies diverge, which is what makes it worth a test: told they have no backup, a member
   * pays gas for one they may already have, or gives up on restoring one that exists.
   */
  it('never reports "no backup" from a read that did not complete', () => {
    ctx = { ...ctx, remoteState: 'unknown' }
    render(<BackupPanel />)
    expect(screen.queryByText('Not backed up')).not.toBeInTheDocument()
    expect(screen.queryByText('No backup yet')).not.toBeInTheDocument()
    expect(screen.getByText('Backup status unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /data backup/i }))
    expect(screen.getByText(/Couldn’t check/)).toBeInTheDocument()
    expect(screen.queryByText('None found')).not.toBeInTheDocument()
    // …and the consequences-of-having-none warning is not asserted either, because we do not
    // know that they have none.
    expect(screen.queryByText(/Without a backup/)).not.toBeInTheDocument()
    // Removing a backup we cannot confirm exists is not offered.
    expect(screen.queryByRole('button', { name: /remove stored backup/i })).not.toBeInTheDocument()
  })

  it('says so honestly when backup is unavailable on this network', () => {
    ctx = { ...ctx, available: false }
    render(<BackupPanel />)
    expect(screen.getByText('Not available on this network')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /data backup/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/isn’t available on this network yet/i)
    expect(screen.queryByRole('button', { name: /back up my data/i })).toBeNull()
  })
})
