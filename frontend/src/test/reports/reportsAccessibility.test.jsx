import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import TaxReportsPanel from '../../components/wallet/TaxReportsPanel'
import ReportPeriodSelector from '../../components/wallet/ReportPeriodSelector'
import ReportHistoryList from '../../components/wallet/ReportHistoryList'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const NOW = Date.UTC(2026, 5, 18)

const hookOptions = (saveAs = vi.fn()) => ({
  account: USER,
  chainId: CHAIN_ID,
  createDataSource: () => makeFixtureDataSource(),
  getNetwork: () => ({ name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }),
  getEscrow: () => REGISTRY,
  saveAs,
  now: () => NOW,
})

beforeEach(() => localStorage.clear())

describe('Tax Reports accessibility (WCAG 2.1 AA, Constitution V)', () => {
  it('period selector has no axe violations', async () => {
    const { container } = render(<ReportPeriodSelector onGenerate={vi.fn()} nowMs={NOW} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('history list has no axe violations', async () => {
    const entries = [{ id: 'e1', label: 'Last month (May 2026)', from: '2026-05-01T00:00:00.000Z', to: '2026-05-31T23:59:59.999Z', createdAt: '2026-06-01T10:00:00.000Z' }]
    const { container } = render(<ReportHistoryList entries={entries} onRedownload={vi.fn()} onRemove={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the panel has no axe violations after generating a report', async () => {
    const { container } = render(<TaxReportsPanel hookOptions={hookOptions()} />)
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    await waitFor(() => expect(screen.getByText(/5 transfer\(s\)/i)).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
