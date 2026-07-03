import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import SetTimeModal from '../components/fairwins/SetTimeModal'
import { fromDatetimeLocal } from '../components/fairwins/wagerTimeline'

const MIN = Date.UTC(2026, 5, 1, 0, 0)
const MAX = Date.UTC(2026, 5, 30, 0, 0)
const VALUE = Date.UTC(2026, 5, 15, 12, 0)

function setup(props = {}) {
  const onCancel = vi.fn()
  const onSet = vi.fn()
  const utils = render(
    <SetTimeModal
      open
      label="Must be resolved by"
      value={VALUE}
      min={MIN}
      max={MAX}
      onCancel={onCancel}
      onSet={onSet}
      {...props}
    />
  )
  return { ...utils, onCancel, onSet }
}

describe('SetTimeModal (spec 038 US1)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SetTimeModal open={false} label="x" value={VALUE} min={MIN} max={MAX} onCancel={() => {}} onSet={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('opens as a labelled dialog pre-filled with the current value', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: /set date and time/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText(/must be resolved by/i)).toHaveValue('2026-06-15T12:00')
  })

  it('calls onSet with the parsed unix-ms value when a valid time is set', () => {
    const { onSet } = setup()
    const input = screen.getByLabelText(/must be resolved by/i)
    fireEvent.change(input, { target: { value: '2026-06-20T09:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(onSet).toHaveBeenCalledWith(fromDatetimeLocal('2026-06-20T09:30'))
  })

  it('disables Set and shows the allowed range when the input is out of bounds', () => {
    setup()
    const input = screen.getByLabelText(/must be resolved by/i)
    fireEvent.change(input, { target: { value: '2020-01-01T00:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/pick a time between/i)
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled()
  })

  it('calls onCancel on Cancel click, without calling onSet', () => {
    const { onCancel, onSet } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSet).not.toHaveBeenCalled()
  })

  it('calls onCancel on Escape', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel on backdrop click but not on dialog click', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    // The backdrop is the dialog's parent — click it directly (not a descendant).
    fireEvent.click(screen.getByRole('dialog').parentElement)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = setup()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
