import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTaxReport, REPORT_STATUS } from '../../hooks/useTaxReport'
import { PERIOD_KINDS } from '../../utils/reportPeriods'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const NOW = Date.UTC(2026, 5, 18)

function setup(overrides = {}) {
  const saveAs = vi.fn()
  const opts = {
    account: USER,
    chainId: CHAIN_ID,
    createDataSource: () => makeFixtureDataSource(),
    getNetwork: () => ({ name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }),
    getEscrow: () => REGISTRY,
    saveAs,
    now: () => NOW,
    ...overrides,
  }
  const view = renderHook(() => useTaxReport(opts))
  return { view, saveAs }
}

beforeEach(() => localStorage.clear())

describe('useTaxReport (contracts/reports-ui.md)', () => {
  it('starts idle with empty history', () => {
    const { view } = setup()
    expect(view.result.current.status).toBe(REPORT_STATUS.IDLE)
    expect(view.result.current.entries).toEqual([])
  })

  it('generates a populated report, reaches READY, and saves a history entry', async () => {
    const { view } = setup()
    await act(async () => {
      await view.result.current.generate({
        kind: PERIOD_KINDS.CUSTOM,
        from: Date.UTC(2026, 0, 1),
        to: NOW,
      })
    })
    expect(view.result.current.status).toBe(REPORT_STATUS.READY)
    expect(view.result.current.report.lineItems).toHaveLength(5)
    expect(view.result.current.report.lineItems[0].tokenTicker).toBe('USDC')
    await waitFor(() => expect(view.result.current.entries).toHaveLength(1))
    expect(view.result.current.entries[0].periodKind).toBe('custom')
  })

  it('reports an empty period as READY + isEmpty (not an error)', async () => {
    const { view } = setup()
    await act(async () => {
      await view.result.current.generate({ kind: PERIOD_KINDS.LAST_CALENDAR_YEAR })
    })
    expect(view.result.current.status).toBe(REPORT_STATUS.READY)
    expect(view.result.current.isEmpty).toBe(true)
  })

  it('rejects an invalid (inverted) range with an error and no history entry', async () => {
    const { view } = setup()
    await act(async () => {
      await view.result.current.generate({
        kind: PERIOD_KINDS.CUSTOM,
        from: Date.UTC(2026, 5, 1),
        to: Date.UTC(2026, 0, 1),
      })
    })
    expect(view.result.current.status).toBe(REPORT_STATUS.ERROR)
    expect(view.result.current.error).toMatch(/on or after the start date/)
    expect(view.result.current.entries).toHaveLength(0)
  })

  it('downloads PDF and CSV via the injected saver', async () => {
    const { view, saveAs } = setup()
    await act(async () => {
      await view.result.current.generate({
        kind: PERIOD_KINDS.CUSTOM, from: Date.UTC(2026, 0, 1), to: NOW,
      })
    })
    act(() => view.result.current.downloadPdf())
    act(() => view.result.current.downloadCsv())
    expect(saveAs).toHaveBeenCalledTimes(2)
    expect(saveAs.mock.calls[0][1]).toMatch(/\.pdf$/)
    expect(saveAs.mock.calls[1][1]).toMatch(/\.csv$/)
  })

  it('removes a history entry', async () => {
    const { view } = setup()
    await act(async () => {
      await view.result.current.generate({
        kind: PERIOD_KINDS.CUSTOM, from: Date.UTC(2026, 0, 1), to: NOW,
      })
    })
    await waitFor(() => expect(view.result.current.entries).toHaveLength(1))
    const id = view.result.current.entries[0].id
    act(() => view.result.current.removeEntry(id))
    expect(view.result.current.entries).toHaveLength(0)
  })
})
