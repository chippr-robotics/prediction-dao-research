import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TaxReportsPanel from '../../components/wallet/TaxReportsPanel'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const NOW = Date.UTC(2026, 5, 18)

function hookOptions(saveAs) {
  return {
    account: USER,
    chainId: CHAIN_ID,
    createDataSource: () => makeFixtureDataSource(),
    getNetwork: () => ({ name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }),
    getEscrow: () => REGISTRY,
    saveAs,
    now: () => NOW,
  }
}

beforeEach(() => localStorage.clear())

describe('TaxReportsPanel (Story 1 + Story 2)', () => {
  it('generates a report and shows transfer count, totals, and downloads', async () => {
    const saveAs = vi.fn()
    render(<TaxReportsPanel hookOptions={hookOptions(saveAs)} />)

    // Custom range Jan–now 2026 (covers the fixture activity).
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))

    await waitFor(() => expect(screen.getByText(/5 transfer\(s\)/i)).toBeInTheDocument())
    expect(screen.getByText(/Totals/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }))
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }))
    expect(saveAs).toHaveBeenCalledTimes(2)

    // a history entry now appears
    await waitFor(() => expect(screen.getByText(/saved reports/i)).toBeInTheDocument())
  })

  it('shows a "no activity" empty state for an empty period', async () => {
    render(<TaxReportsPanel hookOptions={hookOptions(vi.fn())} />)
    fireEvent.click(screen.getByLabelText('Last calendar year'))
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    await waitFor(() => expect(screen.getByText(/no wager activity in this period/i)).toBeInTheDocument())
  })

  it('prompts to connect when no account', () => {
    render(<TaxReportsPanel hookOptions={{ ...hookOptions(vi.fn()), account: null }} />)
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument()
  })
})
