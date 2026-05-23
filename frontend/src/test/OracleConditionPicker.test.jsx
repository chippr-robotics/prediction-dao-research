import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import OracleConditionPicker from '../components/fairwins/OracleConditionPicker'

// Mock the hook so we can drive the picker's loading / list / error states
// from the test side. The hook is unit-tested separately in
// useOracleConditions.test.jsx; this file only validates the UI surface.
const { hookReturn } = vi.hoisted(() => ({ hookReturn: { current: { conditions: [], loading: false, error: null, refresh: () => {} } } }))
vi.mock('../hooks/useOracleConditions', () => ({
  useOracleConditions: () => hookReturn.current,
}))

const ADAPTER = '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23'

beforeEach(() => {
  hookReturn.current = { conditions: [], loading: false, error: null, refresh: vi.fn() }
})

describe('OracleConditionPicker', () => {
  it('renders the unavailable banner when the adapter address is missing', () => {
    render(<OracleConditionPicker kind="datafeed" adapterAddress="" value="" onChange={vi.fn()} />)
    expect(screen.getByText(/Chainlink Data Feed is not deployed/i)).toBeInTheDocument()
  })

  it('shows a Loading row while the hook is loading', () => {
    hookReturn.current.loading = true
    render(<OracleConditionPicker kind="datafeed" adapterAddress={ADAPTER} value="" onChange={vi.fn()} />)
    expect(screen.getByText(/Loading registered conditions/i)).toBeInTheDocument()
  })

  it('shows an empty-state row with a Refresh button when there are no conditions', () => {
    const refresh = vi.fn()
    hookReturn.current.refresh = refresh
    render(<OracleConditionPicker kind="uma" adapterAddress={ADAPTER} value="" onChange={vi.fn()} />)
    expect(screen.getByText(/No conditions registered/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an error row + Retry button when the hook surfaces an error', () => {
    const refresh = vi.fn()
    hookReturn.current = { conditions: [], loading: false, error: 'RPC down', refresh }
    render(<OracleConditionPicker kind="functions" adapterAddress={ADAPTER} value="" onChange={vi.fn()} />)
    expect(screen.getByText(/Couldn't read conditions from chain/i)).toBeInTheDocument()
    expect(screen.getByText(/RPC down/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    expect(refresh).toHaveBeenCalled()
  })

  it('renders a clickable row per registered condition and calls onChange when picked', async () => {
    hookReturn.current.conditions = [
      { conditionId: '0x' + 'aa'.repeat(32), description: '', expectedResolutionTime: 1700000000, isResolved: false, feed: '0xF0d50568e3A7e8259E16663972b11910F89BD8e7', threshold: 300000000000n, opLabel: '>', deadline: 1700000000 },
      { conditionId: '0x' + 'bb'.repeat(32), description: '', expectedResolutionTime: 1700001000, isResolved: false, feed: '0xF0d50568e3A7e8259E16663972b11910F89BD8e7', threshold: 350000000000n, opLabel: '>=', deadline: 1700001000 },
    ]
    const onChange = vi.fn()
    render(<OracleConditionPicker kind="datafeed" adapterAddress={ADAPTER} value="" onChange={onChange} />)

    const rows = screen.getAllByRole('option')
    expect(rows).toHaveLength(2)
    await userEvent.click(rows[0])
    expect(onChange).toHaveBeenCalledWith('0x' + 'aa'.repeat(32))
  })

  it('marks resolved conditions stale + disables them', () => {
    hookReturn.current.conditions = [
      { conditionId: '0x' + 'cc'.repeat(32), description: 'Stale claim', expectedResolutionTime: 7200, isResolved: true },
    ]
    render(<OracleConditionPicker kind="uma" adapterAddress={ADAPTER} value="" onChange={vi.fn()} />)
    const row = screen.getByRole('option')
    expect(row).toBeDisabled()
    expect(screen.getByText(/resolved — cannot reuse/i)).toBeInTheDocument()
  })

  it('renders adapter-specific row metadata', () => {
    hookReturn.current.conditions = [
      { conditionId: '0x' + 'dd'.repeat(32), description: 'Did the Patriots win Super Bowl LX?', expectedResolutionTime: 7200, isResolved: false },
    ]
    render(<OracleConditionPicker kind="uma" adapterAddress={ADAPTER} value="" onChange={vi.fn()} />)
    expect(screen.getByText(/Did the Patriots win Super Bowl LX\?/i)).toBeInTheDocument()
  })

  it('marks the selected row as aria-selected', () => {
    const cid = '0x' + 'ee'.repeat(32)
    hookReturn.current.conditions = [
      { conditionId: cid, description: '', expectedResolutionTime: 0, isResolved: false },
    ]
    render(<OracleConditionPicker kind="functions" adapterAddress={ADAPTER} value={cid} onChange={vi.fn()} />)
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true')
  })

  it('toggles manual paste mode and fires onChange with the pasted bytes32', async () => {
    const onChange = vi.fn()
    render(<OracleConditionPicker kind="datafeed" adapterAddress={ADAPTER} value="" onChange={onChange} />)
    await userEvent.click(screen.getByLabelText(/Paste conditionId manually/i))
    const input = screen.getByPlaceholderText(/0x \+ 64 hex chars/i)
    await userEvent.type(input, '0x' + 'ff'.repeat(32))
    await userEvent.click(screen.getByRole('button', { name: /Use this conditionId/i }))
    expect(onChange).toHaveBeenCalledWith('0x' + 'ff'.repeat(32))
  })

  it('shows the current selection with a Clear button', async () => {
    const onChange = vi.fn()
    const cid = '0x' + '12'.repeat(32)
    hookReturn.current.conditions = [{ conditionId: cid, description: '', expectedResolutionTime: 0, isResolved: false }]
    render(<OracleConditionPicker kind="functions" adapterAddress={ADAPTER} value={cid} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Clear/i }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('surfaces an external error message from the parent', () => {
    render(<OracleConditionPicker kind="datafeed" adapterAddress={ADAPTER} value="" onChange={vi.fn()} error="Pick a condition first." />)
    expect(screen.getByText('Pick a condition first.')).toBeInTheDocument()
  })
})
