import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import TaxReportsPanel from '../../components/wallet/TaxReportsPanel'
import ReportHistoryList from '../../components/wallet/ReportHistoryList'
import StatementSheet from '../../components/wallet/reporting/StatementSheet'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const NOW = Date.UTC(2026, 5, 18)

const hookOptions = (saveAs = vi.fn()) => ({
  account: USER,
  chainId: CHAIN_ID,
  createDataSource: () => makeFixtureDataSource(),
  // Legacy wager-only pipeline against the wager fixtures (see reportParity.test.js).
  ledger: null,
  getNetwork: () => ({ name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }),
  getEscrow: () => REGISTRY,
  saveAs,
  now: () => NOW,
})

beforeEach(() => localStorage.clear())

describe('Tax Reports accessibility (WCAG 2.1 AA, Constitution V)', () => {
  it('the generate sheet has no axe violations', async () => {
    const { container } = render(
      <StatementSheet onClose={vi.fn()} onGenerate={vi.fn()} nowMs={NOW} networkName="Polygon" account="0xabc" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('history list has no axe violations', async () => {
    const entries = [{ id: 'e1', label: 'Last month (May 2026)', from: '2026-05-01T00:00:00.000Z', to: '2026-05-31T23:59:59.999Z', createdAt: '2026-06-01T10:00:00.000Z' }]
    const { container } = render(<ReportHistoryList entries={entries} onRedownload={vi.fn()} onRemove={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  // The custom type and the sections disclosure each reveal a second group of
  // controls — the states most likely to lose their labelling.
  it('the sheet has no axe violations with every group revealed', async () => {
    const { container } = render(
      <StatementSheet onClose={vi.fn()} onGenerate={vi.fn()} nowMs={NOW} networkName="Polygon" account="0xabc" />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    fireEvent.click(screen.getByRole('button', { name: /sections/i }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the panel has no axe violations after generating a report', async () => {
    const { container } = render(<TaxReportsPanel hookOptions={hookOptions()} />)
    fireEvent.click(screen.getByRole('button', { name: /new statement/i }))
    fireEvent.click(screen.getByRole('button', { name: /generate statement/i }))
    await waitFor(() => expect(screen.getByLabelText('Latest statement')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
