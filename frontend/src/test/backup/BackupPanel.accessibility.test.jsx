import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'

// Spec 032 (FR-020) — the backup panel meets WCAG 2.1 AA, incl. the merge/replace restore region.

const ctx = {
  available: true, isConnected: true, onCanonical: true, canonicalChainId: 137,
  status: 'idle', lastBackupAt: 1765000000000, hasRemote: true,
  refreshStatus: vi.fn(), backup: vi.fn(), restore: vi.fn(), remove: vi.fn(),
}
vi.mock('../../hooks/useDataBackup', () => ({ useDataBackup: () => ctx }))

import BackupPanel from '../../components/account/BackupPanel'

describe('BackupPanel accessibility', () => {
  it('has no axe violations (default view)', async () => {
    const { container } = render(<BackupPanel />)
    expect(screen.getByRole('button', { name: /back up my data/i })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations with the restore merge/replace region open (replace warning shown)', async () => {
    const { container } = render(<BackupPanel />)
    fireEvent.click(screen.getByRole('button', { name: /restore my data/i }))
    fireEvent.click(screen.getByRole('radio', { name: /replace/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument() // replace warning
    expect(await axe(container)).toHaveNoViolations()
  })

  it('resets to the safe default (merge) after selecting Replace then cancelling/reopening', () => {
    render(<BackupPanel />)
    fireEvent.click(screen.getByRole('button', { name: /restore my data/i }))
    fireEvent.click(screen.getByRole('radio', { name: /replace/i }))
    expect(screen.getByRole('radio', { name: /replace/i }).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    fireEvent.click(screen.getByRole('button', { name: /restore my data/i })) // reopen
    expect(screen.getByRole('radio', { name: /merge/i }).checked).toBe(true)
    expect(screen.getByRole('radio', { name: /replace/i }).checked).toBe(false)
  })
})
