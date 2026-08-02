import { useRef, useState } from 'react'
import { isValidWord, suggestWords } from '../../utils/claimCode/wordlist'

const SLOTS = 4
const MAX_SUGGESTIONS = 6

/**
 * Four-word phrase entry (spec 037 feedback). One box per word instead of a single free-text
 * field, with BIP-39 type-ahead completion and per-word validity feedback, so a mistyped word
 * is caught and correctable before all four are entered.
 *
 * Controlled: `words` is a 4-slot string array; `onChange(nextWords)` replaces it. Word-boundary
 * input (space / paste of a full phrase) distributes across slots and advances focus.
 *
 * @param {{ words: string[], onChange: (next: string[]) => void, disabled?: boolean, idPrefix?: string }} props
 */
export default function PhraseWordInputs({ words, onChange, disabled = false, idPrefix = 'phrase-word' }) {
  const inputRefs = useRef([])
  const [focused, setFocused] = useState(-1)
  const [activeSuggestion, setActiveSuggestion] = useState(0)

  const focusSlot = (i) => {
    const el = inputRefs.current[i]
    if (el) el.focus()
  }

  const setWord = (i, value) => {
    const next = words.slice()
    next[i] = value
    onChange(next)
  }

  // Put `word` in slot `i` and advance to the next slot (used by suggestion clicks + space/enter).
  const acceptWord = (i, word) => {
    const next = words.slice()
    next[i] = word
    onChange(next)
    setActiveSuggestion(0)
    if (i < SLOTS - 1) focusSlot(i + 1)
  }

  const suggestionsFor = (i) => (focused === i ? suggestWords(words[i], MAX_SUGGESTIONS) : [])

  const tokenize = (text) => text
    .normalize('NFKC').toLowerCase().replace(/[-_]+/g, ' ').trim()
    .split(/\s+/).filter(Boolean)

  // Lay `tokens` into consecutive slots starting at `start` and leave focus on the last one filled.
  const spreadWords = (start, tokens) => {
    const next = words.slice()
    for (let k = 0; k < tokens.length && start + k < SLOTS; k += 1) next[start + k] = tokens[k]
    onChange(next)
    setActiveSuggestion(0)
    focusSlot(Math.min(start + tokens.length, SLOTS - 1))
  }

  const handleChange = (i, raw) => {
    if (/\s/.test(raw)) {
      const tokens = tokenize(raw)
      // A whole phrase can land in one box without a paste event — autofill, voice typing, or a
      // paste the browser gave us no clipboardData for. Spread it like a paste; keeping only the
      // first word would silently discard three quarters of a valid phrase.
      if (tokens.length > 1) { spreadWords(i, tokens); return }
      // A single word plus a space finalizes it and jumps to the next slot.
      const head = tokens[0] || ''
      setWord(i, head)
      if (head && i < SLOTS - 1) focusSlot(i + 1)
      return
    }
    setWord(i, raw.toLowerCase())
    setActiveSuggestion(0)
  }

  // Pasting a whole phrase into any slot spreads its words across the remaining slots.
  const handlePaste = (i, e) => {
    const tokens = tokenize(e.clipboardData?.getData('text') || '')
    if (tokens.length <= 1) return // single word → let the default paste land in this box
    e.preventDefault()
    spreadWords(i, tokens)
  }

  const handleKeyDown = (i, e) => {
    const sugg = suggestionsFor(i)
    if (e.key === 'ArrowDown' && sugg.length) {
      e.preventDefault(); setActiveSuggestion((a) => (a + 1) % sugg.length); return
    }
    if (e.key === 'ArrowUp' && sugg.length) {
      e.preventDefault(); setActiveSuggestion((a) => (a - 1 + sugg.length) % sugg.length); return
    }
    if (e.key === ' ') {
      // Space accepts the highlighted suggestion (or the exact word) and advances.
      e.preventDefault()
      const pick = sugg[activeSuggestion] || (isValidWord(words[i]) ? words[i] : sugg[0])
      if (pick) acceptWord(i, pick)
      return
    }
    if (e.key === 'Enter' && sugg.length && !isValidWord(words[i])) {
      // Don't submit a partial word — complete it from the highlighted suggestion instead.
      e.preventDefault()
      acceptWord(i, sugg[activeSuggestion] || sugg[0])
      return
    }
    if (e.key === 'Backspace' && words[i] === '' && i > 0) {
      e.preventDefault(); focusSlot(i - 1)
    }
  }

  return (
    <div className="phrase-words" role="group" aria-label="Four-word phrase">
      {words.map((w, i) => {
        const valid = isValidWord(w)
        const sugg = suggestionsFor(i)
        // While the user is still typing a completable prefix, stay neutral; flag invalid once
        // the box is blurred, or when nothing in the list can complete what's typed.
        const showInvalid = w.trim() !== '' && !valid && (focused !== i || sugg.length === 0)
        return (
          <div className="phrase-word" key={i}>
            <input
              ref={(el) => { inputRefs.current[i] = el }}
              id={`${idPrefix}-${i}`}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              className={`phrase-word-input${valid ? ' is-valid' : ''}${showInvalid ? ' is-invalid' : ''}`}
              aria-label={`Word ${i + 1}`}
              aria-invalid={showInvalid || undefined}
              value={w}
              disabled={disabled}
              placeholder={`word #${i + 1}`}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={(e) => handlePaste(i, e)}
              onFocus={() => { setFocused(i); setActiveSuggestion(0) }}
              onBlur={() => setFocused((f) => (f === i ? -1 : f))}
            />
            {valid && <span className="phrase-word-check" aria-hidden="true">✓</span>}
            {sugg.length > 0 && (
              <ul className="phrase-suggestions" role="listbox" aria-label={`Suggestions for word ${i + 1}`}>
                {sugg.map((s, si) => (
                  <li key={s} role="option" aria-selected={si === activeSuggestion}>
                    <button
                      type="button"
                      className={`phrase-suggestion${si === activeSuggestion ? ' is-active' : ''}`}
                      // mousedown (not click) so it fires before the input's blur clears the list.
                      onMouseDown={(e) => { e.preventDefault(); acceptWord(i, s) }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
