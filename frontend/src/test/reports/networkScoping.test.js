import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTaxReport } from '../../hooks/useTaxReport'
import { add as addHistory } from '../../data/reports/reportHistoryStore'
import { USER } from '../fixtures/wagers'

// FR-014 / Constitution III: a report's history must reflect ONLY the active
// network; switching chains must never surface another network's entries.

const entry = (label) => ({
  periodKind: 'last_month',
  from: '2026-05-01T00:00:00.000Z',
  to: '2026-05-31T23:59:59.999Z',
  label,
})

const opts = (chainId) => ({ account: USER, chainId })

beforeEach(() => localStorage.clear())

describe('report network scoping (FR-014)', () => {
  it('lists only the active chain\'s history', () => {
    addHistory(USER, 137, entry('polygon report'))
    addHistory(USER, 80002, entry('amoy report'))

    const polygon = renderHook(() => useTaxReport(opts(137)))
    expect(polygon.result.current.entries.map((e) => e.label)).toEqual(['polygon report'])

    const amoy = renderHook(() => useTaxReport(opts(80002)))
    expect(amoy.result.current.entries.map((e) => e.label)).toEqual(['amoy report'])
  })

  it('shows no entries on a chain with none, even when another chain has them', () => {
    addHistory(USER, 137, entry('polygon only'))
    const other = renderHook(() => useTaxReport(opts(63)))
    expect(other.result.current.entries).toEqual([])
  })
})
