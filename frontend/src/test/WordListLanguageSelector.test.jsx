import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WordListLanguageSelector from '../components/pools/WordListLanguageSelector'
import { getWordListLang } from '../utils/wordListLanguage'

// T042 [US2] — the My Account word-list language selector renders, is labelled, and persists the choice.

describe('WordListLanguageSelector (US2)', () => {
  beforeEach(() => localStorage.clear())

  it('renders an accessible, labelled select defaulting to English', () => {
    render(<WordListLanguageSelector />)
    const select = screen.getByLabelText(/pool phrase language/i)
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('en')
  })

  it('persists the selected language and notifies via onChange', () => {
    const onChange = vi.fn()
    render(<WordListLanguageSelector onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/pool phrase language/i), { target: { value: 'ja' } })
    expect(onChange).toHaveBeenCalledWith('ja')
    expect(getWordListLang()).toBe('ja')
  })
})
