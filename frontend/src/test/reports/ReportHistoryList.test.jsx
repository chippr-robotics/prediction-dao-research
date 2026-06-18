import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportHistoryList from '../../components/wallet/ReportHistoryList'

const entries = [
  { id: 'e1', label: 'Last month (May 2026)', periodKind: 'last_month', from: '2026-05-01T00:00:00.000Z', to: '2026-05-31T23:59:59.999Z', createdAt: '2026-06-01T10:00:00.000Z' },
]

describe('ReportHistoryList (FR-010/FR-011)', () => {
  it('shows an empty state when there are no entries', () => {
    render(<ReportHistoryList entries={[]} />)
    expect(screen.getByText(/no saved reports yet/i)).toBeInTheDocument()
  })

  it('lists entries with their label and generation date', () => {
    render(<ReportHistoryList entries={entries} />)
    expect(screen.getByText('Last month (May 2026)')).toBeInTheDocument()
    expect(screen.getByText(/generated/i)).toBeInTheDocument()
  })

  it('re-downloads an entry as PDF or CSV', () => {
    const onRedownload = vi.fn()
    render(<ReportHistoryList entries={entries} onRedownload={onRedownload} />)
    fireEvent.click(screen.getByRole('button', { name: /as PDF/i }))
    fireEvent.click(screen.getByRole('button', { name: /as CSV/i }))
    expect(onRedownload).toHaveBeenNthCalledWith(1, entries[0], 'pdf')
    expect(onRedownload).toHaveBeenNthCalledWith(2, entries[0], 'csv')
  })

  it('removes an entry by id', () => {
    const onRemove = vi.fn()
    render(<ReportHistoryList entries={entries} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /^Remove/i }))
    expect(onRemove).toHaveBeenCalledWith('e1')
  })
})
