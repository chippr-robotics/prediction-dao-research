import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PhraseWordInputs from '../components/fairwins/PhraseWordInputs'

// PhraseWordInputs is controlled; drive it through a tiny stateful harness.
function Harness({ initial = ['', '', '', ''] }) {
  const [words, setWords] = useState(initial)
  return (
    <>
      <PhraseWordInputs words={words} onChange={setWords} />
      <output data-testid="phrase">{words.join('|')}</output>
    </>
  )
}

const boxes = () => [0, 1, 2, 3].map((i) => screen.getByRole('textbox', { name: `Word ${i + 1}` }))

describe('PhraseWordInputs (four-word phrase entry with type-ahead)', () => {
  it('renders four labeled word boxes', () => {
    render(<Harness />)
    expect(boxes()).toHaveLength(4)
  })

  it('offers wordlist completions once typing starts and none for an empty box', () => {
    render(<Harness />)
    const [first] = boxes()
    fireEvent.focus(first)
    // Empty → no suggestion list.
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(first, { target: { value: 'ri' } })
    const list = screen.getByRole('listbox', { name: /suggestions for word 1/i })
    const options = within(list).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => o.textContent.startsWith('ri'))).toBe(true)
  })

  it('picking a suggestion fills that word and moves focus to the next box', () => {
    render(<Harness />)
    const [first, second] = boxes()
    fireEvent.focus(first)
    fireEvent.change(first, { target: { value: 'rive' } })
    const option = within(screen.getByRole('listbox')).getByText('river')
    fireEvent.mouseDown(option)
    expect(screen.getByTestId('phrase')).toHaveTextContent('river|||')
    expect(second).toHaveFocus()
  })

  it('a space finalizes the current word and advances', () => {
    render(<Harness />)
    const [first, second] = boxes()
    fireEvent.focus(first)
    fireEvent.change(first, { target: { value: 'amber ' } })
    expect(screen.getByTestId('phrase')).toHaveTextContent('amber|||')
    expect(second).toHaveFocus()
  })

  it('flags a mistyped word as invalid as soon as nothing can complete it', () => {
    render(<Harness />)
    const [first] = boxes()
    fireEvent.focus(first)
    fireEvent.change(first, { target: { value: 'zzzz' } })
    expect(first).toHaveClass('is-invalid')
    expect(first).toHaveAttribute('aria-invalid', 'true')
  })

  it('marks a complete, valid word (and shows its check)', () => {
    render(<Harness />)
    const [first] = boxes()
    fireEvent.change(first, { target: { value: 'river' } })
    expect(first).toHaveClass('is-valid')
    expect(first).not.toHaveClass('is-invalid')
  })

  it('pasting a full phrase spreads the words across all four boxes', () => {
    render(<Harness />)
    const [first] = boxes()
    fireEvent.paste(first, { clipboardData: { getData: () => 'crystal orbit harbor violet' } })
    expect(screen.getByTestId('phrase')).toHaveTextContent('crystal|orbit|harbor|violet')
  })
})
