import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PillSelect from '../components/ui/PillSelect'

const OPTIONS = [
  { value: 'a', label: 'Alpha', icon: '🅰️' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true, disabledReason: 'Not available on this network.' },
]

describe('PillSelect (spec 038 FR-009/FR-010)', () => {
  it('renders a radiogroup with one radio per option, checked matching value', () => {
    render(<PillSelect label="Who settles?" options={OPTIONS} value="b" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: /who settles/i })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /alpha/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: /beta/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('preserves the exact option values passed in and calls onChange with them', () => {
    const onChange = vi.fn()
    render(<PillSelect label="Who settles?" options={OPTIONS} value="a" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: /beta/i }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('renders a disabled option as visibly locked with an accessible explanation, and blocks selection', () => {
    const onChange = vi.fn()
    render(<PillSelect label="Who settles?" options={OPTIONS} value="a" onChange={onChange} />)
    const locked = screen.getByRole('radio', { name: /gamma/i })
    expect(locked).toBeDisabled()
    expect(locked).toHaveAttribute('aria-disabled', 'true')
    expect(locked).toHaveAttribute('title', 'Not available on this network.')
    fireEvent.click(locked)
    expect(onChange).not.toHaveBeenCalled()
    // The reason is exposed via aria-describedby, not stuffed into the name.
    const describedBy = locked.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy)).toHaveTextContent('Not available on this network.')
  })

  it('uses roving tabindex: the selected (enabled) option is the only tab stop', () => {
    render(<PillSelect label="Who settles?" options={OPTIONS} value="b" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /beta/i })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: /alpha/i })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('radio', { name: /gamma/i })).toHaveAttribute('tabindex', '-1')
  })

  it('falls back to the first enabled option as the tab stop when nothing enabled is selected', () => {
    render(<PillSelect label="Who settles?" options={OPTIONS} value="c" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /alpha/i })).toHaveAttribute('tabindex', '0')
  })

  it('arrow keys move selection between enabled options and skip disabled ones', () => {
    const onChange = vi.fn()
    render(<PillSelect label="Who settles?" options={OPTIONS} value="a" onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('radio', { name: /alpha/i }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('b') // skips locked 'c', wraps within enabled set
    onChange.mockClear()
    fireEvent.keyDown(screen.getByRole('radio', { name: /alpha/i }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('b') // wraps backward to the other enabled option
  })

  it('disables the whole group when disabled is passed', () => {
    render(<PillSelect label="Who settles?" options={OPTIONS} value="a" onChange={() => {}} disabled />)
    expect(screen.getByRole('radio', { name: /alpha/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /beta/i })).toBeDisabled()
  })
})
