import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import AmountKeypad from '../AmountKeypad'

/**
 * Controlled test harness — mirrors how the wager sheets drive AmountKeypad:
 * the parent owns the canonical stake string, the keypad edits it via onChange.
 */
function Harness({ initial = '', onChangeSpy, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <AmountKeypad
      value={value}
      onChange={(next) => { onChangeSpy?.(next); setValue(next) }}
      {...props}
    />
  )
}

const key = (name) => screen.getByRole('button', { name })
const hero = () => screen.getByTestId('amount-keypad-hero')

describe('AmountKeypad', () => {
  it('renders the zero state as $0 by default', () => {
    render(<Harness />)
    expect(hero()).toHaveTextContent('$0')
  })

  it('renders all pad keys as buttons (0-9, decimal, delete)', () => {
    render(<Harness />)
    for (let d = 0; d <= 9; d++) expect(key(String(d))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decimal/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('appends digits and updates the hero live', () => {
    render(<Harness />)
    fireEvent.click(key('1'))
    fireEvent.click(key('0'))
    expect(hero()).toHaveTextContent('$10')
  })

  it('supports a decimal and two fractional digits, capping further input', () => {
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} />)
    fireEvent.click(key('7'))
    fireEvent.click(screen.getByRole('button', { name: /decimal/i }))
    fireEvent.click(key('5'))
    fireEvent.click(key('0'))
    expect(hero()).toHaveTextContent('$7.50')
    // 3rd fractional digit is ignored (no-op)
    fireEvent.click(key('9'))
    expect(hero()).toHaveTextContent('$7.50')
    expect(spy).toHaveBeenLastCalledWith('7.50')
  })

  it('ignores a second decimal point', () => {
    render(<Harness />)
    fireEvent.click(key('3'))
    fireEvent.click(screen.getByRole('button', { name: /decimal/i }))
    fireEvent.click(screen.getByRole('button', { name: /decimal/i }))
    fireEvent.click(key('2'))
    expect(hero()).toHaveTextContent('$3.2')
  })

  it('treats a leading decimal as 0.', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /decimal/i }))
    fireEvent.click(key('5'))
    expect(hero()).toHaveTextContent('$0.5')
  })

  it('replaces a lone leading zero instead of producing 05', () => {
    render(<Harness />)
    fireEvent.click(key('0'))
    fireEvent.click(key('5'))
    expect(hero()).toHaveTextContent('$5')
  })

  it('backspaces to the zero state and emits empty string', () => {
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} />)
    fireEvent.click(key('4'))
    fireEvent.click(key('2'))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(hero()).toHaveTextContent('$4')
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(hero()).toHaveTextContent('$0')
    expect(spy).toHaveBeenLastCalledWith('')
  })

  it('renders the token indicator and prefix', () => {
    render(<Harness prefix="$" token="USDC" />)
    expect(hero()).toHaveTextContent('$0')
    expect(screen.getByText('USDC')).toBeInTheDocument()
  })

  it('supports a custom prefix', () => {
    render(<Harness prefix="" token="ETC" initial="1.5" />)
    expect(hero()).toHaveTextContent('1.5')
    expect(screen.getByText('ETC')).toBeInTheDocument()
  })

  it('blocks key activation when disabled', () => {
    const spy = vi.fn()
    render(<Harness disabled onChangeSpy={spy} />)
    fireEvent.click(key('5'))
    expect(spy).not.toHaveBeenCalled()
    expect(hero()).toHaveTextContent('$0')
  })

  it('exposes a live region announcing the current amount', () => {
    render(<Harness prefix="$" token="USDC" initial="12" />)
    const live = screen.getByRole('status')
    expect(live).toHaveTextContent(/12/)
    expect(live).toHaveTextContent(/USDC/)
  })

  it('accepts hardware keyboard digits, decimal and backspace', () => {
    render(<Harness />)
    const group = screen.getByRole('group')
    fireEvent.keyDown(group, { key: '9' })
    fireEvent.keyDown(group, { key: '.' })
    fireEvent.keyDown(group, { key: '9' })
    expect(hero()).toHaveTextContent('$9.9')
    fireEvent.keyDown(group, { key: 'Backspace' })
    expect(hero()).toHaveTextContent('$9.')
  })
})
