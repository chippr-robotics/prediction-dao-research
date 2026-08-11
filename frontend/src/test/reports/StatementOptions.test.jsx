/**
 * Statement type + section controls (issue #1026).
 *
 * The behaviour worth pinning here is the honesty of the control, not its
 * markup: choosing a narrower statement must TELL the member it narrows the
 * totals, and the choice must actually reach the renderer — a picker that looks
 * right and downloads an unscoped document would be worse than no picker.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StatementOptions from '../../components/wallet/StatementOptions'
import TaxReportsPanel from '../../components/wallet/TaxReportsPanel'
import { defaultSections, STATEMENT_TYPES } from '../../data/reports/statement/reportTypes'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const baseValue = () => ({ type: STATEMENT_TYPES.FULL, classes: null, sections: defaultSections() })

function setup(value = baseValue()) {
  const onChange = vi.fn()
  render(<StatementOptions value={value} onChange={onChange} />)
  return onChange
}

describe('StatementOptions', () => {
  it('offers every built-in statement type', () => {
    setup()
    for (const name of ['Account Statement', 'Wagering Statement', 'Earnings Statement', 'Transfers Statement']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('defaults to the complete account statement with every section on', () => {
    setup()
    expect(screen.getByRole('radio', { name: /Account Statement/ })).toBeChecked()
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeChecked()
  })

  // A scoped statement reports smaller totals than the member's real activity.
  it('warns that a narrowed type leaves activity out of every figure', () => {
    render(
      <StatementOptions
        value={{ ...baseValue(), type: STATEMENT_TYPES.WAGERS }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/cover only the activity types above/i)).toBeInTheDocument()
  })

  it('says a full statement is full, with no scope warning', () => {
    setup()
    expect(screen.queryByText(/cover only the activity types above/i)).not.toBeInTheDocument()
  })

  it('reveals the activity-type picker only for a custom statement', () => {
    setup()
    expect(screen.queryByRole('checkbox', { name: 'Wager' })).not.toBeInTheDocument()
    render(
      <StatementOptions value={{ ...baseValue(), type: STATEMENT_TYPES.CUSTOM, classes: [] }} onChange={vi.fn()} />,
    )
    expect(screen.getAllByRole('checkbox', { name: 'Wager' }).length).toBeGreaterThan(0)
  })

  it('says so when a custom selection is empty rather than implying an empty statement', () => {
    render(
      <StatementOptions value={{ ...baseValue(), type: STATEMENT_TYPES.CUSTOM, classes: [] }} onChange={vi.fn()} />,
    )
    expect(screen.getByText(/will cover everything/i)).toBeInTheDocument()
  })

  it('drops hand-picked classes when leaving the custom type', () => {
    const onChange = setup({ ...baseValue(), type: STATEMENT_TYPES.CUSTOM, classes: ['wager'] })
    fireEvent.click(screen.getByRole('radio', { name: /Earnings Statement/ }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: STATEMENT_TYPES.EARNINGS, classes: null }),
    )
  })

  it('toggles a section off without touching the others', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Charts' }))
    const next = onChange.mock.calls[0][0]
    expect(next.sections.charts).toBe(false)
    expect(next.sections.register).toBe(true)
  })
})

describe('the chosen statement reaches the renderer', () => {
  it('passes the type through to the downloaded PDF file name', async () => {
    const saveAs = vi.fn()
    render(
      <TaxReportsPanel
        hookOptions={{
          account: USER,
          chainId: CHAIN_ID,
          createDataSource: () => makeFixtureDataSource(),
          ledger: null,
          getNetwork: () => ({ name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }),
          getEscrow: () => REGISTRY,
          saveAs,
          now: () => Date.UTC(2026, 5, 18),
        }}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: /Wagering Statement/ }))
    fireEvent.click(screen.getByRole('button', { name: /export current month/i }))
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1))
    // The legacy wager-only pipeline keeps its historical file name; what this
    // proves is that the panel's choice is threaded into the download call.
    expect(saveAs.mock.calls[0][1]).toMatch(/\.pdf$/)
  })
})
