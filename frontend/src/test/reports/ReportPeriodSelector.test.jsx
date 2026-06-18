import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportPeriodSelector from '../../components/wallet/ReportPeriodSelector'

const NOW = Date.UTC(2026, 5, 18)

describe('ReportPeriodSelector (FR-002/FR-013)', () => {
  it('renders the four presets plus a custom option', () => {
    render(<ReportPeriodSelector onGenerate={vi.fn()} nowMs={NOW} />)
    for (const name of ['Last month', 'Last quarter', 'Last year', 'Last calendar year', 'Custom range']) {
      expect(screen.getByLabelText(name)).toBeInTheDocument()
    }
  })

  it('emits the selected preset kind on generate', () => {
    const onGenerate = vi.fn()
    render(<ReportPeriodSelector onGenerate={onGenerate} nowMs={NOW} />)
    fireEvent.click(screen.getByLabelText('Last calendar year'))
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    expect(onGenerate).toHaveBeenCalledWith({ kind: 'last_calendar_year' })
  })

  it('emits custom from/to in ms on generate', () => {
    const onGenerate = vi.fn()
    render(<ReportPeriodSelector onGenerate={onGenerate} nowMs={NOW} />)
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-03-31' } })
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    expect(onGenerate).toHaveBeenCalledWith({
      kind: 'custom',
      from: Date.UTC(2026, 0, 1),
      to: Date.UTC(2026, 2, 31) + (24 * 3600 * 1000 - 1),
    })
  })

  it('disables generation and shows an error for an inverted custom range (FR-013)', () => {
    const onGenerate = vi.fn()
    render(<ReportPeriodSelector onGenerate={onGenerate} nowMs={NOW} />)
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-03-31' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-01-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/on or after the start date/i)
    expect(screen.getByRole('button', { name: /generate report/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('rejects a future end date (FR-013)', () => {
    render(<ReportPeriodSelector onGenerate={vi.fn()} nowMs={NOW} />)
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-12-31' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/future/i)
  })
})
